<script lang="ts">
  import LogView from './LogView.svelte';

  let { onmenu }: { onmenu: () => void } = $props();
</script>

<header class="pane-bar">
  <button class="icon-btn menu" aria-label="Open menu" onclick={onmenu}>
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
      <path d="M3 5.5h14M3 10h14M3 14.5h14" />
    </svg>
  </button>
  <h1>Logs</h1>
  <!-- One view today; more debug views get a tab here. -->
  <nav aria-label="Debug views">
    <a href="#/debug/log" aria-current="page">Log</a>
  </nav>
</header>

<LogView />

<style>
  nav a {
    padding: 5px 12px;
    border-radius: 999px;
    color: var(--muted);
    font-size: 13.5px;
    text-decoration: none;
  }

  nav a[aria-current='page'] {
    background: var(--accent-soft);
    color: var(--text);
  }
</style>
