<script lang="ts">
  import { ago } from '../lib/format';
  import { app } from '../lib/state.svelte';
</script>

<nav>
  <header>
    <span class="brand">clack</span>
    <a class="btn" href="#/new">New chat</a>
  </header>

  <ul>
    {#each app.sessions as session (session.sessionId)}
      <li>
        <a href={`#/s/${session.sessionId}`} class:active={session.sessionId === app.sessionId}>
          <span class="title">{session.title}</span>
          <span class="sub">
            {#if session.running}<span class="spinner" aria-label="Working"></span>{/if}
            <span class="project">{session.folder}</span>
            <span class="when">{ago(session.lastModified)}</span>
          </span>
        </a>
      </li>
    {:else}
      <li class="empty">No chats yet.</li>
    {/each}
  </ul>

  <footer>
    <span class="status" class:off={!app.connected}>
      <span class="dot"></span>
      {app.connected ? 'Connected' : 'Reconnecting…'}
    </span>
    <span class="links">
      <a class="btn ghost" href="#/debug/log" class:current={app.route.name === 'debug'}>Debug</a>
      <button class="btn ghost" onclick={() => app.logout()}>Sign out</button>
    </span>
  </footer>
</nav>

<style>
  nav {
    height: 100%;
    display: flex;
    flex-direction: column;
    padding-top: env(safe-area-inset-top);
  }

  header,
  footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 12px 14px;
  }

  footer {
    border-top: 1px solid var(--border);
    padding-bottom: calc(12px + env(safe-area-inset-bottom));
    font-size: 13px;
  }

  .links {
    display: inline-flex;
  }

  .links .btn {
    padding: 6px 10px;
  }

  .links .current {
    background: var(--accent-soft);
  }

  .brand {
    font: 600 18px var(--mono);
    letter-spacing: -0.02em;
  }

  a.btn {
    text-decoration: none;
    color: inherit;
  }

  ul {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    margin: 0;
    padding: 0 8px 8px;
    list-style: none;
  }

  li a {
    display: block;
    padding: 9px 10px;
    border-radius: 8px;
    color: inherit;
    text-decoration: none;
  }

  li a:hover {
    background: var(--sunken);
  }

  li a.active {
    background: var(--accent-soft);
  }

  .title {
    display: block;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-weight: 500;
  }

  .sub {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--muted);
    font-size: 12.5px;
  }

  .project {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-family: var(--mono);
  }

  .empty {
    padding: 12px 10px;
    color: var(--muted);
  }

  .status {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    color: var(--muted);
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent);
  }

  .status.off .dot {
    background: var(--danger);
  }
</style>
