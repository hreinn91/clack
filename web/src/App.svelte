<script lang="ts">
  import { onMount } from 'svelte';
  import Chat from './components/Chat.svelte';
  import Debug from './components/Debug.svelte';
  import Login from './components/Login.svelte';
  import NewChat from './components/NewChat.svelte';
  import Sidebar from './components/Sidebar.svelte';
  import { app } from './lib/state.svelte';

  let drawerOpen = $state(false);

  onMount(() => void app.init());

  // Picking a chat on a phone should reveal it, not leave the drawer covering it.
  $effect(() => {
    app.route;
    drawerOpen = false;
  });
</script>

{#if app.authed === null}
  <div class="boot"><span class="spinner"></span> Connecting…</div>
{:else if !app.authed}
  <Login />
{:else}
  <div class="shell">
    <div class="drawer" class:open={drawerOpen}>
      <Sidebar />
    </div>
    {#if drawerOpen}
      <button class="backdrop" aria-label="Close menu" onclick={() => (drawerOpen = false)}></button>
    {/if}
    <main>
      {#if app.route.name === 'session'}
        <Chat onmenu={() => (drawerOpen = true)} />
      {:else if app.route.name === 'debug'}
        <Debug onmenu={() => (drawerOpen = true)} />
      {:else}
        <NewChat onmenu={() => (drawerOpen = true)} />
      {/if}
    </main>
  </div>
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
    grid-template-columns: 290px minmax(0, 1fr);
    height: 100dvh;
  }

  .drawer {
    min-height: 0;
    border-right: 1px solid var(--border);
    background: var(--surface);
  }

  main {
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .backdrop {
    display: none;
  }

  @media (max-width: 820px) {
    .shell {
      grid-template-columns: minmax(0, 1fr);
    }

    .drawer {
      position: fixed;
      inset: 0 auto 0 0;
      z-index: 20;
      width: min(86vw, 330px);
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
