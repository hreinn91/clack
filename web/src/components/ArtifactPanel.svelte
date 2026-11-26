<script lang="ts">
  import { artifacts, TYPE_LABEL } from '../lib/artifacts.svelte';
  import { app } from '../lib/state.svelte';
  import ArtifactIcon from './ArtifactIcon.svelte';
  import ArtifactToolbar from './ArtifactToolbar.svelte';
  import ArtifactView from './ArtifactView.svelte';

  // The open chat's artifacts, on the left where the sidebar is (one or the
  // other, never both): a list to pick from, then the artifact itself.

  const list = $derived(artifacts.forChat(app.sessionId));
  const artifact = $derived(artifacts.current ? artifacts.find(artifacts.current.chatId, artifacts.current.id) : undefined);
  let picking = $state(false);

  function pick(id: string) {
    artifacts.open(app.sessionId!, id);
    picking = false;
  }
</script>

<svelte:window
  onkeydown={(event) => {
    if (event.key === 'Escape' && picking) picking = false;
  }}
/>

<aside class="panel" aria-label="Artifacts">
  <header>
    <button class="picker" aria-haspopup="listbox" aria-expanded={picking} onclick={() => (picking = !picking)} disabled={list.length < 2 && !!artifact}>
      {#if artifact}
        <ArtifactIcon type={artifact.type} size={16} />
        <span class="title">{artifact.title}</span>
        <span class="kind">{TYPE_LABEL[artifact.type]}</span>
      {:else}
        <span class="title">Artifacts</span>
      {/if}
      {#if list.length > 1}
        <span class="count">{list.length}</span>
        <svg class="caret" width="10" height="10" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true"><path d="M1.5 3 5 7.5 8.5 3z" /></svg>
      {/if}
    </button>
    <button class="icon-btn" aria-label="Close the artifacts and show the chats" title="Show the chats instead" onclick={() => artifacts.closePanel()}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
        <path d="M4 4l8 8M12 4l-8 8" />
      </svg>
    </button>
  </header>

  {#if picking}
    <ul class="list" role="listbox" aria-label="This chat's artifacts">
      {#each list as a (a.id)}
        <li>
          <button role="option" aria-selected={a.id === artifact?.id} class:on={a.id === artifact?.id} onclick={() => pick(a.id)}>
            <ArtifactIcon type={a.type} size={16} />
            <span class="title">{a.title}</span>
            <span class="kind">{TYPE_LABEL[a.type]}{a.versions.length > 1 ? ` · v${a.versions.at(-1)?.n}` : ''}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}

  {#if artifact}
    <!-- The version picked is kept with the artifact being shown; none means the latest, which follows the agent's changes. -->
    <ArtifactToolbar
      {artifact}
      bind:version={() => artifacts.current?.version ?? null, (v) => artifacts.current && (artifacts.current.version = v)}
    />
    <ArtifactView {artifact} version={artifacts.current?.version ?? null} mode={artifacts.mode} />
  {:else}
    <p class="none">This chat has no artifacts yet. Ask the agent for a page, a document or a diagram to keep.</p>
  {/if}
</aside>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    background: var(--bg);
    color: var(--text);
  }

  header {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 50px;
    padding: 6px 8px 6px 10px;
    padding-top: calc(6px + env(safe-area-inset-top));
    border-bottom: 1px solid var(--border);
    background: var(--surface);
  }

  .picker {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    min-width: 0;
    height: 36px;
    padding: 0 10px;
    border: 1px solid transparent;
    border-radius: 8px;
    background: none;
    color: inherit;
    text-align: left;
  }

  .picker:not(:disabled):hover {
    border-color: var(--border);
    background: var(--hover);
  }

  .picker:disabled {
    cursor: default;
  }

  .title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    font-weight: 800;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .kind {
    flex: none;
    color: var(--muted);
    font-size: 12px;
  }

  .count {
    flex: none;
    padding: 0 6px;
    border-radius: 999px;
    background: var(--sunken);
    font-size: 11.5px;
    font-weight: 700;
    line-height: 17px;
  }

  .caret {
    flex: none;
    color: var(--muted);
  }

  .list {
    display: grid;
    max-height: 40%;
    margin: 0;
    padding: 4px;
    overflow-y: auto;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
    list-style: none;
  }

  .list button {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    height: 34px;
    padding: 0 10px;
    border: 0;
    border-radius: 6px;
    background: none;
    color: inherit;
    text-align: left;
  }

  .list button:hover,
  .list button.on {
    background: var(--hover);
  }

  .list .title {
    font-weight: 600;
  }

  .none {
    margin: 0;
    padding: 20px;
    color: var(--muted);
  }
</style>
