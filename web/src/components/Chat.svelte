<script lang="ts">
  import { app } from '../lib/state.svelte';
  import Composer from './Composer.svelte';
  import Entry from './Entry.svelte';
  import Markdown from './Markdown.svelte';
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

<header class="bar">
  <button class="icon-btn menu" aria-label="Open menu" onclick={onmenu}>
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
      <path d="M3 5.5h14M3 10h14M3 14.5h14" />
    </svg>
  </button>
  <div class="heading">
    <h1>{title}</h1>
    <p>
      <span class="folder">{folder}</span>
      {#if app.meta?.activeModel}<span>· {app.meta.activeModel}</span>{/if}
    </p>
  </div>
  {#if !app.connected}<span class="offline">Reconnecting…</span>{/if}
</header>

<div class="scroll" bind:this={scroller} {onscroll}>
  <div class="thread" bind:this={thread}>
    {#if app.opening}
      <p class="empty"><span class="spinner"></span> Loading conversation…</p>
    {:else if app.meta && !app.items.length}
      <p class="empty">Claude will work in <code>{folder}</code>. What would you like to do?</p>
    {/if}

    {#each app.items as item (item.id)}
      <Entry {item} />
    {/each}

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

    {#if app.error}
      <p class="error" role="alert">
        {app.error}
        <button class="btn ghost" onclick={() => (app.error = null)}>Dismiss</button>
      </p>
    {/if}
  </div>
</div>

<Composer />

<style>
  .bar {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 54px;
    padding: 8px 14px;
    padding-top: calc(8px + env(safe-area-inset-top));
    border-bottom: 1px solid var(--border);
  }

  .menu {
    display: none;
    flex: none;
  }

  .heading {
    flex: 1;
    min-width: 0;
  }

  h1,
  .heading p {
    margin: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  h1 {
    font-size: 15px;
    font-weight: 600;
    line-height: 1.3;
  }

  .heading p {
    color: var(--muted);
    font-size: 12.5px;
  }

  .folder {
    font-family: var(--mono);
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
    padding: 20px 16px 12px;
  }

  .thread {
    max-width: 780px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .empty,
  .working {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    color: var(--muted);
  }

  .empty {
    display: block;
    padding: 12vh 0;
    text-align: center;
  }

  .empty code {
    font-family: var(--mono);
    color: var(--text);
  }

  .working {
    font-size: 13.5px;
  }

  .error {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin: 0;
    padding: 6px 6px 6px 12px;
    border-radius: 8px;
    background: var(--danger-soft);
    color: var(--danger);
  }

  @media (max-width: 820px) {
    .menu {
      display: inline-grid;
    }
  }
</style>
