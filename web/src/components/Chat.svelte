<script lang="ts">
  import type { Item } from '../../../shared/protocol';
  import { authorName, dayKey, dayLabel } from '../lib/format';
  import { app } from '../lib/state.svelte';
  import ActionMenu from './ActionMenu.svelte';
  import Avatar from './Avatar.svelte';
  import Composer from './Composer.svelte';
  import Entry from './Entry.svelte';
  import Markdown from './Markdown.svelte';
  import Message from './Message.svelte';
  import PermissionCard from './PermissionCard.svelte';

  let { onmenu }: { onmenu: () => void } = $props();

  let scroller = $state<HTMLElement>();
  let thread = $state<HTMLElement>();
  // Follow new output only while the reader is already at the bottom.
  let follow = true;

  // The sidebar's title is the freshest one, so the two never disagree.
  const title = $derived(
    app.sessions.find((s) => s.sessionId === app.sessionId)?.title ?? app.meta?.title ?? 'New chat',
  );

  const folder = $derived(app.meta?.folder ?? '');
  /** The chat's folder was deleted: it can be read, and continued once it has a folder again. */
  const gone = $derived(app.meta?.folderMissing ?? false);

  /** This chat as the sidebar lists it. Missing for a moment while a brand-new chat has nothing in it. */
  const summary = $derived(
    app.sessions.find((s) => s.sessionId === app.sessionId) ??
      (app.sessionId && app.meta
        ? { sessionId: app.sessionId, title, folder, lastModified: Date.now(), running: app.running, archived: false, missing: app.meta.folderMissing }
        : undefined),
  );

  const actions = $derived(
    summary
      ? [
          { label: 'Rename…', run: () => startRename() },
          ...(gone ? [{ label: 'Recreate folder', run: () => void app.restoreFolder(summary.sessionId) }] : []),
          { label: 'Change folder…', run: () => (app.dialog = { kind: 'move', session: summary }) },
          ...(summary.archived
            ? [{ label: 'Take out of archive', run: () => void app.archiveChat(summary.sessionId, false) }]
            : gone
              ? []
              : [{ label: 'Archive', run: () => void app.archiveChat(summary.sessionId, true) }]),
          { label: 'Delete…', danger: true, run: () => (app.dialog = { kind: 'delete', session: summary }) },
        ]
      : [],
  );

  // Renaming happens right in the header: the title turns into a field.
  let renaming = $state(false);
  let draftTitle = $state('');
  let titleField = $state<HTMLInputElement>();

  function startRename() {
    draftTitle = title;
    renaming = true;
  }

  $effect(() => {
    if (renaming) titleField?.select();
  });

  // Another chat was opened: an unfinished rename belonged to the old one.
  $effect(() => {
    app.sessionId;
    renaming = false;
  });

  async function finishRename() {
    if (!renaming) return;
    renaming = false;
    const next = draftTitle.trim();
    if (!next || next === title || !app.sessionId) return;
    try {
      await app.renameChat(app.sessionId, next);
    } catch (err) {
      app.error = err instanceof Error ? err.message : String(err);
    }
  }

  type Group = {
    id: string;
    kind: 'person' | 'model' | 'system';
    name: string;
    ts?: number;
    /** Set on the first group of a calendar day. */
    day?: string;
    items: Item[];
  };

  /**
   * The transcript as a chat shows it: everything one sender wrote in a row
   * sits under a single name. For Claude that is a whole turn, with its
   * thinking, tool calls and text.
   */
  const groups = $derived.by(() => {
    const out: Group[] = [];
    let day = '';
    for (const item of app.items) {
      const kind = item.kind === 'user' ? 'person' : item.kind === 'notice' ? 'system' : 'model';
      const last = out.at(-1);
      if (last?.kind === kind) {
        last.items.push(item);
        continue;
      }
      const group: Group = { id: item.id, kind, name: '', ts: item.ts, items: [item] };
      if (item.ts && dayKey(item.ts) !== day) {
        day = dayKey(item.ts);
        group.day = dayLabel(item.ts);
      }
      out.push(group);
    }
    for (const group of out) {
      if (group.kind === 'person') group.name = app.userName;
      else if (group.kind === 'system') group.name = 'clack';
      else {
        // A subagent's entries carry no signature, so this is always the model the person is talking to.
        const signed = group.items.find((item) => item.model);
        group.name = signed ? authorName(signed.model, group.items.find((item) => item.effort)?.effort) : 'Claude';
      }
    }
    return out;
  });

  // Streaming text, the working indicator and questions for the person all belong to Claude's current turn.
  const live = $derived(app.running || app.drafts.length > 0 || app.pending.length > 0);
  const lastIsModel = $derived(groups.at(-1)?.kind === 'model');

  function onscroll() {
    if (!scroller) return;
    follow = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 80;
  }

  $effect(() => {
    app.sessionId;
    follow = true;
  });

  // Whenever the conversation grows or the view shrinks (a phone keyboard
  // opening, say), keep the newest output in sight.
  $effect(() => {
    const view = scroller;
    const content = thread;
    if (!view || !content) return;
    const observer = new ResizeObserver(() => {
      if (follow) view.scrollTop = view.scrollHeight;
    });
    observer.observe(view);
    observer.observe(content);
    return () => observer.disconnect();
  });
</script>

<header class="pane-bar">
  <button class="icon-btn menu" aria-label="Open menu" onclick={onmenu}>
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
      <path d="M3 5.5h14M3 10h14M3 14.5h14" />
    </svg>
  </button>
  {#if folder}<Avatar kind="folder" label={folder} size={24} />{/if}
  {#if renaming}
    <input
      class="title-field"
      aria-label="Chat name"
      maxlength="120"
      bind:this={titleField}
      bind:value={draftTitle}
      onblur={finishRename}
      onkeydown={(event) => {
        if (event.key === 'Enter') void finishRename();
        else if (event.key === 'Escape') renaming = false;
      }}
    />
  {:else}
    <h1><button class="title" title="Rename this chat" onclick={startRename}>{title}</button></h1>
  {/if}
  <p class="where">
    {#if folder && summary}
      <button class="folder" title="The folder this chat works in. Click to change it." onclick={() => (app.dialog = { kind: 'move', session: summary })}>
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" aria-hidden="true">
          <path d="M1.75 4.25c0-.7.55-1.25 1.25-1.25h3l1.5 1.75H13c.7 0 1.25.55 1.25 1.25v5.75c0 .7-.55 1.25-1.25 1.25H3c-.7 0-1.25-.55-1.25-1.25z" />
        </svg>
        {folder}
      </button>
    {/if}
    {#if gone}
      <span class="archived" title="This chat's folder was deleted">Folder deleted</span>
    {:else if summary?.archived}
      <span class="archived">Archived</span>
    {/if}
  </p>
  {#if !app.connected}<span class="offline">Reconnecting…</span>{/if}
  {#if summary}<ActionMenu label="More for this chat" {actions} />{/if}
</header>

{#snippet liveOutput()}
  {#each app.drafts as draft (draft.id)}
    {#if draft.kind === 'text'}
      <div class="streaming"><Markdown text={draft.text} /></div>
    {:else if draft.kind === 'thinking'}
      <p class="working"><span class="spinner"></span> Thinking…</p>
    {:else}
      <p class="working"><span class="spinner"></span> Preparing {draft.text}…</p>
    {/if}
  {/each}

  {#if app.running && !app.drafts.length && !app.pending.length}
    <p class="working"><span class="spinner"></span> Working…</p>
  {/if}

  {#each app.pending as request (request.id)}
    <PermissionCard {request} />
  {/each}
{/snippet}

<div class="scroll" bind:this={scroller} {onscroll}>
  <div class="thread" bind:this={thread}>
    {#if app.opening}
      <p class="empty"><span class="spinner"></span> Loading conversation…</p>
    {:else if app.meta && !app.items.length}
      <div class="empty">
        <Avatar kind="folder" label={folder} size={48} />
        <h2>{folder}</h2>
        <p>This is the very beginning of this chat. Claude will work in <code>{folder}</code>. What would you like to do?</p>
      </div>
    {/if}

    {#each groups as group, index (group.id)}
      {#if group.day}
        <div class="day" role="separator"><span>{group.day}</span></div>
      {/if}
      <Message kind={group.kind} name={group.name} ts={group.ts}>
        {#each group.items as item (item.id)}
          <Entry {item} />
        {/each}
        {#if live && group.kind === 'model' && index === groups.length - 1}
          {@render liveOutput()}
        {/if}
      </Message>
    {/each}

    {#if live && !lastIsModel}
      <!-- Nothing finished to take a name from yet, so this is signed with who is expected to answer. -->
      <Message kind="model" name={app.modelName}>
        {@render liveOutput()}
      </Message>
    {/if}

    {#if app.error}
      <p class="error" role="alert">
        {app.error}
        <button class="btn ghost" onclick={() => (app.error = null)}>Dismiss</button>
      </p>
    {/if}
  </div>
</div>

{#if gone && summary}
  <div class="gone" role="status">
    <p>
      The folder <code>{folder}</code> was deleted, so this chat is with the archived ones. You can read it; to carry on,
      create the folder again (empty) or move the chat to another folder.
    </p>
    <div class="gone-actions">
      <button class="btn primary" onclick={() => void app.restoreFolder(summary.sessionId)}>Recreate folder</button>
      <button class="btn" onclick={() => (app.dialog = { kind: 'move', session: summary })}>Change folder…</button>
    </div>
  </div>
{/if}

<Composer />

<style>
  h1 {
    flex: 0 1 auto;
    min-width: 0;
  }

  .where {
    flex: 1 1 0;
    min-width: 0;
    margin: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    color: var(--muted);
    font-size: 13px;
  }

  h1:has(.title) {
    margin-left: -6px;
  }

  .title {
    display: block;
    max-width: 100%;
    margin: 0;
    padding: 2px 6px;
    border: 0;
    border-radius: 6px;
    background: none;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font: inherit;
    cursor: text;
  }

  .title:hover {
    background: var(--hover);
  }

  .title-field {
    flex: 0 1 420px;
    min-width: 0;
    height: 32px;
    padding: 0 8px;
    border: 1px solid var(--border-strong);
    border-radius: 6px;
    background: var(--bg);
    font-size: 18px;
    font-weight: 900;
  }

  .folder {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    max-width: 100%;
    padding: 2px 7px;
    border: 1px solid var(--border);
    border-radius: 5px;
    background: none;
    color: inherit;
    font: 12px var(--mono);
    vertical-align: middle;
  }

  .folder:hover {
    border-color: var(--border-strong);
    background: var(--hover);
    color: var(--text);
  }

  .folder svg {
    flex: none;
  }

  .gone {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 14px;
    margin: 0 16px 8px;
    padding: 10px 14px;
    border-radius: 8px;
    background: var(--sunken);
    font-size: 14px;
  }

  .gone p {
    flex: 1 1 280px;
    margin: 0;
  }

  .gone-actions {
    display: flex;
    gap: 8px;
  }

  .archived {
    margin-left: 6px;
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--sunken);
    font-size: 12px;
    font-weight: 700;
    vertical-align: middle;
  }

  .offline {
    flex: none;
    padding: 2px 10px;
    border-radius: 999px;
    background: var(--danger-soft);
    color: var(--danger);
    font-size: 12.5px;
  }

  .scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }

  /* A short conversation sits just above the message box, as it would in any chat. */
  .thread {
    min-height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    padding: 16px 0 8px;
  }

  .day {
    position: relative;
    display: grid;
    place-items: center;
    margin: 10px 0 6px;
  }

  .day::before {
    content: '';
    position: absolute;
    inset: 50% 0 auto;
    border-top: 1px solid var(--border);
  }

  .day span {
    position: relative;
    padding: 3px 14px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--bg);
    font-size: 13px;
    font-weight: 700;
  }

  .empty,
  .working {
    margin: 0;
    color: var(--muted);
  }

  .empty {
    padding: 8px 20px 20px;
  }

  .empty h2 {
    margin: 10px 0 2px;
    color: var(--text);
    font-size: 22px;
    font-weight: 900;
  }

  .empty p {
    margin: 0;
  }

  .empty code {
    font-family: var(--mono);
    font-size: 0.9em;
    color: var(--text);
  }

  .working {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13.5px;
  }

  .error {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin: 8px 20px 0;
    padding: 6px 6px 6px 12px;
    border-radius: 6px;
    background: var(--danger-soft);
    color: var(--danger);
  }

  /* Too narrow to show both: the title wins, and the picture still hints at the folder. */
  @media (max-width: 520px) {
    .where {
      display: none;
    }
  }

  @media (max-width: 820px) {
    .empty {
      padding-left: 14px;
      padding-right: 14px;
    }

    .error {
      margin-left: 14px;
      margin-right: 14px;
    }
  }
</style>
