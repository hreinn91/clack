<script lang="ts">
  import type { ArtifactType } from '../../../shared/protocol';
  import { artifacts, TYPE_LABEL } from '../lib/artifacts.svelte';
  import { ago } from '../lib/format';
  import { app } from '../lib/state.svelte';
  import ArtifactIcon from './ArtifactIcon.svelte';
  import ArtifactToolbar from './ArtifactToolbar.svelte';
  import ArtifactView from './ArtifactView.svelte';
  import Modal from './Modal.svelte';

  // Every artifact the agents have made: a gallery to browse, and each one
  // in full, with its versions, a link back to its chat, and a way to delete it.
  let { onmenu }: { onmenu: () => void } = $props();

  const route = $derived(app.route.name === 'artifacts' ? app.route : null);
  const artifact = $derived(route?.chatId && route.id ? artifacts.find(route.chatId, route.id) : undefined);
  const query = $derived(app.search.trim().toLowerCase());

  let type = $state<ArtifactType | 'all'>('all');
  let version = $state<number | null>(null);
  let deleting = $state(false);
  let busy = $state(false);

  // Another artifact starts on its latest version.
  $effect(() => {
    void route?.id;
    version = null;
  });

  $effect(() => {
    if (!artifacts.loaded) void artifacts.load();
  });

  const kinds = $derived([...new Set(artifacts.all.map((a) => a.type))]);
  const shown = $derived(
    artifacts.all.filter((a) => (type === 'all' || a.type === type) && (!query || `${a.title} ${a.chatTitle ?? ''}`.toLowerCase().includes(query))),
  );

  async function remove() {
    if (!artifact) return;
    busy = true;
    try {
      await artifacts.remove(artifact);
      deleting = false;
      location.hash = '#/artifacts';
    } finally {
      busy = false;
    }
  }
</script>

<header class="pane-bar">
  <button class="icon-btn menu" aria-label="Open menu" onclick={onmenu}>
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
      <path d="M3 5.5h14M3 10h14M3 14.5h14" />
    </svg>
  </button>
  {#if artifact}
    <nav class="trail" aria-label="Where this artifact is">
      <a href="#/artifacts">Artifacts</a>
      <span class="sep" aria-hidden="true">/</span>
      <h1>{artifact.title}</h1>
    </nav>
    <span class="from">
      {#if artifact.chatExists !== false}
        from <a href={`#/s/${artifact.chatId}`}>{artifact.chatTitle ?? 'its chat'}</a>
      {:else}
        from a deleted chat{artifact.chatTitle ? ` (${artifact.chatTitle})` : ''}
      {/if}
    </span>
  {:else}
    <h1>Artifacts</h1>
  {/if}
</header>

{#if route?.id && artifact}
  <div class="full">
    <ArtifactToolbar {artifact} bind:version>
      {#snippet end()}
        <button class="icon-btn" aria-label="Delete the artifact" title="Delete" onclick={() => (deleting = true)}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M2.75 4.25h10.5M6.25 4.25V2.75h3.5v1.5M4.25 4.25l.6 8.6c.04.55.5.9 1 .9h4.3c.5 0 .96-.35 1-.9l.6-8.6" />
          </svg>
        </button>
      {/snippet}
    </ArtifactToolbar>
    <ArtifactView {artifact} {version} mode={artifacts.mode} />
  </div>
{:else}
  <div class="scroll">
    {#if route?.id && artifacts.loaded}
      <p class="missing">That artifact is not there any more. <a href="#/artifacts">See them all</a></p>
    {/if}
    {#if !artifacts.loaded}
      <p class="none"><span class="spinner"></span> Loading…</p>
    {:else if !artifacts.all.length}
      <div class="empty">
        <h2>No artifacts yet</h2>
        <p>
          Ask an agent in a chat for something to keep: a page or a small app, a dashboard, a document, a diagram or a
          picture. It appears beside the chat and here, with every version.
        </p>
      </div>
    {:else}
      {#if kinds.length > 1}
        <div class="filters" role="group" aria-label="Kind">
          <button class:on={type === 'all'} aria-pressed={type === 'all'} onclick={() => (type = 'all')}>All</button>
          {#each kinds as kind (kind)}
            <button class:on={type === kind} aria-pressed={type === kind} onclick={() => (type = kind)}>
              <ArtifactIcon type={kind} size={14} />
              {TYPE_LABEL[kind]}
            </button>
          {/each}
        </div>
      {/if}
      <ul class="grid">
        {#each shown as a (a.chatId + a.id)}
          <li>
            <a class="card" href={`#/artifacts/${a.chatId}/${a.id}`}>
              <span class="badge"><ArtifactIcon type={a.type} size={26} /></span>
              <strong>{a.title}</strong>
              <span class="meta">{TYPE_LABEL[a.type]}{a.versions.length > 1 ? ` · ${a.versions.length} versions` : ''} · {ago(a.updated)}</span>
              <span class="chat" class:gone={a.chatExists === false}>{a.chatExists === false ? 'Deleted chat: ' : ''}{a.chatTitle ?? 'A chat'}</span>
            </a>
          </li>
        {:else}
          <li class="none">Nothing matches.</li>
        {/each}
      </ul>
    {/if}
  </div>
{/if}

{#if deleting && artifact}
  <Modal title="Delete artifact" onclose={() => (deleting = false)}>
    <div class="dialog">
      <h2>Delete “{artifact.title}”?</h2>
      <p>
        It and its {artifact.versions.length === 1 ? 'one version' : `${artifact.versions.length} versions`} are removed for good. The chat that made it
        is not changed.
      </p>
      <div class="actions">
        <button class="btn" data-autofocus="" disabled={busy} onclick={() => (deleting = false)}>Cancel</button>
        <button class="btn delete" disabled={busy} onclick={remove}>Delete</button>
      </div>
    </div>
  </Modal>
{/if}

<style>
  .trail {
    display: flex;
    align-items: baseline;
    gap: 6px;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
  }

  .trail a {
    color: var(--muted);
    text-decoration: none;
  }

  .trail a:hover {
    color: var(--text);
    text-decoration: underline;
  }

  .trail h1 {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 16px;
  }

  .sep {
    color: var(--muted);
  }

  .from {
    flex: none;
    max-width: 40%;
    overflow: hidden;
    color: var(--muted);
    font-size: 13px;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .from a {
    color: var(--link);
  }

  .full {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
  }

  .scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 20px 20px calc(32px + env(safe-area-inset-bottom));
  }

  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 14px;
  }

  .filters button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 30px;
    padding: 0 12px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--surface);
    color: var(--muted);
    font-size: 13px;
    font-weight: 700;
  }

  .filters button.on {
    border-color: var(--accent);
    background: var(--accent-soft);
    color: var(--text);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 12px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .card {
    display: grid;
    gap: 4px;
    height: 100%;
    padding: 14px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    color: inherit;
    text-decoration: none;
  }

  .card:hover {
    border-color: var(--border-strong);
    background: var(--hover);
  }

  .badge {
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    margin-bottom: 6px;
    border-radius: 10px;
    background: var(--sunken);
  }

  .card strong {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .meta,
  .chat {
    overflow: hidden;
    color: var(--muted);
    font-size: 12.5px;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .chat.gone {
    font-style: italic;
  }

  .empty h2 {
    margin: 30px 0 8px;
    font-size: 20px;
  }

  .empty p,
  .none,
  .missing {
    max-width: 620px;
    margin: 0 0 12px;
    color: var(--muted);
  }

  .missing a {
    color: var(--link);
  }

  .dialog {
    display: grid;
    gap: 12px;
    padding: 20px 24px;
  }

  .dialog h2 {
    margin: 0;
    font-size: 20px;
  }

  .dialog p {
    margin: 0;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .delete {
    border-color: var(--danger);
    background: var(--danger);
    color: #fff;
  }

  @media (max-width: 820px) {
    .from {
      display: none;
    }
  }
</style>
