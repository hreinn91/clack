<script lang="ts">
  import type { Item } from '../../../shared/protocol';
  import { artifactOfResult, artifacts, TYPE_LABEL } from '../lib/artifacts.svelte';
  import { app } from '../lib/state.svelte';
  import ArtifactIcon from './ArtifactIcon.svelte';

  // Where an agent made or changed an artifact, a card instead of the tool
  // call (whose input is the whole artifact). Clicking it opens that version
  // in the panel on the left.
  let { item }: { item: Extract<Item, { kind: 'tool' }> } = $props();

  const input = $derived((item.input && typeof item.input === 'object' ? item.input : {}) as Record<string, unknown>);
  const made = $derived(artifactOfResult(item.result?.text));
  const artifact = $derived(made ? artifacts.find(made.chatId, made.id) : undefined);
  const updating = $derived(item.name.endsWith('update_artifact'));
  const title = $derived(
    artifact?.title ?? (typeof input.title === 'string' ? input.title : '') ?? '',
  );
  const pending = $derived(!item.result && app.running);
  const note = $derived(artifact?.versions.find((v) => v.n === made?.version)?.note);

  function open() {
    if (made && artifact) artifacts.open(made.chatId, made.id, made.version === artifact.versions.at(-1)?.n ? null : made.version);
  }
</script>

{#if item.result?.isError}
  <p class="failed">{updating ? 'The artifact could not be changed' : 'The artifact could not be made'}: {item.result.text}</p>
{:else if made && artifact}
  <button class="card" onclick={open} title="Open it beside the chat">
    <span class="badge"><ArtifactIcon type={artifact.type} size={20} /></span>
    <span class="what">
      <strong>{title}</strong>
      <span class="meta">
        {TYPE_LABEL[artifact.type]} · {updating ? `version ${made.version}` : 'made'}{note ? ` · ${note}` : ''}
      </span>
    </span>
    <span class="open">Open</span>
  </button>
{:else if made}
  <p class="gone">An artifact made here{title ? ` ("${title}")` : ''} was deleted.</p>
{:else if pending}
  <p class="making"><span class="spinner"></span> {updating ? 'Changing' : 'Making'} {title ? `“${title}”` : 'an artifact'}…</p>
{/if}

<style>
  .card {
    display: flex;
    align-items: center;
    gap: 12px;
    width: min(100%, 460px);
    padding: 10px 14px 10px 10px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    color: var(--text);
    text-align: left;
    box-shadow: 0 1px 2px rgb(0 0 0 / 6%);
  }

  .card:hover {
    border-color: var(--border-strong);
    background: var(--hover);
  }

  .badge {
    display: grid;
    place-items: center;
    flex: none;
    width: 40px;
    height: 40px;
    border-radius: 8px;
    background: var(--sunken);
  }

  .what {
    display: grid;
    flex: 1;
    min-width: 0;
  }

  .what strong {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .meta {
    overflow: hidden;
    color: var(--muted);
    font-size: 12.5px;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .open {
    flex: none;
    color: var(--link);
    font-size: 13px;
    font-weight: 700;
  }

  .making,
  .gone,
  .failed {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    color: var(--muted);
    font-size: 13.5px;
  }

  .failed {
    color: var(--danger);
  }
</style>
