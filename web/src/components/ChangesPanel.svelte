<script lang="ts">
  import { tick } from 'svelte';
  import type { GitChange, GitStatus } from '../../../shared/protocol';
  import { ago } from '../lib/format';
  import { placeBelow } from '../lib/popover';
  import { app } from '../lib/state.svelte';
  import DiffView from './DiffView.svelte';

  // The Changes chip beside the chat's title, shown when the chat's folder is
  // in a git repository: how much is changed and not committed, and, opened,
  // which files, grouped as git groups them, with lines added and removed.

  let open = $state(false);
  let loading = $state(false);
  let error = $state('');
  let status = $state<GitStatus | null>(null);
  let chip = $state<HTMLButtonElement>();
  let card = $state<HTMLElement>();
  let place = $state({ top: 0, left: 0, width: 460 });
  /** The file whose diff is open; the list stays open behind it, to pick the next one. */
  let viewing = $state<GitChange | null>(null);

  const summary = $derived(app.meta?.gitChanges);
  const dirty = $derived((summary?.files ?? 0) > 0);
  const label = $derived(
    !summary
      ? ''
      : dirty
        ? `Uncommitted changes: ${summary.files} file${summary.files === 1 ? '' : 's'}, ${summary.added} lines added, ${summary.deleted} removed`
        : 'No uncommitted changes',
  );

  async function load() {
    const id = app.sessionId;
    if (!id) return;
    loading = true;
    error = '';
    try {
      const answer = await app.loadGitStatus(id);
      if (id === app.sessionId) status = answer;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      loading = false;
    }
  }

  async function toggle() {
    open = !open;
    if (!open) return;
    if (chip) place = placeBelow(chip, 480);
    void load();
    await tick();
    card?.focus();
  }

  // Another chat, another repository.
  $effect(() => {
    app.sessionId;
    open = false;
    status = null;
    error = '';
  });

  // While the list is open, it follows the counts the server keeps current as Claude works.
  $effect(() => {
    summary?.checkedAt;
    if (open) void load();
  });

  const GROUPS: { area: GitChange['area']; title: string; note: string }[] = [
    { area: 'conflict', title: 'In conflict', note: 'Both sides changed these; they need resolving before a commit.' },
    { area: 'staged', title: 'Staged', note: 'Added with git add, and in the next commit.' },
    { area: 'unstaged', title: 'Not staged', note: 'Changed since the last commit or git add.' },
    { area: 'untracked', title: 'Untracked', note: 'New files git is not keeping yet.' },
  ];

  const LETTER: Record<GitChange['status'], string> = {
    modified: 'M',
    added: 'A',
    deleted: 'D',
    renamed: 'R',
    copied: 'C',
    'type changed': 'T',
    untracked: 'U',
    conflict: '!',
  };

  const groups = $derived(
    GROUPS.map((group) => ({ ...group, changes: (status?.changes ?? []).filter((change) => change.area === group.area) })).filter(
      (group) => group.changes.length,
    ),
  );

  function split(path: string): { dir: string; name: string } {
    const cut = path.lastIndexOf('/') + 1;
    return { dir: path.slice(0, cut), name: path.slice(cut) };
  }
</script>

<svelte:window
  onpointerdown={(event) => {
    const target = event.target as Node;
    if (open && !viewing && !chip?.contains(target) && !card?.contains(target)) open = false;
  }}
  onkeydown={(event) => {
    if (open && !viewing && event.key === 'Escape') {
      open = false;
      chip?.focus();
    }
  }}
  onresize={() => {
    if (open && chip) place = placeBelow(chip, 480);
  }}
/>

{#if summary}
  <button
    class="chip"
    class:open
    class:dirty
    bind:this={chip}
    aria-haspopup={dirty ? 'dialog' : undefined}
    aria-expanded={dirty ? open : undefined}
    aria-label={label}
    title={label}
    disabled={!dirty}
    onclick={toggle}
  >
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="8" cy="8" r="2.5" />
      <path d="M1.5 8h4M10.5 8h4" />
    </svg>
    {#if dirty}
      <span class="word">Changes</span>
      <strong>{summary.files}</strong>
      {#if summary.added}<span class="plus">+{summary.added}</span>{/if}
      {#if summary.deleted}<span class="minus">−{summary.deleted}</span>{/if}
      <svg class="caret" width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M2 3.5 5 6.5l3-3" />
      </svg>
    {:else}
      <span class="word">No changes</span>
    {/if}
  </button>
{/if}

{#if open}
  <div
    class="card"
    role="dialog"
    aria-label="Uncommitted changes"
    tabindex="-1"
    bind:this={card}
    style:top={`${place.top}px`}
    style:left={`${place.left}px`}
    style:width={`${place.width}px`}
  >
    <header>
      <div>
        <h2>Uncommitted changes</h2>
        {#if status}
          <p class="where">
            <code>{status.root}</code>
            {#if status.branch}on <strong class="branch">{status.branch}</strong>{/if}
            {#if status.ahead}· {status.ahead} commit{status.ahead === 1 ? '' : 's'} not pushed{/if}
            {#if status.behind}· {status.behind} to pull{/if}
          </p>
        {/if}
      </div>
      <button class="refresh" class:spin={loading} aria-label="Look again" title="Look again" disabled={loading} onclick={load}>
        <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M16 10a6 6 0 1 1-1.8-4.3M16.5 3.5v3h-3" />
        </svg>
      </button>
    </header>

    {#if error}<p class="error" role="alert">{error}</p>{/if}

    {#if status}
      {#if !groups.length}
        <p class="empty">Everything is committed.</p>
      {/if}
      {#each groups as group (group.area)}
        <section>
          <h3 title={group.note}>{group.title} <span class="count">{group.changes.length}</span></h3>
          <ul>
            {#each group.changes as change (`${change.area}:${change.path}`)}
              {@const parts = split(change.path)}
              <li>
                <button
                  class="row"
                  title={`${change.status}: ${change.from ? `${change.from} → ` : ''}${change.path}. Click to see the changes`}
                  onclick={() => (viewing = change)}
                >
                <span class="letter {change.status === 'deleted' ? 'gone' : change.area}" aria-label={change.status}>{LETTER[change.status]}</span>
                <span class="path">
                  {#if change.from}<span class="dir">{change.from} →&nbsp;</span>{/if}<span class="dir">{parts.dir}</span><span class="name">{parts.name}</span>
                </span>
                <span class="lines">
                  {#if change.binary}
                    <span class="muted">binary</span>
                  {:else if change.added === undefined && change.deleted === undefined}
                    <span class="muted">—</span>
                  {:else}
                    {#if change.added}<span class="plus">+{change.added}</span>{/if}
                    {#if change.deleted}<span class="minus">−{change.deleted}</span>{/if}
                    {#if !change.added && !change.deleted}<span class="muted">0</span>{/if}
                  {/if}
                </span>
                </button>
              </li>
            {/each}
          </ul>
        </section>
      {/each}
      {#if status.truncated}
        <p class="empty">More files changed than are listed here; <code>git status</code> in a terminal shows them all.</p>
      {/if}
      <p class="foot">
        {status.files} file{status.files === 1 ? '' : 's'} · <span class="plus">+{status.added}</span> <span class="minus">−{status.deleted}</span> ·
        checked {ago(status.checkedAt) === 'now' ? 'just now' : `${ago(status.checkedAt)} ago`}
      </p>
    {:else if loading}
      <p class="empty"><span class="spinner"></span> Asking git…</p>
    {/if}
  </div>
{/if}

{#if viewing}
  <DiffView change={viewing} onclose={() => (viewing = null)} />
{/if}

<style>
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    margin-left: 6px;
    padding: 2px 6px 2px 5px;
    border: 1px solid var(--border);
    border-radius: 5px;
    background: none;
    color: inherit;
    font-size: 12px;
    vertical-align: middle;
  }

  .chip.dirty:hover,
  .chip.open {
    border-color: var(--border-strong);
    background: var(--hover);
    color: var(--text);
  }

  /* With nothing to show, it only says so. */
  .chip:disabled {
    border-style: dashed;
    cursor: default;
    opacity: 0.75;
  }

  .chip strong {
    color: var(--text);
    font-weight: 700;
  }

  .caret {
    opacity: 0.7;
  }

  .plus,
  .minus {
    font-variant-numeric: tabular-nums;
    font-weight: 700;
  }

  .plus {
    color: var(--presence);
  }

  .minus {
    color: var(--danger);
  }

  .card {
    position: fixed;
    z-index: 40;
    display: grid;
    gap: 12px;
    max-height: calc(100dvh - 80px);
    overflow-y: auto;
    padding: 14px 16px 12px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow);
    font-size: 13.5px;
    white-space: normal;
  }

  .card:focus {
    outline: none;
  }

  header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
  }

  h2 {
    margin: 0;
    font-size: 15px;
    font-weight: 900;
  }

  .where {
    margin: 2px 0 0;
    color: var(--muted);
    font-size: 12.5px;
  }

  .branch {
    color: var(--series-7);
    font-family: var(--mono);
  }

  code {
    font: 12px var(--mono);
  }

  .refresh {
    display: grid;
    place-items: center;
    flex: none;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: none;
    color: var(--muted);
  }

  .refresh:hover:not(:disabled) {
    background: var(--hover);
    color: var(--text);
  }

  .refresh.spin svg {
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  h3 {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0 0 4px;
    color: var(--muted);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }

  .count {
    padding: 0 6px;
    border-radius: 999px;
    background: var(--sunken);
    font-size: 11.5px;
    letter-spacing: 0;
    line-height: 17px;
  }

  ul {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    display: block;
  }

  /* Each file is a button: it opens the file's diff. */
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-height: 26px;
    padding: 2px 6px;
    border: 0;
    border-radius: 5px;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .row:hover,
  .row:focus-visible {
    outline: none;
    background: var(--hover);
  }

  /* The letter git uses for the change, on the group's colour. */
  .letter {
    display: grid;
    place-items: center;
    flex: none;
    width: 18px;
    height: 18px;
    border-radius: 4px;
    background: var(--sunken);
    color: var(--muted);
    font: 700 11px var(--mono);
  }

  .letter.staged {
    background: color-mix(in srgb, var(--presence) 20%, transparent);
    color: var(--presence);
  }

  .letter.unstaged {
    background: color-mix(in srgb, var(--series-4) 22%, transparent);
    color: var(--text);
  }

  .letter.untracked {
    background: color-mix(in srgb, var(--series-1) 20%, transparent);
    color: var(--text);
  }

  .letter.gone,
  .letter.conflict {
    background: var(--danger-soft);
    color: var(--danger);
  }

  .path {
    display: flex;
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    font: 12.5px var(--mono);
  }

  /* A long path gives way in its folder part, so the file's own name stays whole. */
  .dir {
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--muted);
  }

  .name {
    flex: none;
    font-weight: 700;
  }

  .lines {
    display: inline-flex;
    gap: 6px;
    flex: none;
    font: 12px var(--mono);
  }

  .muted {
    color: var(--muted);
  }

  .empty,
  .foot {
    margin: 0;
    color: var(--muted);
    font-size: 12.5px;
  }

  .foot {
    padding-top: 8px;
    border-top: 1px solid var(--border);
  }

  .error {
    margin: 0;
    color: var(--danger);
  }

  @media (max-width: 600px) {
    .word {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .refresh.spin svg {
      animation: none;
    }
  }
</style>
