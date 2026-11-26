<script lang="ts">
  import type { Artifact } from '../../../shared/protocol';
  import { artifacts } from '../lib/artifacts.svelte';
  import { app } from '../lib/state.svelte';
  import ActionMenu from './ActionMenu.svelte';
  import ArtifactIcon from './ArtifactIcon.svelte';

  // The sidebar on the Artifacts page: every artifact, under the chat that
  // made it; a deleted chat's at the end, with a way to delete them all.

  const query = $derived(app.search.trim().toLowerCase());
  const current = $derived(app.route.name === 'artifacts' && app.route.id ? `${app.route.chatId}/${app.route.id}` : '');

  const groups = $derived.by(() => {
    const byChat = new Map<string, Artifact[]>();
    for (const a of artifacts.all) {
      if (query && !`${a.title} ${a.chatTitle ?? ''}`.toLowerCase().includes(query)) continue;
      byChat.set(a.chatId, [...(byChat.get(a.chatId) ?? []), a]);
    }
    return [...byChat.entries()]
      .map(([chatId, list]) => ({ chatId, list, title: list[0]!.chatTitle ?? 'A chat', exists: list[0]!.chatExists !== false, updated: list[0]!.updated }))
      .sort((a, b) => Number(b.exists) - Number(a.exists) || b.updated - a.updated);
  });

  let confirming = $state<string | null>(null);
</script>

{#if !artifacts.loaded}
  <p class="none">Loading…</p>
{:else if !artifacts.all.length}
  <p class="none">No artifacts yet. Ask an agent in a chat for a page, a document or a diagram to keep.</p>
{:else if !groups.length}
  <p class="none">No artifact is called that.</p>
{:else}
  {#each groups as group (group.chatId)}
    <section class:gone={!group.exists}>
      <div class="chat">
        {#if group.exists}
          <a href={`#/s/${group.chatId}`} title="Open the chat">{group.title}</a>
        {:else}
          <span title="This chat was deleted; its artifacts were kept">{group.title}</span>
          <span class="tag">deleted chat</span>
          <ActionMenu
            label={`More for ${group.title}`}
            chrome
            actions={[{ label: `Delete its ${group.list.length === 1 ? 'artifact' : `${group.list.length} artifacts`}…`, run: () => (confirming = group.chatId), danger: true }]}
          />
        {/if}
      </div>
      {#if confirming === group.chatId}
        <div class="confirm" role="alert">
          <span>Delete {group.list.length === 1 ? 'this artifact' : `these ${group.list.length} artifacts`} for good?</span>
          <button class="yes" onclick={() => { confirming = null; void artifacts.removeChat(group.chatId); }}>Delete</button>
          <button onclick={() => (confirming = null)}>Cancel</button>
        </div>
      {/if}
      <ul>
        {#each group.list as a (a.id)}
          <li>
            <a class="row" class:active={current === `${a.chatId}/${a.id}`} href={`#/artifacts/${a.chatId}/${a.id}`} title={a.title}>
              <ArtifactIcon type={a.type} size={15} />
              <span class="label">{a.title}</span>
              {#if a.versions.length > 1}<span class="v">v{a.versions.at(-1)?.n}</span>{/if}
            </a>
          </li>
        {/each}
      </ul>
    </section>
  {/each}
{/if}

<style>
  section {
    margin-bottom: 12px;
  }

  .chat {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 26px;
    padding: 2px 4px 2px 8px;
    color: var(--chrome-text);
    font-size: 12.5px;
    font-weight: 700;
  }

  .chat a,
  .chat > span:first-child {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    color: inherit;
    text-decoration: none;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .chat a:hover {
    color: var(--chrome-strong);
    text-decoration: underline;
  }

  .gone .chat {
    color: var(--chrome-muted);
  }

  .tag {
    flex: none;
    padding: 0 5px;
    border: 1px solid currentColor;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 700;
    opacity: 0.8;
  }

  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 7px;
    height: 28px;
    padding: 0 8px 0 14px;
    border-radius: 6px;
    color: inherit;
    text-decoration: none;
  }

  .row:hover {
    background: var(--chrome-hover);
  }

  .row.active {
    background: var(--chrome-active);
    color: var(--chrome-active-text);
  }

  .row :global(.art-icon) {
    color: inherit;
    opacity: 0.85;
  }

  .label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .v {
    flex: none;
    font-size: 11px;
    opacity: 0.7;
  }

  .confirm {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin: 2px 4px 6px;
    padding: 6px 8px;
    border-radius: 6px;
    background: var(--danger-soft);
    color: var(--danger);
    font-size: 12.5px;
  }

  .confirm span {
    flex: 1 1 100%;
  }

  .confirm button {
    height: 24px;
    padding: 0 8px;
    border: 0;
    border-radius: 5px;
    background: var(--surface);
    color: var(--text);
    font-size: 12px;
    font-weight: 700;
  }

  .confirm .yes {
    background: var(--danger);
    color: #fff;
  }

  .none {
    margin: 4px 8px;
    font-size: 13px;
  }

  @media (max-width: 820px), (pointer: coarse) {
    .row {
      height: 36px;
    }
  }
</style>
