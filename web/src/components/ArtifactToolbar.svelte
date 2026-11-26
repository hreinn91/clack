<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Artifact } from '../../../shared/protocol';
  import { artifacts } from '../lib/artifacts.svelte';
  import { ago } from '../lib/format';
  import CopyButton from './CopyButton.svelte';

  // What can be done with the artifact being shown: pick a version, switch
  // between how it looks and its source, copy it, download it, open it alone.
  let {
    artifact,
    version = $bindable(),
    end,
  }: { artifact: Artifact; version: number | null; end?: Snippet } = $props();

  const latest = $derived(artifact.versions.at(-1)?.n ?? 1);
  const shown = $derived(version ?? latest);
  const previewable = $derived(['html', 'svg', 'markdown', 'mermaid'].includes(artifact.type));
  const textual = $derived(artifact.type !== 'file' || ['csv', 'tsv', 'json', 'txt', 'md'].includes(artifact.ext));
  const note = $derived(artifact.versions.find((v) => v.n === shown));

  async function source(): Promise<string> {
    const res = await fetch(artifacts.rawUrl(artifact, version));
    if (!res.ok) throw new Error('It could not be read.');
    return res.text();
  }
</script>

<div class="bar">
  {#if artifact.versions.length > 1}
    <select
      aria-label="Version"
      value={version === null ? 'latest' : String(version)}
      onchange={(e) => (version = e.currentTarget.value === 'latest' ? null : Number(e.currentTarget.value))}
    >
      <option value="latest">Latest (v{latest})</option>
      {#each [...artifact.versions].reverse() as v (v.n)}
        <option value={String(v.n)}>v{v.n}{v.note ? ` · ${v.note}` : ''} · {ago(v.at)}</option>
      {/each}
    </select>
  {:else}
    <span class="version">v1 · {ago(artifact.created) === 'now' ? 'just now' : `${ago(artifact.created)} ago`}</span>
  {/if}
  {#if previewable}
    <div class="seg" role="group" aria-label="Show">
      <button class:on={artifacts.mode === 'preview'} aria-pressed={artifacts.mode === 'preview'} onclick={() => artifacts.setMode('preview')}>Preview</button>
      <button class:on={artifacts.mode === 'code'} aria-pressed={artifacts.mode === 'code'} onclick={() => artifacts.setMode('code')}>Code</button>
    </div>
  {/if}
  <span class="grow"></span>
  {#if textual}<CopyButton text={source} label="Copy the artifact" size={30} />{/if}
  <a class="icon-btn" href={artifacts.rawUrl(artifact, version, true)} download aria-label="Download" title="Download">
    <svg width="17" height="17" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M8 2.5v7.5M4.75 7 8 10.25 11.25 7M2.75 12.5v.75c0 .41.34.75.75.75h9c.41 0 .75-.34.75-.75v-.75" />
    </svg>
  </a>
  <a class="icon-btn" href={artifacts.rawUrl(artifact, version)} target="_blank" rel="noopener noreferrer" aria-label="Open in a new window" title="Open in a new window">
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M9.5 2.5h4v4M13.5 2.5 8 8M11.5 9.5v3.25c0 .41-.34.75-.75.75h-7.5a.75.75 0 0 1-.75-.75v-7.5c0-.41.34-.75.75-.75h3.25" />
    </svg>
  </a>
  {#if end}{@render end()}{/if}
</div>
{#if note?.note && version !== null}<p class="changed">v{note.n}: {note.note}</p>{/if}

<style>
  .bar {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 40px;
    padding: 4px 10px;
    border-bottom: 1px solid var(--border);
    background: var(--surface);
  }

  select {
    max-width: 240px;
    height: 28px;
    padding: 0 6px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    font-size: 12.5px;
  }

  .version {
    color: var(--muted);
    font-size: 12.5px;
    white-space: nowrap;
  }

  .seg {
    display: inline-flex;
    padding: 2px;
    border: 1px solid var(--border);
    border-radius: 7px;
    background: var(--sunken);
  }

  .seg button {
    height: 24px;
    padding: 0 9px;
    border: 0;
    border-radius: 5px;
    background: none;
    color: var(--muted);
    font-size: 12.5px;
    font-weight: 700;
  }

  .seg button.on {
    background: var(--surface);
    color: var(--text);
    box-shadow: 0 1px 2px rgb(0 0 0 / 14%);
  }

  .grow {
    flex: 1;
  }

  .icon-btn {
    width: 30px;
    height: 30px;
  }

  .changed {
    margin: 0;
    padding: 4px 12px;
    border-bottom: 1px solid var(--border);
    background: var(--sunken);
    color: var(--muted);
    font-size: 12.5px;
  }
</style>
