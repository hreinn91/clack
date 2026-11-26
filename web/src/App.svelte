<script lang="ts">
  import { onMount } from 'svelte';
  import Chat from './components/Chat.svelte';
  import ChangesPane from './components/ChangesPane.svelte';
  import ChatDialogs from './components/ChatDialogs.svelte';
  import Data from './components/Data.svelte';
  import Debug from './components/Debug.svelte';
  import Login from './components/Login.svelte';
  import NewChat from './components/NewChat.svelte';
  import NoteDialogs from './components/NoteDialogs.svelte';
  import Notes from './components/Notes.svelte';
  import Palette from './components/Palette.svelte';
  import Rail from './components/Rail.svelte';
  import Sidebar from './components/Sidebar.svelte';
  import Theme from './components/Theme.svelte';
  import Stats from './components/Stats.svelte';
  import Artifacts from './components/Artifacts.svelte';
  import Help from './components/Help.svelte';
  import TopBar from './components/TopBar.svelte';
  import Tools from './components/Tools.svelte';
  import Usage from './components/Usage.svelte';
  import { app, SIDEBAR } from './lib/state.svelte';
  import { artifacts, PANEL } from './lib/artifacts.svelte';
  import ArtifactPanel from './components/ArtifactPanel.svelte';
  import { untrack } from 'svelte';

  /** Width of the rail, which is where the sidebar's left edge sits. */
  const RAIL = 70;
  const STEP = 16;

  let drawerOpen = $state(false);
  let dragging = $state(false);
  let windowWidth = $state(window.innerWidth);
  const phoneQuery = matchMedia('(max-width: 820px)');
  let phone = $state(phoneQuery.matches);
  phoneQuery.addEventListener('change', (event) => (phone = event.matches));

  /**
   * In a chat, the left column holds the chats or the chat's artifacts, never
   * both: opening the artifacts puts the chats away, and showing the chats
   * closes the artifacts.
   */
  const panelShown = $derived(artifacts.panelOpen && app.route.name === 'session');

  const watchingChanges = $derived(app.changesView !== 'closed');
  const gitCheckedAt = $derived(app.meta?.gitChanges?.checkedAt);
  $effect(() => {
    if (!watchingChanges) return;
    gitCheckedAt;
    void app.refreshChanges();
  });

  function showChats() {
    artifacts.closePanel();
    app.toggleSidebar(false);
  }

  // Another chat has artifacts of its own: the panel closes unless they are this chat's.
  $effect(() => {
    const id = app.sessionId;
    untrack(() => {
      if (artifacts.panelOpen && artifacts.current?.chatId !== id?.toLowerCase()) artifacts.closePanel();
    });
  });
  let widthBeforeDrag = SIDEBAR.initial;

  function startDrag(event: PointerEvent) {
    if (event.button !== 0) return;
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    widthBeforeDrag = app.sidebarWidth;
    dragging = true;
  }

  function drag(event: PointerEvent) {
    if (!dragging) return;
    const width = event.clientX - RAIL;
    if (panelShown) {
      artifacts.resize(Math.max(PANEL.min, Math.min(width, windowWidth - RAIL - PANEL.chatRoom)));
      return;
    }
    if (width < SIDEBAR.min / 2) {
      // Pulled well past its narrowest, the sidebar gets out of the way altogether,
      // and comes back later at the width it had before this drag.
      app.resizeSidebar(widthBeforeDrag);
      app.toggleSidebar(true);
    } else {
      app.resizeSidebar(width);
    }
  }

  function gripKey(event: KeyboardEvent) {
    if (panelShown) {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        artifacts.resize(artifacts.panelWidth(windowWidth) + (event.key === 'ArrowLeft' ? -STEP : STEP));
      } else if (event.key === 'Enter') {
        event.preventDefault();
        showChats();
      }
      return;
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const next = app.sidebarWidth + (event.key === 'ArrowLeft' ? -STEP : STEP);
      if (event.key === 'ArrowLeft' && (app.sidebarHidden || next < SIDEBAR.min)) app.toggleSidebar(true);
      else app.resizeSidebar(app.sidebarHidden ? app.sidebarWidth : next);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      app.toggleSidebar();
    }
  }

  const mac = /Mac|iPhone|iPad/.test(navigator.platform);

  function shortcut(event: KeyboardEvent) {
    if (!app.authed) return;
    const key = event.key.toLowerCase();
    // The same keys a chat app uses for these.
    if ((event.metaKey || event.ctrlKey) && event.shiftKey && !event.altKey && key === 'd') {
      event.preventDefault();
      if (app.changesOpen) app.changesListHidden = !app.changesListHidden;
      else if (panelShown) showChats();
      else app.toggleSidebar();
    } else if (key === 'k' && !event.shiftKey && !event.altKey && (mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey)) {
      // Away from a Mac this is Ctrl+K, which a shell uses to delete to the end of the line: a terminal keeps it.
      if (!mac && (event.target as HTMLElement | null)?.closest?.('.xterm')) return;
      event.preventDefault();
      app.paletteOpen = !app.paletteOpen;
    }
  }

  onMount(() => void app.init());

  // Picking a chat or a file on a phone should reveal it, not leave the drawer covering it.
  $effect(() => {
    app.route;
    app.fileLoading;
    app.terminalId;
    drawerOpen = false;
  });
</script>

<svelte:window onkeydown={shortcut} bind:innerWidth={windowWidth} />

{#if app.authed === null}
  <div class="boot"><span class="spinner"></span> Connecting…</div>
{:else if !app.authed}
  <Login />
{:else}
  <div
    class="shell"
    class:dragging
    class:narrow={app.sidebarHidden && !(panelShown && !phone)}
    style:--side-width={`${panelShown && !phone ? artifacts.panelWidth(windowWidth) : app.sidebarHidden ? 0 : app.sidebarWidth}px`}
  >
    <TopBar />
    <!-- On a wide screen the rail and sidebar are columns of the shell; on a phone they slide in together. -->
    <div class="drawer" class:open={drawerOpen}>
      <Rail />
      <div class="panel" class:away={app.changesOpen} inert={app.changesOpen}>
        {#if panelShown && !phone}<ArtifactPanel />{:else}<Sidebar />{/if}
      </div>
    </div>
    <!-- The sidebar's right edge: drag it to resize, double-click to go back to the usual width. -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
    <div
      class="grip"
      class:away={app.changesOpen}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      aria-valuemin={0}
      aria-valuemax={SIDEBAR.max}
      aria-valuenow={app.sidebarHidden ? 0 : app.sidebarWidth}
      title="Drag to resize. Double-click to reset."
      tabindex="0"
      onpointerdown={startDrag}
      onpointermove={drag}
      onpointerup={() => (dragging = false)}
      onpointercancel={() => (dragging = false)}
      ondblclick={() => (panelShown ? artifacts.resize(Math.round(windowWidth * 0.45)) : app.resizeSidebar(SIDEBAR.initial))}
      onkeydown={gripKey}
    ></div>
    {#if drawerOpen}
      <button class="backdrop" aria-label="Close menu" onclick={() => (drawerOpen = false)}></button>
    {/if}
    <main class:away={app.changesOpen} inert={app.changesOpen}>
      {#if app.route.name === 'session'}
        <Chat onmenu={() => (drawerOpen = true)} />
      {:else if app.route.name === 'debug'}
        <Debug onmenu={() => (drawerOpen = true)} />
      {:else if app.route.name === 'data'}
        <Data onmenu={() => (drawerOpen = true)} />
      {:else if app.route.name === 'theme'}
        <Theme onmenu={() => (drawerOpen = true)} />
      {:else if app.route.name === 'artifacts'}
        <Artifacts onmenu={() => (drawerOpen = true)} />
      {:else if app.route.name === 'stats'}
        <Stats onmenu={() => (drawerOpen = true)} />
      {:else if app.route.name === 'help'}
        <Help onmenu={() => (drawerOpen = true)} />
      {:else if app.route.name === 'notes'}
        <Notes onmenu={() => (drawerOpen = true)} />
      {:else if app.route.name === 'usage'}
        <Usage onmenu={() => (drawerOpen = true)} />
      {:else if app.route.name === 'tools'}
        <Tools onmenu={() => (drawerOpen = true)} />
      {:else}
        <NewChat onmenu={() => (drawerOpen = true)} />
      {/if}
    </main>
    {#if app.changesOpen}<ChangesPane />{/if}
    <!-- On a phone the artifacts cover the screen; the menu button and the panel's × bring the chat back. -->
    {#if panelShown && phone}<div class="sheet"><ArtifactPanel /></div>{/if}
  </div>
  <ChatDialogs />
  <NoteDialogs />
  {#if app.paletteOpen}<Palette />{/if}
{/if}

<style>
  .boot {
    height: 100%;
    display: grid;
    grid-auto-flow: column;
    place-content: center;
    align-items: center;
    gap: 10px;
    color: var(--muted);
  }

  .shell {
    display: grid;
    grid-template-columns: 70px var(--side-width) minmax(0, 1fr);
    grid-template-rows: 40px minmax(0, 1fr);
    height: 100dvh;
    background: linear-gradient(160deg, var(--chrome), var(--chrome-deep) 70%);
    transition: grid-template-columns 0.16s ease;
  }

  /* While dragging, the edge has to keep up with the pointer and nothing should get selected. */
  .shell.dragging {
    transition: none;
    cursor: col-resize;
    user-select: none;
  }

  .drawer {
    display: contents;
  }

  .panel {
    grid-column: 2;
    grid-row: 2;
    display: grid;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    border-top-left-radius: 8px;
    background: linear-gradient(180deg, var(--side), var(--side-deep));
  }

  /* Sliding shut clips the sidebar rather than squeezing its text. */
  .panel > :global(.side) {
    min-width: 180px;
  }

  main {
    grid-column: 3;
    grid-row: 2;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: var(--bg);
  }

  .grip {
    grid-column: 3;
    grid-row: 2;
    justify-self: start;
    position: relative;
    z-index: 5;
    width: 9px;
    margin-left: -4px;
    cursor: col-resize;
    touch-action: none;
  }

  .away {
    visibility: hidden;
    pointer-events: none;
  }

  .grip::after {
    content: '';
    position: absolute;
    inset: 0 3px;
    transition: background 0.1s;
  }

  .grip:hover::after,
  .grip:focus-visible::after,
  .dragging .grip::after {
    background: var(--link);
  }

  .grip:focus-visible {
    outline: none;
  }

  @media (min-width: 821px) {
    /* Hidden only once it has slid shut, so it leaves the tab order without vanishing mid-slide. */
    .narrow .panel {
      visibility: hidden;
      transition: visibility 0s 0.16s;
    }

    /* With the sidebar away, the page takes over its rounded corner. */
    .narrow main {
      border-top-left-radius: 8px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .shell {
      transition: none;
    }
  }

  .backdrop {
    display: none;
  }

  .sheet {
    position: fixed;
    inset: 0;
    z-index: 25;
    display: grid;
    background: var(--bg);
  }

  @media (max-width: 820px) {
    .shell {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: minmax(0, 1fr);
    }

    .shell > :global(.top),
    .grip {
      display: none;
    }

    main {
      grid-column: 1;
      grid-row: 1;
    }

    .panel {
      grid-row: auto;
    }

    .drawer {
      display: grid;
      grid-template-columns: 64px minmax(0, 1fr);
      position: fixed;
      inset: 0 auto 0 0;
      z-index: 20;
      width: min(88vw, 340px);
      padding-top: env(safe-area-inset-top);
      background: linear-gradient(160deg, var(--chrome), var(--chrome-deep) 70%);
      transform: translateX(-100%);
      transition: transform 0.2s ease;
      box-shadow: var(--shadow);
    }

    .drawer.open {
      transform: none;
    }

    .backdrop {
      display: block;
      position: fixed;
      inset: 0;
      z-index: 10;
      border: 0;
      background: rgb(0 0 0 / 40%);
    }
  }
</style>
