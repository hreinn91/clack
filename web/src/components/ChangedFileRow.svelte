<script lang="ts">
  import type { GitChange } from '../../../shared/protocol';
  import { areaLabel } from '../lib/gitChanges';

  let { file, showDirectory = false, selected = false, onpick }: {
    file: GitChange;
    showDirectory?: boolean;
    selected?: boolean;
    onpick: (file: GitChange) => void;
  } = $props();

  const letters: Record<GitChange['status'], string> = {
    modified: 'M', added: 'A', deleted: 'D', renamed: 'R', copied: 'C',
    'type changed': 'T', untracked: 'U', conflict: '!',
  };
  const path = $derived(file.path.replace(/\/$/, ''));
  const cut = $derived(path.lastIndexOf('/') + 1);
  const description = $derived([
    file.from ? `${file.from} → ${file.path}` : file.path,
    areaLabel[file.area],
    ...(file.area === 'staged' || file.area === 'unstaged' ? [file.status] : []),
  ].join(' · '));
  const lineSummary = $derived.by(() => {
    if (file.binary) return 'Binary file';
    if (file.added === undefined && file.deleted === undefined) return 'Line counts unavailable';
    return `Lines added ${file.added ?? 0}, lines removed ${file.deleted ?? 0}.`;
  });
</script>

<button class="file" aria-current={selected ? 'true' : undefined} aria-label={`${description}. ${lineSummary}`}
  title={description} onclick={() => onpick(file)}>
  <span class="mark" aria-hidden="true"
    class:added={file.status === 'added' || file.area === 'untracked'}
    class:removed={file.status === 'deleted' || file.area === 'conflict'}>
    {letters[file.status]}
  </span>
  <span class="path">
    <strong>{path.slice(cut)}</strong>
    <small>{areaLabel[file.area]}{#if showDirectory && cut} · {path.slice(0, cut - 1)}{/if}{#if file.from} · ← {file.from}{/if}</small>
  </span>
  <span class="stats">
    {#if file.binary}Binary
    {:else if file.added || file.deleted}
      {#if file.added}<span class="plus">+{file.added}</span>{/if}
      {#if file.deleted}<span class="minus">−{file.deleted}</span>{/if}
    {:else if file.added === 0 || file.deleted === 0}±0
    {:else}<span title="Line counts unavailable">—</span>{/if}
  </span>
</button>

<style>
  .file {
    display: grid;
    grid-template-columns: 20px minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-height: 42px;
    padding: 4px 8px 4px calc(8px + var(--tree-indent, 0px));
    border: 0;
    border-radius: 5px;
    background: transparent;
    color: var(--text);
    text-align: left;
  }
  .file:hover { background: var(--hover); }
  .file[aria-current] { background: var(--accent-soft); box-shadow: inset 2px 0 var(--accent); }
  .file:focus-visible { outline-offset: -2px; }
  .mark {
    display: grid;
    place-items: center;
    height: 20px;
    border-radius: 4px;
    background: var(--sunken);
    color: var(--muted);
    font: 700 11px var(--mono);
  }
  .mark.added { background: var(--add); color: var(--git-added-text); }
  .mark.removed { background: var(--del); color: var(--danger); }
  .path strong, .path small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .path strong { font-size: 13px; line-height: 17px; }
  .path small { color: var(--muted); font-size: 11.5px; line-height: 16px; }
  .stats { display: flex; gap: 5px; color: var(--muted); font: 11.5px var(--mono); }
  .plus { color: var(--git-added-text); }
  .minus { color: var(--danger); }
  @media (pointer: coarse) {
    .file { min-height: 44px; }
  }
</style>
