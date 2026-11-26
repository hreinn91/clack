import type { Artifact } from '../../../shared/protocol';
import { api } from './api';

// Artifacts the agents made in chats, kept on the server. In a chat they open
// in a panel that takes the sidebar's place on the left (one or the other,
// never both); the Artifacts page lists them all.

const WIDTH_KEY = 'clack.artifactsWidth';
const MODE_KEY = 'clack.artifactMode';

/** How wide the panel may be: room for the chat stays. */
export const PANEL = { min: 320, chatRoom: 380 };

function savedWidth(): number {
  try {
    const width = Number(localStorage.getItem(WIDTH_KEY));
    if (width >= PANEL.min) return width;
  } catch {
    // Not saved.
  }
  return 0;
}

class ArtifactsState {
  all = $state<Artifact[]>([]);
  loaded = $state(false);
  /** The panel is open in place of the sidebar. */
  panelOpen = $state(false);
  /** What the panel or the Artifacts page shows; a null version follows the latest. */
  current = $state<{ chatId: string; id: string; version: number | null } | null>(null);
  /** The page as it looks, or its source. Kept in this browser. */
  mode = $state<'preview' | 'code'>(localStorage.getItem(MODE_KEY) === 'code' ? 'code' : 'preview');
  /** The panel's width in pixels; 0 until set, which means 45% of the window. */
  width = $state(savedWidth());

  #seq = 0;

  async load(): Promise<void> {
    const seq = ++this.#seq;
    try {
      const all = await api<Artifact[]>('/api/artifacts');
      if (seq !== this.#seq) return;
      this.all = all;
      this.loaded = true;
      // The one being shown was deleted (here or elsewhere): show the chat's next one, or close.
      if (this.current && !this.find(this.current.chatId, this.current.id)) {
        const next = this.forChat(this.current.chatId)[0];
        if (next) this.current = { chatId: next.chatId, id: next.id, version: null };
        else {
          this.current = null;
          this.panelOpen = false;
        }
      }
    } catch {
      // Tried again on the next change or reconnect.
    }
  }

  forChat(chatId: string | null | undefined): Artifact[] {
    if (!chatId) return [];
    const id = chatId.toLowerCase();
    return this.all.filter((a) => a.chatId === id);
  }

  find(chatId: string, id: string): Artifact | undefined {
    const chat = chatId.toLowerCase();
    return this.all.find((a) => a.chatId === chat && a.id === id);
  }

  /** Width of the panel to use now, worked out from the window when none was chosen. */
  panelWidth(windowWidth: number): number {
    const most = Math.max(PANEL.min, windowWidth - 70 - PANEL.chatRoom);
    const wanted = this.width || Math.round(windowWidth * 0.45);
    return Math.max(PANEL.min, Math.min(most, wanted));
  }

  resize(width: number): void {
    this.width = Math.max(PANEL.min, Math.round(width));
    try {
      localStorage.setItem(WIDTH_KEY, String(this.width));
    } catch {
      // Not remembered this time.
    }
  }

  setMode(mode: 'preview' | 'code'): void {
    this.mode = mode;
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch {
      // Not remembered this time.
    }
  }

  /** Opens an artifact in the chat's panel (on the chat's page) or wherever it is being shown. */
  open(chatId: string, id: string, version: number | null = null): void {
    this.current = { chatId: chatId.toLowerCase(), id, version };
    this.panelOpen = true;
  }

  /** Opens the panel on the chat's latest artifact, or closes it. */
  togglePanel(chatId: string): void {
    if (this.panelOpen) {
      this.panelOpen = false;
      return;
    }
    const keep = this.current && this.current.chatId === chatId.toLowerCase() && this.find(this.current.chatId, this.current.id);
    const first = this.forChat(chatId)[0];
    if (!keep && !first) return;
    if (!keep) this.current = { chatId: first!.chatId, id: first!.id, version: null };
    this.panelOpen = true;
  }

  closePanel(): void {
    this.panelOpen = false;
  }

  /** The file of a version (the latest by default), to show, open or download. */
  rawUrl(artifact: Artifact, version?: number | null, download = false): string {
    const params = new URLSearchParams();
    if (version) params.set('v', String(version));
    if (download) params.set('download', '1');
    const query = params.toString();
    return `/api/artifacts/${artifact.chatId}/${artifact.id}/raw${query ? `?${query}` : ''}`;
  }

  async remove(artifact: Artifact): Promise<void> {
    await api(`/api/artifacts/${artifact.chatId}/${artifact.id}`, undefined, 'DELETE');
    await this.load();
  }

  /** Every artifact of a chat, such as one that was deleted. */
  async removeChat(chatId: string): Promise<void> {
    await api(`/api/artifacts/${chatId}`, undefined, 'DELETE');
    await this.load();
  }
}

export const artifacts = new ArtifactsState();

/** The tool calls that make or change an artifact, whichever agent made them. */
export function isArtifactTool(name: string): boolean {
  return /^mcp__clack__(create|update)_artifact$/.test(name);
}

/** The artifact a tool call made or changed, from the line Clack puts in its result. */
export function artifactOfResult(text: string | undefined): { chatId: string; id: string; version: number } | null {
  const match = /\[clack-artifact chat=([0-9a-f-]{36}) id=([a-z0-9-]+) version=(\d+)\]/i.exec(text ?? '');
  return match ? { chatId: match[1]!.toLowerCase(), id: match[2]!, version: Number(match[3]) } : null;
}

export const TYPE_LABEL: Record<Artifact['type'], string> = {
  html: 'Page',
  svg: 'Picture',
  markdown: 'Document',
  mermaid: 'Diagram',
  code: 'Code',
  file: 'File',
};
