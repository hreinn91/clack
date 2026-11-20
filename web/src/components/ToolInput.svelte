<script lang="ts">
  import { relativeTo } from '../lib/format';
  import { app } from '../lib/state.svelte';
  import Markdown from './Markdown.svelte';

  let { name, input }: { name: string; input: unknown } = $props();

  const fields = $derived((input && typeof input === 'object' ? input : {}) as Record<string, unknown>);
  const str = (value: unknown) => (typeof value === 'string' ? value : '');
  const path = $derived(relativeTo(str(fields.file_path), app.meta?.cwd));
  type Change = { path: string; kind: 'add' | 'delete' | 'update'; movePath?: string; diff: string };
</script>

{#if name === 'Bash'}
  <pre class="code">{str(fields.command)}</pre>
  {#if fields.description}<p class="note">{str(fields.description)}</p>{/if}
{:else if name === 'Edit'}
  <p class="path">{path}</p>
  <pre class="code del">{str(fields.old_string)}</pre>
  <pre class="code add">{str(fields.new_string)}</pre>
{:else if name === 'Write'}
  <p class="path">{path}</p>
  <pre class="code add">{str(fields.content)}</pre>
{:else if name === 'Patch' && Array.isArray(fields.changes)}
  {#each fields.changes as Change[] as change (change.path)}
    <p class="path">
      <span class="kind {change.kind}">{change.kind === 'add' ? 'New' : change.kind === 'delete' ? 'Deleted' : 'Changed'}</span>
      {relativeTo(change.path, app.meta?.cwd)}{#if change.movePath} → {relativeTo(change.movePath, app.meta?.cwd)}{/if}
    </p>
    {#if change.diff}
      <pre class="code diff">{#each change.diff.split('\n') as line, i (i)}<span class:add={line.startsWith('+') && !line.startsWith('+++')} class:del={line.startsWith('-') && !line.startsWith('---')} class:hunk={line.startsWith('@@')}>{line}
</span>{/each}</pre>
    {/if}
  {/each}
  {#if fields.grantRoot}<p class="note">It also asks to write anywhere in {str(fields.grantRoot)} for the rest of this chat.</p>{/if}
{:else if name === 'Permissions'}
  <pre class="code">{JSON.stringify(fields.permissions, null, 2)}</pre>
{:else if name === 'ExitPlanMode' && fields.plan}
  <Markdown text={str(fields.plan)} />
{:else}
  <pre class="code">{JSON.stringify(input, null, 2)}</pre>
{/if}

<style>
  .kind {
    display: inline-block;
    margin-right: 6px;
    padding: 0 6px;
    border: 1px solid var(--border);
    border-radius: 999px;
    color: var(--muted);
    font: 600 11px var(--font);
  }

  .kind.add {
    background: var(--add);
  }

  .kind.delete {
    background: var(--del);
  }

  .diff {
    padding-inline: 0;
  }

  /* Each line its own band, as a diff is usually read: added lines tinted one way, removed the other. */
  .diff span {
    display: block;
    padding-inline: 12px;
  }

  .diff .add {
    background: var(--add);
  }

  .diff .del {
    background: var(--del);
  }

  .diff .hunk {
    color: var(--muted);
  }

  .path,
  .note {
    margin: 0;
    color: var(--muted);
    font-size: 13px;
  }

  .path {
    font-family: var(--mono);
    overflow-wrap: anywhere;
  }
</style>
