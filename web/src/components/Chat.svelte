<script lang="ts">
  import { tick } from 'svelte';
  import ChatPlan from './ChatPlan.svelte';
  import type { Item, PlanItem, Provider } from '../../../shared/protocol';
  import { authorName, dayKey, dayLabel, folderPlace, isOutside, modelName, providerName } from '../lib/format';
  import { app } from '../lib/state.svelte';
  import ActionMenu from './ActionMenu.svelte';
  import ChangesPanel from './ChangesPanel.svelte';
  import ContextPanel from './ContextPanel.svelte';
  import TasksPanel from './TasksPanel.svelte';
  import Avatar from './Avatar.svelte';
  import Composer from './Composer.svelte';
  import Entry from './Entry.svelte';
  import Markdown from './Markdown.svelte';
  import Message from './Message.svelte';
  import PermissionCard from './PermissionCard.svelte';
  import ProviderChip from './ProviderChip.svelte';
  import ProviderMark from './ProviderMark.svelte';

  let { onmenu }: { onmenu: () => void } = $props();

  const plans = $derived(app.items.filter((item): item is PlanItem => item.kind === 'plan' && !!(item.markdown || item.steps.length)));
  const latest = $derived(plans.at(-1));
  let planOpen = $state(false);
  let planButton = $state<HTMLButtonElement>();
  let backButton = $state<HTMLButtonElement>();

  async function togglePlan(open: boolean) {
    planOpen = open;
    await tick();
    (open ? backButton : planButton)?.focus();
  }

  $effect(() => {
    app.sessionId;
    planOpen = false;
  });

  $effect(() => { if (!latest || app.changesOpen) planOpen = false; });

  let scroller = $state<HTMLElement>();
  let thread = $state<HTMLElement>();
  // Follow new output only while the reader is already at the bottom.
  let follow = true;

  // The sidebar's title is the freshest one, so the two never disagree.
  const title = $derived(
    app.sessions.find((s) => s.sessionId === app.sessionId)?.title ?? app.meta?.title ?? 'New chat',
  );

  const folder = $derived(app.meta?.folder ?? '');
  /** A folder outside data/sessions goes by its own name, and is written out from the home folder (~/code/site). */
  const outside = $derived(isOutside(folder));
  const folderName = $derived(outside ? (folder.split('/').pop() ?? folder) : folder);
  const folderShown = $derived(outside ? folderPlace(folder, app.home) : folder);
  /** The chat's folder was deleted: it can be read, and continued once it has a folder again. */
  const gone = $derived(app.meta?.folderMissing ?? false);

  /** This chat as the sidebar lists it. */
  const summary = $derived(app.currentChat);

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
    kind: 'person' | 'model' | 'system' | 'switch';
    name: string;
    /** For the agent's turns: which agent wrote them. A chat that switched has turns from both. */
    provider: Provider;
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
    // The agent before the first switch, if the chat ever switched; otherwise the one it runs on.
    let provider: Provider = app.items.find((item) => item.kind === 'divider')?.from ?? app.provider;
    for (const item of app.items) {
      if (item.kind === 'tool' && item.planId && !item.result?.isError) continue;
      if (item.kind === 'plan' && !item.steps.length && !item.markdown) continue;
      if (item.kind === 'divider') provider = item.to;
      const kind = item.kind === 'user' ? 'person' : item.kind === 'notice' ? 'system' : item.kind === 'divider' ? 'switch' : 'model';
      const last = out.at(-1);
      if (last?.kind === kind && kind !== 'switch' && kind !== 'person' && item.kind !== 'plan' && last.items[0]?.kind !== 'plan') {
        last.items.push(item);
        continue;
      }
      const group: Group = { id: item.id, kind, name: '', provider, ts: item.ts, items: [item] };
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
        group.name = signed
          ? authorName(signed.model, group.items.find((item) => item.effort)?.effort, group.provider)
          : providerName(group.provider);
      }
    }
    return out;
  });

  // Streaming text, the working indicator and questions for the person all belong to Claude's current turn.
  const live = $derived(app.running || app.drafts.length > 0 || app.pending.length > 0);
  const lastIsModel = $derived(groups.at(-1)?.kind === 'model');

  const streamingText = $derived(app.drafts.filter(draft => draft.kind === 'text').map(draft => draft.text).join('\n\n'));

  function messageText(group: Group, streaming: string): string {
    const parts = group.items.flatMap(item => {
      if (item.kind === 'plan' && item.markdown) return [item.markdown];
      return item.kind === 'user' || (item.kind === 'text' && !item.parent) ? [item.text] : [];
    });
    if (streaming) parts.push(streaming);
    return parts.join('\n\n');
  }

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

  // A finished reply counts as read once its chat is open and on screen: it then leaves the Active list.
  $effect(() => {
    const id = app.sessionId;
    if (!id || !app.visible || app.meta?.sessionId !== id) return;
    if (app.sessions.find((chat) => chat.sessionId === id)?.activity === 'done') app.seen(id);
  });
</script>

<header class="pane-bar">
  <button class="icon-btn menu" aria-label="Open menu" onclick={onmenu}>
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
      <path d="M3 5.5h14M3 10h14M3 14.5h14" />
    </svg>
  </button>
  {#if folder}<Avatar kind="folder" label={folderName} size={24} />{/if}
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
    <h1><button class="title" title={`${title} · Rename chat`} onclick={startRename}>{title}</button></h1>
  {/if}
  <p class="where">
    {#if summary}<ProviderChip />{/if}
    {#if summary && !gone}<ContextPanel /><TasksPanel />{/if}
    {#if gone}
      <span class="archived" title="This chat's folder was deleted">Folder deleted</span>
    {:else if summary?.archived}
      <span class="archived">Archived</span>
    {/if}
  </p>
  {#if latest}
    <button class="plan-tab" aria-pressed={planOpen} bind:this={planButton} onclick={() => togglePlan(!planOpen)}>
      <span aria-hidden="true">📋</span>
      Plan{#if latest.steps.length}<span class="plan-count">{latest.steps.filter(step => step.status === 'completed').length}/{latest.steps.length}</span>{/if}
    </button>
  {/if}
  {#if summary && !gone}<ChangesPanel />{/if}
  {#if !app.connected}<span class="offline">Reconnecting…</span>{/if}
  {#if summary}<ActionMenu label="More for this chat" {actions} />{/if}
</header>

{#snippet liveOutput()}
  {#each app.drafts as draft (draft.id)}
    {#if draft.kind === 'text'}
      <div class="streaming"><Markdown text={draft.text} streaming /></div>
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
    {#if !request.planId}<PermissionCard {request} />{/if}
  {/each}
{/snippet}

{#snippet planWithApproval(plan: PlanItem)}
  <ChatPlan {plan} />
  {#each app.pending.filter(request => request.planId === plan.id) as request (request.id)}
    <PermissionCard {request} />
  {/each}
{/snippet}

<div class="workspace">
<div class="conversation" class:covered={planOpen && latest} inert={planOpen && !!latest}>
<div class="scroll" bind:this={scroller} {onscroll}>
  <div class="thread" bind:this={thread}>
    {#if app.opening}
      <p class="empty"><span class="spinner"></span> Loading conversation…</p>
    {:else if app.meta && !app.items.length}
      <div class="empty">
        <Avatar kind="folder" label={folderName} size={48} />
        <h2>{folderName}</h2>
        <p>This is the very beginning of this chat. {providerName(app.provider)} will work in <code>{folderShown}</code>. What would you like to do?</p>
      </div>
    {/if}

    {#each groups as group, index (group.id)}
      {#if group.day}
        <div class="day" role="separator"><span>{group.day}</span></div>
      {/if}
      {#if group.kind === 'switch'}
        {@const item = group.items[0]}
        {#if item?.kind === 'divider'}
          <div class="switch" role="separator">
            <span>
              <ProviderMark provider={item.from} size={13} />
              {providerName(item.from)}{item.fromModel ? ` · ${modelName(item.fromModel)}` : ''}
              <span class="arrow" aria-label="to">→</span>
              <ProviderMark provider={item.to} size={13} />
              {providerName(item.to)}{item.toModel ? ` · ${modelName(item.toModel)}` : ''}
            </span>
            <small>The chat moved to {providerName(item.to)} here, and it was handed the conversation so far.</small>
          </div>
        {/if}
      {:else}
        <Message kind={group.kind} name={group.name} ts={group.ts} provider={group.provider}
          copyText={messageText(group, group.kind === 'model' && index === groups.length - 1 ? streamingText : '')}>
          {#each group.items as item (item.id)}
            {#if item.kind === 'plan'}
              {@render planWithApproval(item)}
            {:else}
              <Entry {item} />
            {/if}
          {/each}
          {#if live && group.kind === 'model' && index === groups.length - 1}
            {@render liveOutput()}
          {/if}
        </Message>
      {/if}
    {/each}

    {#if live && !lastIsModel}
      <!-- Nothing finished to take a name from yet, so this is signed with who is expected to answer. -->
      <Message kind="model" name={app.modelName} provider={app.provider} copyText={streamingText}>
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
      The folder <code>{folderShown}</code> was deleted, so this chat is with the archived ones. You can read it; to carry on,
      create the folder again (empty) or move the chat to another folder.
    </p>
    <div class="gone-actions">
      <button class="btn primary" onclick={() => void app.restoreFolder(summary.sessionId)}>Recreate folder</button>
      <button class="btn" onclick={() => (app.dialog = { kind: 'move', session: summary })}>Change folder…</button>
    </div>
  </div>
{/if}

<Composer />
</div>
{#if planOpen && latest}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <section class="plan-reader" aria-label="Latest plan" onkeydown={(event) => {
    if (event.key === 'Escape') { event.stopPropagation(); void togglePlan(false); }
  }}>
    <div class="reader-bar">
      <button class="btn ghost" bind:this={backButton} onclick={() => togglePlan(false)}>← Back to chat</button>
    </div>
    <div class="reader-body">{@render planWithApproval(latest)}</div>
  </section>
{/if}
</div>

<style>
  .workspace, .conversation, .plan-reader { display: flex; flex-direction: column; flex: 1; min-height: 0; min-width: 0; }
  .workspace { position: relative; }
  .covered { visibility: hidden; }
  .plan-reader { position: absolute; inset: 0; background: var(--bg); }
  .reader-bar { padding: 6px 14px; border-bottom: 1px solid var(--border); }
  .reader-body { display: flex; flex-direction: column; gap: 12px; overflow: auto; padding: 16px; }
  .plan-tab {
    display: inline-flex; align-items: center; flex: none; gap: 5px;
    padding: 2px 6px; border: 1px solid var(--border); border-radius: 5px;
    color: var(--text); background: transparent; font-size: 12px; font-weight: 600;
  }
  .plan-tab:hover, .plan-tab[aria-pressed="true"] { background: var(--accent-soft); }
  .plan-count { color: var(--muted); font-variant-numeric: tabular-nums; }

  h1 {
    flex: 1 1 0;
    min-width: 0;
  }

  .where {
    flex: 0 1 auto;
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

  /* Where the chat moved to the other agent: a line across, with both agents on it. */
  .switch {
    display: grid;
    justify-items: center;
    gap: 4px;
    margin: 14px 0 8px;
    position: relative;
  }

  .switch::before {
    content: '';
    position: absolute;
    top: 14px;
    left: 0;
    right: 0;
    border-top: 1px dashed var(--border-strong);
  }

  .switch > span {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 14px;
    border: 1px solid var(--border-strong);
    border-radius: 999px;
    background: var(--bg);
    font-size: 13px;
    font-weight: 700;
  }

  .switch .arrow {
    color: var(--muted);
  }

  .switch small {
    color: var(--muted);
    font-size: 12px;
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

  /* Give the title and its controls one row, and the chat metadata a second. */
  @media (max-width: 600px) {
    .pane-bar { flex-wrap: wrap; row-gap: 3px; }

    .where {
      order: 1;
      flex: 1 0 100%;
    }

    .where .archived {
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
