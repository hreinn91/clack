<script lang="ts">
  import type { Item } from '../../../shared/protocol';
  import { isImagePath, isOutside, splitAttachments } from '../lib/format';
  import { app } from '../lib/state.svelte';
  import Markdown from './Markdown.svelte';
  import ToolCard from './ToolCard.svelte';

  // One thing a sender put in the conversation. Who sent it is shown by the Message around it.
  let { item }: { item: Item } = $props();

  /** Attached pictures that could not be loaded, by path. */
  let missing = $state<Record<string, boolean>>({});

  /** Where an attached file is as the data page knows it: relative to the data directory. */
  function inData(path: string): string {
    return `sessions/${app.meta?.folder ?? ''}/${path}`;
  }

  /** A picture in the chat's folder, wherever that folder is. */
  function image(path: string): string {
    return `/api/sessions/${app.sessionId}/image?path=${encodeURIComponent(path)}`;
  }

  /** A folder outside data/sessions is not on the data page: a picture then opens on its own. */
  const outside = $derived(isOutside(app.meta?.folder ?? ''));
</script>

{#snippet file(path: string)}
  {#if isImagePath(path) && app.meta && !missing[path]}
    <!-- A picture attached before the chat changed folder is still in the old folder: it is then shown by name. -->
    <img src={image(path)} alt={path} loading="lazy" onerror={() => (missing[path] = true)} />
  {:else}
    <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" aria-hidden="true">
      <path d="M4 1.75h5l3.25 3.25v8.25c0 .55-.45 1-1 1H4c-.55 0-1-.45-1-1v-10.5c0-.55.45-1 1-1z" />
      <path d="M9 1.75V5h3.25" />
    </svg>
    <span>{path.split('/').pop()}</span>
  {/if}
{/snippet}

{#if item.kind === 'user'}
  {@const typed = splitAttachments(item.text)}
  {#if typed.text}<div class="typed">{typed.text}</div>{/if}
  {#if typed.paths.length}
    <ul class="files" aria-label="Attached files">
      {#each typed.paths as path (path)}
        <li>
          <!-- Opens the file on the data page, next to the folder it is in. -->
          {#if outside}
            <a href={isImagePath(path) ? image(path) : undefined} target="_blank" rel="noopener" title={path}>
              {@render file(path)}
            </a>
          {:else}
            <a href="#/data" title={`Open ${path} on the data page`} onclick={() => void app.openFile(inData(path))}>
              {@render file(path)}
            </a>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
{:else if item.kind === 'text'}
  <div class:sub={item.parent}><Markdown text={item.text} /></div>
{:else if item.kind === 'thinking'}
  <details class="thinking" class:sub={item.parent}>
    <summary>Thinking</summary>
    <Markdown text={item.text} />
  </details>
{:else if item.kind === 'tool'}
  <ToolCard {item} />
{:else if item.kind === 'notice'}
  <p class="notice" class:error={item.level === 'error'} role={item.level === 'error' ? 'alert' : undefined}>
    {item.text}
  </p>
{/if}

<style>
  .typed {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .files {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .files a {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 38px;
    max-width: 100%;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
    color: inherit;
    text-decoration: none;
    overflow: hidden;
  }

  .files a:hover {
    border-color: var(--border-strong);
  }

  .files svg {
    flex: none;
    margin-left: 10px;
    color: var(--muted);
  }

  .files span {
    padding-right: 12px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-weight: 700;
  }

  .files img {
    display: block;
    max-width: min(360px, 100%);
    max-height: 240px;
  }

  .sub {
    margin-left: 18px;
    padding-left: 12px;
    border-left: 2px solid var(--border);
  }

  .thinking {
    color: var(--muted);
    font-size: 13.5px;
  }

  .thinking summary {
    cursor: pointer;
    width: fit-content;
    font-style: italic;
  }

  .notice {
    margin: 0;
    color: var(--muted);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .notice.error {
    width: fit-content;
    max-width: 100%;
    padding: 6px 12px;
    border-radius: 6px;
    background: var(--danger-soft);
    color: var(--danger);
  }
</style>
