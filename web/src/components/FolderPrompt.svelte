<script lang="ts">
  import { app } from '../lib/state.svelte';

  // Where the chat works, written like a shell prompt (spaceship and its
  // kind): the folder, then "on" and the git branch when the folder is in a
  // repository. Clicking it changes the folder.

  const meta = $derived(app.meta);
  const chat = $derived(app.currentChat);
  const folder = $derived(meta?.folder ?? '');
  /** Deep paths keep their last two parts, as prompts usually do. */
  const shown = $derived.by(() => {
    const parts = folder.split('/');
    return parts.length > 2 ? `…/${parts.slice(-2).join('/')}` : folder;
  });
  const branch = $derived(meta?.gitBranch);
  const gone = $derived(meta?.folderMissing ?? false);

  const title = $derived(
    app.running
      ? `Works in data/sessions/${folder}. The folder can be changed once Claude has finished.`
      : `Works in data/sessions/${folder}${branch ? `, on git branch ${branch}` : ''}${gone ? ' (deleted)' : ''}. Click to change the folder.`,
  );
</script>

{#if meta && chat && folder}
  <button
    class="prompt"
    class:gone
    aria-label={title}
    {title}
    disabled={app.running}
    onclick={() => (app.dialog = { kind: 'move', session: chat })}
  >
    <span class="dir">{shown}</span>
    {#if branch}
      <span class="on">on</span>
      <span class="branch">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">
          <circle cx="4.5" cy="3.5" r="1.75" />
          <circle cx="4.5" cy="12.5" r="1.75" />
          <circle cx="11.5" cy="5.5" r="1.75" />
          <path d="M4.5 5.25v5.5M11.5 7.25c0 2.5-2.5 2.75-5.6 4.1" />
        </svg>
        {branch}
      </span>
    {/if}
  </button>
{/if}

<style>
  .prompt {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    max-width: 100%;
    height: 28px;
    padding: 0 8px;
    border: 0;
    border-radius: 6px;
    background: none;
    color: var(--muted);
    font: 12.5px var(--mono);
    white-space: nowrap;
  }

  .prompt:hover:not(:disabled) {
    background: var(--hover);
  }

  .prompt:disabled {
    cursor: default;
  }

  .dir {
    min-width: 0;
    max-width: 30ch;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--link);
    font-weight: 700;
  }

  .gone .dir {
    color: var(--muted);
    text-decoration: line-through;
  }

  .branch {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    min-width: 0;
    max-width: 24ch;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--series-7);
    font-weight: 700;
  }

  .branch svg {
    flex: none;
  }

  .prompt:hover:not(:disabled) .dir {
    text-decoration: underline;
    text-underline-offset: 3px;
  }
</style>
