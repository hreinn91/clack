<script lang="ts">
  import { app } from '../lib/state.svelte';
  import TerminalView from './TerminalView.svelte';
</script>

<div class="tabs" role="tablist" aria-label="Terminals">
  {#each app.terminals as terminal (terminal.id)}
    <div class="tab" class:active={terminal.id === app.terminalId}>
      <button
        class="pick"
        role="tab"
        aria-selected={terminal.id === app.terminalId}
        title={`Started in ${terminal.cwd || 'the data directory'}`}
        onclick={() => (app.terminalId = terminal.id)}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M3 4.5l3.5 3.5L3 11.5M8.5 11.5H13" />
        </svg>
        <span>{terminal.title}</span>
      </button>
      <button class="close" aria-label={`Close terminal ${terminal.title}`} title="Close this terminal and end its shell" onclick={() => app.closeTerminal(terminal.id)}>
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
          <path d="M4 4l8 8M12 4l-8 8" />
        </svg>
      </button>
    </div>
  {/each}
  <button class="add" aria-label="New terminal" title="New terminal in the data directory" onclick={() => app.newTerminal()}>
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
      <path d="M8 3v10M3 8h10" />
    </svg>
  </button>
</div>

<div class="stack">
  {#each app.terminals as terminal (terminal.id)}
    <!-- Kept in place while behind another tab, so each one always knows how much room it has. -->
    <div class="pane" class:behind={terminal.id !== app.terminalId} role="tabpanel" aria-label={terminal.title}>
      <TerminalView id={terminal.id} active={terminal.id === app.terminalId} />
    </div>
  {:else}
    <div class="empty">
      <p>No terminal is open. A terminal is a shell on the server computer, running as your account.</p>
      <button class="add-first" onclick={() => app.newTerminal()}>New terminal</button>
    </div>
  {/each}
</div>

<style>
  .tabs {
    display: flex;
    align-items: stretch;
    gap: 1px;
    height: 34px;
    flex: none;
    background: var(--term-strip);
    color: var(--term-dim);
  }

  .tab {
    display: flex;
    align-items: center;
    flex: 0 1 auto;
    min-width: 0;
    max-width: 220px;
    background: var(--term-tab);
  }

  .tab.active {
    background: var(--term-bg);
    color: var(--term-fg);
  }

  button {
    border: 0;
    background: none;
    color: inherit;
  }

  .pick {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
    height: 100%;
    padding: 0 4px 0 12px;
    font: 12.5px var(--mono);
  }

  .pick span {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .close,
  .add {
    display: grid;
    place-items: center;
    flex: none;
    width: 24px;
    height: 24px;
    border-radius: 4px;
  }

  .close {
    margin-right: 5px;
    opacity: 0.6;
  }

  .add {
    align-self: center;
    margin-left: 5px;
  }

  .close:hover,
  .add:hover {
    background: var(--term-key);
    opacity: 1;
    color: var(--term-fg);
  }

  .stack {
    position: relative;
    flex: 1;
    min-height: 0;
    background: var(--term-bg);
  }

  .pane {
    position: absolute;
    inset: 0;
  }

  .pane.behind {
    visibility: hidden;
  }

  .empty {
    display: grid;
    place-content: center;
    justify-items: center;
    gap: 12px;
    height: 100%;
    padding: 20px;
    color: var(--term-dim);
    text-align: center;
  }

  .empty p {
    max-width: 380px;
    margin: 0;
  }

  .add-first {
    padding: 6px 14px;
    border-radius: 6px;
    background: var(--accent);
    color: var(--accent-ink);
    font-weight: 700;
  }

  .add-first:hover {
    filter: brightness(1.1);
  }
</style>
