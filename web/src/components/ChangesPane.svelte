<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import type { GitChange } from '../../../shared/protocol';
  import { app } from '../lib/state.svelte';
  import { buildChangeTree, type ChangeFolder } from '../lib/gitChanges';
  import ChangedFileRow from './ChangedFileRow.svelte';
  import FileDiff from './FileDiff.svelte';

  const status = $derived(app.changesStatus);
  let reading = $state(!!app.selectedChange);
  let back = $state<HTMLButtonElement>();
  let filesButton = $state<HTMLButtonElement>();
  let fileList = $state<HTMLElement>();

  const query = $derived(app.changesFilter.trim().toLowerCase());
  const tree = $derived(buildChangeTree(status?.changes ?? [], query));
  const files = $derived(tree.files);
  const selected = $derived(files.find(file => file.area === app.selectedChange?.area && file.path === app.selectedChange.path) ?? files[0]);
  const index = $derived(selected ? files.indexOf(selected) : -1);
  const closedFolders = new SvelteSet<string>();
  // Searching reveals matching branches. Clearing the search restores the previous folds.
  const folded = $derived(query ? new SvelteSet<string>() : closedFolders);

  function reveal(path: string) {
    for (let at = path.indexOf('/'); at >= 0; at = path.indexOf('/', at + 1)) folded.delete(path.slice(0, at));
  }

  function currentRow() {
    return fileList?.querySelector<HTMLButtonElement>('[aria-current="true"]');
  }

  onMount(() => {
    (reading && filesButton?.offsetWidth ? filesButton : back)?.focus();
    currentRow()?.scrollIntoView({ block: 'nearest' });
  });

  async function close() {
    app.closeChanges();
    await tick();
    const chip = document.querySelector<HTMLButtonElement>('#review-changes:enabled');
    (chip ?? document.querySelector<HTMLButtonElement>('.pane-bar .title'))?.focus();
  }

  async function showFiles() {
    reading = false;
    if (selected) reveal(selected.path);
    await tick();
    (currentRow() ?? back)?.focus();
  }

  async function pick(file: GitChange, fromList = false) {
    app.selectedChange = file;
    reading = true;
    reveal(file.path);
    await tick();
    if (fromList && filesButton?.offsetWidth) filesButton.focus();
    if (!fromList) currentRow()?.scrollIntoView({ block: 'nearest' });
  }

  function handleKey(event: KeyboardEvent) {
    if (event.key !== 'Escape') return;
    if (event.target instanceof HTMLInputElement && app.changesFilter) {
      app.changesFilter = '';
      event.preventDefault();
      return;
    }
    event.stopPropagation();
    if (reading && filesButton?.offsetWidth) void showFiles();
    else void close();
  }

  const message = $derived.by(() => {
    if (app.changesError) return app.changesError;
    if (!status) return app.changesLoading ? 'Reading changes…' : 'Git repository unavailable.';
    if (!status.changes.length) return 'Working tree is clean.';
    return files.length ? '' : 'No files match your filter.';
  });
</script>

{#snippet branch(folder: ChangeFolder, depth: number)}
  <ul class="tree" style:--tree-indent={`${Math.min(depth, 5) * 12}px`}>
    {#each folder.folders as child (child.path)}
      {@const expanded = !folded.has(child.path)}
      <li>
        <button class="folder" title={child.path} aria-expanded={expanded}
          onclick={() => expanded ? folded.add(child.path) : folded.delete(child.path)}>
          <svg class:expanded width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m3.5 2 3 3-3 3"/></svg>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" aria-hidden="true"><path d="M1.75 4.25c0-.7.55-1.25 1.25-1.25h3l1.5 1.75H13c.7 0 1.25.55 1.25 1.25v5.75c0 .7-.55 1.25-1.25 1.25H3c-.7 0-1.25-.55-1.25-1.25z"/></svg>
          <span>{child.name}</span>
        </button>
        {#if expanded}{@render branch(child, depth + 1)}{/if}
      </li>
    {/each}
    {#each folder.files as file (`${file.area}:${file.path}`)}
      <li><ChangedFileRow {file} selected={file === selected} onpick={(change) => pick(change, true)} /></li>
    {/each}
  </ul>
{/snippet}

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<main class="review" class:reading class:collapsed={app.changesListHidden} aria-label="Review changes"
  style:--files-width={`${app.sidebarWidth}px`} onkeydown={handleKey}>
  <header class="bar">
    <button class="back" bind:this={back} onclick={close}>
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 8H3m5-5L3 8l5 5"/></svg>
      Back to chat
    </button>
    <span class="chat-title">{app.currentChat?.title ?? app.meta?.title}</span>
    {#if status}
      <span class="totals" title="Total lines added and removed">
        <span class="plus">+{status.added}</span>
        <span class="minus">−{status.deleted}</span>
      </span>
    {/if}
    <button class="refresh" title="Refresh changes" aria-label="Refresh changes" disabled={app.changesLoading} onclick={() => app.refreshChanges()}>
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 10a6 6 0 1 1-1.8-4.3M16.5 3.5v3h-3"/></svg>
    </button>
  </header>
  <aside class="sidebar" aria-label="Changed files">
    <div class="summary">
      <h1>Changed files {#if status}<span>{status.files}</span>{/if}</h1>
      {#if status}
        <div class="repo" title={status.root}>{status.root}</div>
        {#if status.branch}
          <div class="branch">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><circle cx="4" cy="3" r="1.5"/><circle cx="4" cy="13" r="1.5"/><circle cx="12" cy="4" r="1.5"/><path d="M4 4.5v7M12 5.5c0 3-2.5 4-8 4"/></svg>
            <span>{status.branch}</span>
            {#if status.ahead}<small title="Commits to push">↑{status.ahead}</small>{/if}
            {#if status.behind}<small title="Commits to pull">↓{status.behind}</small>{/if}
          </div>
        {/if}
      {/if}
    </div>
    <input class="filter" type="search" aria-label="Filter changed files" placeholder="Filter changed files" bind:value={app.changesFilter} />
    <nav bind:this={fileList} aria-label="Changed file tree">
      {@render branch(tree.root, 0)}
      {#if status?.truncated}<p>Showing the first {status.changes.length} entries. Use <code>git status</code> for the full list.</p>{/if}
      {#if message}<p class="list-note" role="status">{message}</p>{/if}
    </nav>
  </aside>
  <section class="detail" aria-label="File changes">
    <button class="files-button" bind:this={filesButton} onclick={showFiles}>‹ Changed files</button>
    {#if message}<p class="note" role="status">{message}</p>
    {:else if selected}
      <FileDiff change={selected} place={`${index + 1} of ${files.length}`}
          onprev={index > 0 ? () => pick(files[index - 1]!) : undefined}
          onnext={index < files.length - 1 ? () => pick(files[index + 1]!) : undefined} />
    {/if}
  </section>
</main>

<style>
  .review {
    grid-column: 2 / -1;
    grid-row: 2;
    z-index: 1;
    min-height: 0;
    min-width: 0;
    display: grid;
    grid-template-columns: min(40%, max(210px, var(--files-width))) minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr);
    overflow: hidden;
    border-radius: 8px 0 0;
    background: var(--bg);
    color: var(--text);
  }
  .bar {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 50px;
    padding: 6px 14px;
    border-bottom: 1px solid var(--border);
  }
  button { color: inherit; }
  .back, .refresh, .files-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 32px;
    padding: 4px 8px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    font-size: 13px;
    font-weight: 600;
  }
  .back, .refresh { flex: none; }
  .back:hover, .refresh:hover, .files-button:hover, .folder:hover { background: var(--hover); }
  .totals { margin-left: auto; display: flex; gap: 6px; font: 600 12px var(--mono); }
  .chat-title + .refresh { margin-left: auto; }
  .chat-title {
    border-left: 1px solid var(--border);
    padding-left: 14px;
    color: var(--muted);
    font-size: 14px;
  }
  .sidebar, .detail { display: flex; flex-direction: column; min-height: 0; min-width: 0; }
  .sidebar {
    border-right: 1px solid var(--border);
    background: var(--surface);
  }
  .summary { padding: 16px; border-bottom: 1px solid var(--border); }
  h1 { display: flex; align-items: center; gap: 7px; margin: 0; font-size: 16px; }
  h1 span { background: var(--sunken); padding: 1px 6px; border-radius: 5px; color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
  .repo, .branch { margin-top: 5px; color: var(--muted); font: 12px var(--mono); }
  .branch { display: flex; align-items: center; gap: 5px; }
  .branch svg { flex: none; }
  nav { min-height: 0; overflow: auto; padding: 8px 6px 14px; }
  .tree { padding: 0; margin: 0; list-style: none; }
  .folder {
    display: flex;
    align-items: center;
    gap: 5px;
    width: 100%;
    min-height: 30px;
    padding: 4px 8px 4px calc(5px + var(--tree-indent));
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: var(--text);
    font-size: 13px;
    font-weight: 600;
    text-align: left;
  }
  .folder svg { flex: none; color: var(--muted); }
  .folder .expanded { transform: rotate(90deg); }
  .plus { color: var(--git-added-text); }
  .minus { color: var(--danger); }
  .chat-title, .repo, .branch span, .folder span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .note, nav p { margin: 0; padding: 14px 8px; color: var(--muted); font-size: 13px; }
  .note { margin: auto; }
  .filter, .files-button, .list-note { display: none; }
  @media (min-width: 821px) {
    .collapsed { grid-template-columns: minmax(0, 1fr); }
    .collapsed .sidebar { display: none; }
  }
  @media (max-width: 820px) {
    .review { grid-area: 1 / 1; grid-template-columns: minmax(0, 1fr); border-radius: 0; }
    .bar { padding-top: calc(6px + env(safe-area-inset-top)); }
    .sidebar { border: 0; }
    .detail, .reading .sidebar { display: none; }
    .reading .detail, .list-note { display: flex; }
    .files-button { display: inline-flex; align-self: start; margin: 5px 8px 0; }
    .filter {
      display: block;
      margin: 12px 12px 0;
      padding: 8px 10px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--bg);
      color: var(--text);
      font-size: 16px;
    }
    .folder { min-height: 40px; }
  }
</style>
