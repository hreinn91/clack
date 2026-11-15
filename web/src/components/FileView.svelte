<script lang="ts">
  import { ago, fileSize, fullDate } from '../lib/format';
  import { app } from '../lib/state.svelte';

  // A look at one file from the data directory. Nothing here can change the file.
  const file = $derived(app.file);
  const waiting = $derived(app.fileLoading !== null && app.fileLoading !== file?.path);
</script>

<header>
  <span class="path" title={file?.path ?? app.fileLoading ?? ''}>{file?.path ?? app.fileLoading}</span>
  {#if file}
    <span class="meta" title={fullDate(file.modified)}>{fileSize(file.size)} · {ago(file.modified)}</span>
  {/if}
  <button class="icon-btn" aria-label="Close file" title="Close file" onclick={() => app.closeFile()}>
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  </button>
</header>

<div class="content" class:waiting>
  {#if !file}
    <p class="note"><span class="spinner"></span> Loading…</p>
  {:else if file.kind === 'text'}
    {#if file.text}
      <pre>{file.text}</pre>
    {:else}
      <p class="note">This file is empty.</p>
    {/if}
    {#if file.truncated}
      <p class="note">Showing the first {fileSize(file.text?.length ?? 0)} of {fileSize(file.size)}. Use the terminal to see the rest.</p>
    {/if}
  {:else if file.kind === 'image'}
    <img src={`/api/files/image?path=${encodeURIComponent(file.path)}&v=${Math.round(file.modified)}`} alt={file.path} />
  {:else}
    <p class="note">This is not a text file, so there is nothing to show ({fileSize(file.size)}).</p>
  {/if}
</div>

<style>
  header {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 38px;
    padding: 2px 8px 2px 20px;
    border-bottom: 1px solid var(--border);
  }

  .path {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font: 13px var(--mono);
    font-weight: 600;
    /* Keeps the file's name in sight when the path is too long. */
    direction: rtl;
    text-align: left;
  }

  .meta {
    flex: 1;
    color: var(--muted);
    font-size: 12.5px;
    white-space: nowrap;
  }

  .icon-btn {
    width: 30px;
    height: 30px;
    flex: none;
    margin-left: auto;
  }

  .content {
    flex: 1;
    min-height: 0;
    overflow: auto;
    background: var(--sunken);
  }

  .content.waiting {
    opacity: 0.5;
  }

  pre {
    margin: 0;
    padding: 12px 20px;
    font: 12.5px/1.55 var(--mono);
    tab-size: 4;
    width: max-content;
    min-width: 100%;
  }

  img {
    display: block;
    max-width: calc(100% - 40px);
    margin: 20px;
    /* A checked background shows where a picture is transparent. */
    background: repeating-conic-gradient(var(--border) 0% 25%, transparent 0% 50%) 0 0 / 16px 16px;
  }

  .note {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    padding: 12px 20px;
    color: var(--muted);
    font-size: 13.5px;
  }

  @media (max-width: 820px) {
    header {
      padding-left: 14px;
    }

    .meta {
      display: none;
    }
  }
</style>
