<script lang="ts">
  import type { Item } from '../../../shared/protocol';
  import { relativeTo } from '../lib/format';
  import { app } from '../lib/state.svelte';
  import ToolInput from './ToolInput.svelte';

  let { item }: { item: Extract<Item, { kind: 'tool' }> } = $props();

  const status = $derived(
    item.result ? (item.result.isError ? 'error' : 'done') : app.running ? 'running' : 'stopped',
  );

  /** The one argument that says what this call is about. */
  const summary = $derived.by(() => {
    const f = (item.input && typeof item.input === 'object' ? item.input : {}) as Record<string, unknown>;
    const str = (value: unknown) => (typeof value === 'string' ? value : '');
    const cwd = app.meta?.cwd;
    switch (item.name) {
      case 'Bash':
        return str(f.command);
      case 'Read':
      case 'Write':
      case 'Edit':
        return relativeTo(str(f.file_path), cwd);
      case 'NotebookEdit':
        return relativeTo(str(f.notebook_path), cwd);
      case 'Glob':
      case 'Grep':
        return str(f.pattern) + (f.path ? ` in ${relativeTo(str(f.path), cwd)}` : '');
      case 'WebFetch':
        return str(f.url);
      case 'WebSearch':
        return str(f.query);
      case 'Agent':
      case 'Task':
        return str(f.description);
      case 'Patch': {
        const changes = Array.isArray(f.changes) ? (f.changes as { path?: string }[]) : [];
        return changes.length === 1 ? relativeTo(str(changes[0]!.path), cwd) : `${changes.length} files`;
      }
      case 'TodoWrite':
        return Array.isArray(f.todos) ? `${f.todos.length} items` : '';
      default:
        return str(Object.values(f).find((value) => typeof value === 'string'));
    }
  });
</script>

<details class="tool" class:sub={item.parent} class:error={status === 'error'}>
  <summary>
    {#if status === 'running'}
      <span class="spinner"></span>
    {:else}
      <span class="mark" aria-hidden="true">{status === 'done' ? '✓' : status === 'error' ? '✕' : '–'}</span>
    {/if}
    <span class="name">{item.name}</span>
    <span class="summary">{summary}</span>
    {#if status === 'error'}<span class="flag">failed</span>{/if}
  </summary>
  <div class="body">
    <ToolInput name={item.name} input={item.input} />
    {#if item.result}
      <p class="label">{item.result.isError ? 'Error' : 'Result'}</p>
      <pre class="code">{item.result.text || '(no output)'}</pre>
    {/if}
  </div>
</details>

<style>
  .tool {
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
    font-size: 13.5px;
  }

  .tool.sub {
    margin-left: 18px;
  }

  summary {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 34px;
    padding: 5px 10px;
    cursor: pointer;
    list-style: none;
  }

  summary::-webkit-details-marker {
    display: none;
  }

  .mark {
    width: 12px;
    text-align: center;
    color: var(--accent);
    font-size: 12px;
    flex: none;
  }

  .error .mark,
  .flag {
    color: var(--danger);
  }

  .name {
    font-weight: 600;
    flex: none;
  }

  .summary {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    color: var(--muted);
    font-family: var(--mono);
    font-size: 12.5px;
  }

  .flag {
    font-size: 12px;
    flex: none;
  }

  .body {
    display: grid;
    gap: 8px;
    padding: 2px 10px 10px;
  }

  .label {
    margin: 2px 0 -4px;
    color: var(--muted);
    font-size: 12px;
  }
</style>
