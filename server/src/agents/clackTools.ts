import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { ArtifactError, artifactFile, createArtifact, listArtifacts, updateArtifact } from '../artifacts.ts';
import { stepsFromInput } from './types.ts';

// Clack's own tools, for both agents: Claude Code gets them in process (see
// claude/run.ts), Codex through a small MCP server that calls back here (see
// server/plugin/mcp/clack-tools.mjs). They make and change artifacts, which
// Clack keeps outside the chat's folder, where the agent cannot write itself,
// and show the person the steps of the work under way (update_steps), which
// the chat draws as a checklist (the chat's plan, see agents/*/plans).

export const CLACK_TOOL_NAMES = ['update_steps', 'create_artifact', 'update_artifact', 'list_artifacts', 'read_artifact'] as const;
export type ClackToolName = (typeof CLACK_TOOL_NAMES)[number];

/** Describes the tools the same way for both agents (JSON Schema, as MCP wants it). */
export const CLACK_TOOLS: {
  name: ClackToolName;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; openWorldHint?: boolean };
}[] = [
  {
    name: 'update_steps',
    description:
      'Show the person your plan for the request you are working on: a short checklist of the high-level steps, which Clack ' +
      'draws above your reply and ticks off as you go, with your tool calls folded under each step. Use it for every request ' +
      'that takes more than two or three actions: call it before your first other tool call, with 2 to 7 steps written as ' +
      'what each one achieves ("Find where the token is checked", "Add a regression test"), not as tool calls. Call it again, ' +
      'with the whole list, whenever a step starts or is done; keep one step in_progress while you work, and before your ' +
      'final answer mark every step completed or drop the ones that turned out not to be needed. The list may change as you ' +
      'learn more. Skip it for a quick answer or a single action. If you keep a to-do list with your own to-do tool for this ' +
      'request, that list is shown the same way and this tool is not needed.',
    inputSchema: {
      type: 'object',
      properties: {
        steps: {
          type: 'array',
          description: 'The whole checklist, in order.',
          items: {
            type: 'object',
            properties: {
              step: { type: 'string', description: 'A few words: what the step achieves.' },
              status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] },
            },
            required: ['step', 'status'],
          },
        },
      },
      required: ['steps'],
    },
    // It only changes what Clack shows: nothing in the folder, nothing outside.
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  {
    name: 'create_artifact',
    description:
      'Make an artifact: a self-contained page, app, document, diagram, picture or piece of code that the person can open, ' +
      'view and download in Clack, beside the chat. Use it for substantial things meant to be looked at or reused, not for ' +
      'short answers. Give the content, or the path of a file you made in the chat\'s folder. HTML must work offline: inline ' +
      'all CSS and JavaScript, load nothing from the internet. Returns the artifact\'s id, for update_artifact.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'A short title, as the person would call it.' },
        type: {
          type: 'string',
          enum: ['html', 'svg', 'markdown', 'mermaid', 'code', 'file'],
          description: 'html: a page or small app (one file). svg: a picture. markdown: a document. mermaid: a diagram. code: source code. file: any other file you made, by its path.',
        },
        content: { type: 'string', description: 'The whole content. Leave out when giving a path.' },
        language: { type: 'string', description: 'For code: the language, such as python or typescript.' },
        path: { type: 'string', description: 'A file in the chat\'s folder to keep as the artifact, instead of content. Needed for type file.' },
      },
      required: ['title', 'type'],
    },
  },
  {
    name: 'update_artifact',
    description:
      'Save a new version of an artifact made in this chat, when the person asks for changes. Give the whole new content ' +
      '(or a path), not a diff. Earlier versions are kept and can still be looked at.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The artifact\'s id, from create_artifact or list_artifacts.' },
        content: { type: 'string', description: 'The whole new content.' },
        path: { type: 'string', description: 'Or a file in the chat\'s folder to keep as the new version.' },
        title: { type: 'string', description: 'A new title, if it should change.' },
        note: { type: 'string', description: 'What changed, in a few words.' },
      },
      required: ['id'],
    },
  },
  {
    name: 'list_artifacts',
    description: 'List the artifacts made in this chat so far: id, title, type and latest version.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'read_artifact',
    description: 'Read the content of an artifact made in this chat (the latest version unless one is given), to change it.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, version: { type: 'number' } },
      required: ['id'],
    },
  },
];

/** A line the UI reads to show the artifact's card in the chat. */
export function artifactMarker(chatId: string, id: string, version: number): string {
  return `[clack-artifact chat=${chatId} id=${id} version=${version}]`;
}

/** Runs one of Clack's tools for a chat; the answer is text for the agent. Throws with a message it can act on. */
export async function runClackTool(chatId: string, cwd: string, name: string, args: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'create_artifact': {
      const meta = await createArtifact(chatId, cwd, args);
      return `Created the artifact "${meta.title}" (${meta.type}), version 1. Its id is ${meta.id}: use it with update_artifact for changes. The person can open it from the chat.\n${artifactMarker(chatId, meta.id, 1)}`;
    }
    case 'update_artifact': {
      const meta = await updateArtifact(chatId, cwd, args.id, args);
      const n = meta.versions.at(-1)!.n;
      return `Saved version ${n} of "${meta.title}".\n${artifactMarker(chatId, meta.id, n)}`;
    }
    case 'list_artifacts': {
      const all = await listArtifacts(chatId);
      if (!all.length) return 'No artifacts have been made in this chat yet.';
      return all.map((a) => `${a.id}: "${a.title}" (${a.type}, version ${a.versions.at(-1)?.n ?? 1})`).join('\n');
    }
    case 'update_steps': {
      const steps = stepsFromInput(args);
      if (!steps) throw new ArtifactError(400, 'Give the steps as a list of { step, status }.');
      const done = steps.filter((step) => step.status === 'completed').length;
      return `Shown: ${done} of ${steps.length} done.`;
    }
    case 'read_artifact': {
      if (typeof args.id !== 'string') throw new ArtifactError(400, 'Which artifact?');
      const version = typeof args.version === 'number' ? args.version : undefined;
      const { meta, path, version: n } = await artifactFile(chatId, args.id, version);
      if (meta.type === 'file') return `"${meta.title}" is a ${meta.ext} file (version ${n}); it cannot be read as text here.`;
      return `"${meta.title}", version ${n}:\n\n${await readFile(path, 'utf8')}`;
    }
    default:
      throw new ArtifactError(400, `Clack has no tool called ${name}.`);
  }
}

/** The secret Clack's MCP server for Codex sends back with each call; made fresh at every start. */
export const toolToken = randomBytes(32).toString('base64url');

export function validToolToken(given: unknown): boolean {
  if (typeof given !== 'string') return false;
  const a = Buffer.from(given);
  const b = Buffer.from(toolToken);
  return a.length === b.length && timingSafeEqual(a, b);
}
