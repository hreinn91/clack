<script lang="ts">
  import type { GitChange, GitDiff } from '../../../shared/protocol';
  import { highlight, parseDiff } from '../lib/diff';
  import type { Hunk } from '../lib/diff';
  import { app } from '../lib/state.svelte';

  // One changed file, as a diff: removed lines over added ones, with their
  // numbers in the old and new file, coloured as code in the theme's own code
  // colours. Shows the changes with a few lines around them, or the whole file.

  let {
    change,
    place,
    onprev,
    onnext,
  }: {
    change: GitChange;
    /** "2 of 5", where the file is in the list. */
    place?: string;
    onprev?: () => void;
    onnext?: () => void;
  } = $props();

  let whole = $state(false);
  let loading = $state(true);
  let error = $state('');
  let diff = $state<GitDiff | null>(null);
  let hunks = $state<Hunk[]>([]);

  /** New files and files in conflict are always shown whole: there is nothing around the changes to leave out. */
  const always = $derived(change.area === 'untracked' || change.area === 'conflict');

  const AREA: Record<GitChange['area'], string> = {
    staged: 'Staged',
    unstaged: 'Not staged',
    untracked: 'New, not tracked',
    conflict: 'In conflict',
  };

  // Refreshes of the same file keep its scroll position. A new file starts at the top.
  let shown = '';
  $effect(() => {
    const session = app.sessionId;
    if (!session) return;
    const file = change;
    const key = JSON.stringify([session, file.area, file.path]);
    const showWhole = whole;
    if (key !== shown) {
      diff = null;
      hunks = [];
      shown = key;
    }

    let current = true;
    loading = true;
    error = '';
    async function read(id: string) {
      try {
        const answer = await app.loadGitDiff(id, file, showWhole);
        if (!current) return;
        const parsed = parseDiff(answer.diff);
        await highlight(parsed, file.path);
        if (current) {
          diff = answer;
          hunks = parsed;
        }
      } catch (err) {
        if (current) error = err instanceof Error ? err.message : String(err);
      } finally {
        if (current) loading = false;
      }
    }
    void read(session);
    return () => { current = false; };
  });

  const cut = $derived(change.path.lastIndexOf('/') + 1);
  const added = $derived(hunks.reduce((sum, h) => sum + h.lines.filter((l) => l.kind === 'add').length, 0));
  const removed = $derived(hunks.reduce((sum, h) => sum + h.lines.filter((l) => l.kind === 'del').length, 0));

  /** Lines left out before a hunk (from the line numbers), so the gap can say how many. */
  function skipped(index: number): number {
    const hunk = hunks[index];
    const first = hunk?.lines.find((line) => line.new !== undefined)?.new;
    if (first === undefined) return 0;
    if (index === 0) return first - 1;
    let before = 0;
    for (const line of hunks[index - 1]!.lines) if (line.new !== undefined) before = line.new;
    return first - before - 1;
  }
</script>

<div class="diff">
  <div class="head">
    <div class="file">
      <p class="path" title={change.from ? `${change.from} → ${change.path}` : change.path}>
        {#if change.from}<span class="dir">{change.from} → </span>{/if}<span class="dir">{change.path.slice(0, cut)}</span><strong>{change.path.slice(cut)}</strong>
      </p>
      <p class="meta">
        <span class="badge {change.area}">{AREA[change.area]}</span>
        <span>{change.status}</span>
        {#if diff && !diff.binary && !diff.tooLarge}
          {#if added}<span class="plus">+{added}</span>{/if}
          {#if removed}<span class="minus">−{removed}</span>{/if}
        {/if}
        {#if loading && diff}<span class="spinner small" aria-label="Reading again"></span>{/if}
      </p>
    </div>
    {#if !always}
      <div class="modes" role="radiogroup" aria-label="How much to show">
        <button role="radio" aria-checked={!whole} class:on={!whole} onclick={() => (whole = false)}>Changes</button>
        <button role="radio" aria-checked={whole} class:on={whole} onclick={() => (whole = true)}>Whole file</button>
      </div>
    {/if}
    {#if onprev || onnext}
      <div class="step">
        <button aria-label="Previous file" title="Previous file" disabled={!onprev} onclick={() => onprev?.()}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 3.5 5.5 8l4.5 4.5" /></svg>
        </button>
        {#if place}<span>{place}</span>{/if}
        <button aria-label="Next file" title="Next file" disabled={!onnext} onclick={() => onnext?.()}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5" /></svg>
        </button>
      </div>
    {/if}
  </div>

  {#if error}
    <p class="note error" role="alert">{error}</p>
  {:else if !diff}
    <p class="note"><span class="spinner"></span> Reading the changes…</p>
  {:else if diff.binary}
    <p class="note">This is a binary file, so there is no text to show.</p>
  {:else if diff.tooLarge}
    <p class="note">This file is too big to show here (over 1 MB).</p>
  {:else if !hunks.length}
    <p class="note">
      {change.from ? `Renamed from ${change.from}; nothing in it changed.` : 'Nothing in the text changed (the file mode may have).'}
    </p>
  {:else}
    <!-- Focusable so the code can be scrolled with the keyboard. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div class="diff-scroll syntax" tabindex="0" role="region" aria-label={`Diff of ${change.path}`}>
      <table>
        <tbody>
          {#each hunks as hunk, index (index)}
            {#if !whole && !always}
              {@const gap = skipped(index)}
              <tr class="hunk">
                <td class="no" colspan="2">
                  {#if gap > 0}
                    <button class="gap" title="Show the whole file" onclick={() => (whole = true)}>⋯ {gap}</button>
                  {/if}
                </td>
                <td class="text" colspan="2">{hunk.header} <span class="where">{hunk.context}</span></td>
              </tr>
            {/if}
            {#each hunk.lines as line, i (i)}
              <tr class={line.kind} class:marker={line.marker}>
                <td class="no old">{line.old ?? ''}</td>
                <td class="no new">{line.new ?? ''}</td>
                <td class="sign">{line.kind === 'add' ? '+' : line.kind === 'del' ? '−' : ''}</td>
                {#if line.kind === 'note'}
                  <td class="text">{line.text}</td>
                {:else}
                  <!-- highlight.js escapes the code; what it adds is only spans with classes. -->
                  <td class="text">{@html line.html ?? ''}</td>
                {/if}
              </tr>
            {/each}
          {/each}
        </tbody>
      </table>
      {#if diff.truncated}<p class="note">The diff is long: only the start is shown.</p>{/if}
    </div>
  {/if}
</div>

<style>
  .diff {
    display: flex;
    flex-direction: column;
    min-height: 0;
    flex: 1;
  }

  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 10px;
    padding: 10px 14px;
    border-bottom: 1px solid var(--border);
  }

  .file {
    flex: 1 1 200px;
    min-width: 0;
    display: grid;
    gap: 3px;
  }

  .path {
    margin: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font: 13.5px var(--mono);
  }

  .dir {
    color: var(--muted);
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin: 0;
    color: var(--muted);
    font-size: 12.5px;
  }

  .badge {
    padding: 0 7px;
    border: 1px solid var(--border-strong);
    border-radius: 999px;
    color: var(--text);
    font-weight: 600;
  }

  .badge.conflict {
    border-color: var(--danger);
    color: var(--danger);
  }

  .plus {
    color: var(--presence);
    font-weight: 700;
  }

  .minus {
    color: var(--danger);
    font-weight: 700;
  }

  .spinner.small {
    width: 11px;
    height: 11px;
  }

  .modes {
    display: flex;
    flex: none;
    padding: 2px;
    border: 1px solid var(--border);
    border-radius: 7px;
    background: var(--sunken);
  }

  .modes button {
    padding: 3px 10px;
    border: 0;
    border-radius: 5px;
    background: none;
    color: var(--muted);
    font-size: 13px;
  }

  .modes button.on {
    background: var(--surface);
    color: var(--text);
    box-shadow: 0 1px 2px rgb(0 0 0 / 15%);
  }

  .step {
    display: flex;
    align-items: center;
    gap: 2px;
    flex: none;
    color: var(--muted);
    font-size: 12.5px;
  }

  .step span {
    padding: 0 4px;
    font-variant-numeric: tabular-nums;
  }

  .step button {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    padding: 0;
    border: 0;
    border-radius: 5px;
    background: none;
    color: inherit;
  }

  .step button:hover:not(:disabled) {
    background: var(--hover);
    color: var(--text);
  }

  .step button:disabled {
    opacity: 0.35;
  }

  .note {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    padding: 16px;
    color: var(--muted);
  }

  .note.error {
    color: var(--danger);
  }

  /* The code in the theme's code colours: its terminal background and palette. */
  .diff-scroll {
    flex: 1;
    min-height: 0;
    overflow: auto;
    background: var(--code-bg);
    color: var(--code-fg);
    font: 12.5px/1.6 var(--mono);
  }

  .diff-scroll:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: -2px;
  }

  .diff-scroll .note {
    color: var(--code-gutter-text);
  }

  table {
    min-width: 100%;
    border-collapse: collapse;
  }

  td {
    padding: 0;
    vertical-align: top;
  }

  /* Line numbers stay in view while long lines scroll sideways. */
  .no {
    position: sticky;
    width: 4.6em;
    min-width: 4.6em;
    padding: 0 8px;
    background: var(--code-gutter);
    color: var(--code-gutter-text);
    text-align: right;
    user-select: none;
  }

  .no.old {
    left: 0;
  }

  .no.new {
    left: 4.6em;
    box-shadow: inset -1px 0 var(--code-hunk);
  }

  .sign {
    width: 1.6em;
    padding-left: 6px;
    user-select: none;
  }

  .text {
    padding-right: 16px;
    white-space: pre;
  }

  tr.add {
    background: var(--code-add);
  }

  tr.add .no {
    background: color-mix(in srgb, var(--code-add) 70%, var(--code-gutter));
  }

  tr.add .sign {
    color: var(--code-add-sign);
  }

  tr.del {
    background: var(--code-del);
  }

  tr.del .no {
    background: color-mix(in srgb, var(--code-del) 70%, var(--code-gutter));
  }

  tr.del .sign {
    color: var(--code-del-sign);
  }

  tr.marker {
    background: var(--code-mark);
    font-weight: 700;
  }

  tr.note .text {
    color: var(--code-gutter-text);
    font-style: italic;
  }

  tr.hunk td {
    background: var(--code-hunk);
    color: var(--code-hunk-text);
  }

  tr.hunk .text {
    padding: 3px 16px 3px 6px;
  }

  .where {
    opacity: 0.8;
  }

  .gap {
    padding: 0 4px;
    border: 0;
    border-radius: 4px;
    background: none;
    color: inherit;
    font: inherit;
  }

  .gap:hover {
    background: var(--code-gutter);
    color: var(--code-fg);
  }
</style>
