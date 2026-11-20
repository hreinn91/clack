<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { GitChange, GitStatus } from '../../../shared/protocol';
  import { app } from '../lib/state.svelte';
  import FileDiff from './FileDiff.svelte';

  let status = $state<GitStatus | null>(null);
  let error = $state('');
  let loading = $state(true);
  let request = 0;
  let picked = $state<GitChange>();
  let reading = $state(false);
  let back = $state<HTMLButtonElement>();
  let filesButton = $state<HTMLButtonElement>();
  let fileList = $state<HTMLElement>();

  const areas = [
    ['conflict', 'In conflict'],
    ['staged', 'Staged'],
    ['unstaged', 'Not staged'],
    ['untracked', 'Untracked'],
  ] as const;
  const letters: Record<GitChange['status'], string> = {
    modified: 'M', added: 'A', deleted: 'D', renamed: 'R', copied: 'C',
    'type changed': 'T', untracked: 'U', conflict: '!',
  };

  const query = $derived(app.changesFilter.trim().toLowerCase());
  const matching = $derived((status?.changes ?? []).filter(file =>
    file.path.toLowerCase().includes(query) || file.from?.toLowerCase().includes(query)
  ));
  const groups = $derived(areas.map(([area, label]) => ({
    area, label, files: matching.filter(file => file.area === area),
  })).filter(group => group.files.length));
  const files = $derived(groups.flatMap(group => group.files));
  const selected = $derived(files.find(file => file.area === picked?.area && file.path === picked.path) ?? files[0]);
  const index = $derived(selected ? files.indexOf(selected) : -1);

  async function load() {
    const id = app.sessionId;
    if (!id) return;
    const current = ++request;
    loading = true;
    error = '';
    try {
      const answer = await app.loadGitStatus(id);
      if (current === request) status = answer;
    } catch (err) {
      if (current === request) error = err instanceof Error ? err.message : String(err);
    } finally {
      if (current === request) loading = false;
    }
  }

  $effect(() => {
    app.meta?.gitChanges?.checkedAt;
    void load();
    return () => { request++; };
  });

  onMount(() => back?.focus());

  async function close() {
    app.closeChanges();
    await tick();
    const chip = document.querySelector<HTMLButtonElement>('#review-changes:enabled');
    (chip ?? document.querySelector<HTMLButtonElement>('.pane-bar .title'))?.focus();
  }

  async function showFiles() {
    reading = false;
    await tick();
    fileList?.querySelector<HTMLButtonElement>('[aria-current="true"]')?.focus();
  }

  async function pick(file: GitChange, fromList = false) {
    picked = file;
    reading = true;
    await tick();
    if (fromList && filesButton?.offsetWidth) filesButton.focus();
    if (!fromList) fileList?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' });
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
    if (error) return error;
    if (!status) return loading ? 'Reading changes…' : 'Git repository unavailable.';
    if (!status.changes.length) return 'Working tree is clean.';
    return files.length ? '' : 'No files match your filter.';
  });
</script>

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
    <button class="refresh" title="Refresh changes" aria-label="Refresh changes" disabled={loading} onclick={load}>
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
    <nav bind:this={fileList} aria-label="Files by Git status">
      {#each groups as group (group.area)}
        <h2>{group.label} <span>{group.files.length}</span></h2>
        {#each group.files as file (file.path)}
          {@const cut = file.path.lastIndexOf('/') + 1}
          <button class="file" aria-current={file === selected ? 'true' : undefined}
            title={`${file.status}: ${file.from ? file.from + ' → ' : ''}${file.path}`}
            onclick={() => pick(file, true)}>
            <span class="letter" class:green={file.area === 'staged' || file.area === 'untracked'} class:red={file.status === 'deleted' || file.area === 'conflict'} aria-label={file.status}>{letters[file.status]}</span>
            <span class="path">
              <strong>{file.path.slice(cut)}</strong>
              {#if file.from || cut}<small>{file.from ? `← ${file.from}` : file.path.slice(0, cut - 1)}</small>{/if}
            </span>
            <span class="lines">
              {#if file.binary}binary{:else}
                {#if file.added}<span class="plus">+{file.added}</span>{/if}
                {#if file.deleted}<span class="minus">−{file.deleted}</span>{/if}
              {/if}
            </span>
          </button>
        {/each}
      {/each}
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
  .back:hover, .refresh:hover, .files-button:hover, .file:hover { background: var(--hover); }
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
  h1, h2 { display: flex; align-items: center; gap: 7px; margin: 0; }
  h1 { font-size: 16px; }
  h1 span, h2 span { color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
  h1 span { background: var(--sunken); padding: 1px 6px; border-radius: 5px; }
  .repo, .branch { margin-top: 5px; color: var(--muted); font: 12px var(--mono); }
  .branch { display: flex; align-items: center; gap: 5px; }
  .branch svg { flex: none; }
  nav { min-height: 0; overflow: auto; padding: 0 8px 14px; }
  h2 { padding: 15px 8px 5px; font-size: 12px; color: var(--muted); }
  .file {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-height: 34px;
    padding: 6px 8px;
    border: 0;
    border-radius: 5px;
    background: transparent;
    text-align: left;
  }
  .file[aria-current] { background: var(--accent-soft); box-shadow: inset 2px 0 var(--accent); }
  .letter { flex: none; width: 17px; text-align: center; font: 600 12px var(--mono); color: var(--muted); }
  .letter.green, .plus { color: var(--presence); }
  .letter.red, .minus { color: var(--danger); }
  .path { flex: 1; min-width: 0; }
  .path strong, .path small { display: block; }
  .path strong { font-size: 13px; }
  .path small { margin-top: 2px; color: var(--muted); font-size: 11.5px; }
  .chat-title, .repo, .branch span, .path strong, .path small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .lines { display: flex; gap: 4px; color: var(--muted); font: 11px var(--mono); }
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
    .file { min-height: 44px; }
  }
</style>
