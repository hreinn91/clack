<script lang="ts">
  import { noteHref, notes } from '../lib/notes.svelte';
  import { app } from '../lib/state.svelte';
  import { providerName } from '../lib/format';
  import Avatar from './Avatar.svelte';
  import ProviderMark from './ProviderMark.svelte';

  let menuOpen = $state(false);
  let picker = $state<HTMLInputElement>();
  let saving = $state(false);
  /** Said in the menu when the picture could not be changed. */
  let pictureError = $state('');

  async function changePicture(action: () => Promise<void>) {
    saving = true;
    pictureError = '';
    try {
      await action();
    } catch (err) {
      pictureError = err instanceof Error ? err.message : String(err);
      // Open again, so what went wrong is seen.
      menuOpen = true;
    } finally {
      saving = false;
    }
  }

  function picked(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) void changePicture(() => app.setAvatar(file));
  }

  // Home is the conversation list: it goes back to the most recent chat.
  const home = $derived(app.sessions[0] ? `#/s/${app.sessions[0].sessionId}` : '#/new');
  const section = $derived(
    app.route.name === 'debug' ||
      app.route.name === 'data' ||
      app.route.name === 'theme' ||
      app.route.name === 'usage' ||
      app.route.name === 'tools' ||
      app.route.name === 'notes' ||
      app.route.name === 'artifacts' ||
      app.route.name === 'stats' ||
      app.route.name === 'help'
      ? app.route.name
      : 'home',
  );
</script>

<svelte:window
  onclick={() => (menuOpen = false)}
  onkeydown={(event) => {
    if (event.key === 'Escape') menuOpen = false;
  }}
/>

<nav class="rail" aria-label="Sections">
  <span class="logo" aria-hidden="true">
    <svg viewBox="0 0 64 64" width="26" height="26">
      <rect x="10" y="18" width="44" height="29" rx="6" fill="none" stroke="currentColor" stroke-width="4.5" />
      <rect x="19" y="26" width="6" height="6" rx="1.5" fill="currentColor" />
      <rect x="29" y="26" width="6" height="6" rx="1.5" fill="currentColor" />
      <rect x="39" y="26" width="6" height="6" rx="1.5" fill="currentColor" />
      <rect x="22" y="36" width="20" height="4.5" rx="2.2" fill="currentColor" />
    </svg>
  </span>

  <a class="item" class:active={section === 'home'} href={home} aria-current={section === 'home' ? 'page' : undefined}>
    <span class="tile">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
        <path d="M3 9.2 10 3l7 6.2V16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
        <path d="M8 17v-4.5h4V17" />
      </svg>
    </span>
    Home
  </a>

  <!-- Back to the note open last, as Home goes back to the latest chat. -->
  <a class="item" class:active={section === 'notes'} href={noteHref(notes.last)} aria-current={section === 'notes' ? 'page' : undefined}>
    <span class="tile">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 2.75h7.5l3 3V16a1.25 1.25 0 0 1-1.25 1.25H5A1.25 1.25 0 0 1 3.75 16V4A1.25 1.25 0 0 1 5 2.75z" />
        <path d="M7 8.5h6M7 11.5h6M7 14.5h3.5" />
      </svg>
    </span>
    Notes
  </a>

  <a class="item" class:active={section === 'artifacts'} href="#/artifacts" aria-current={section === 'artifacts' ? 'page' : undefined}>
    <span class="tile">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <rect x="2.75" y="3.25" width="14.5" height="13.5" rx="2.5" />
        <path d="M2.75 7h14.5M6.5 10.5l-1.5 1.5 1.5 1.5M10.5 10.5l1.5 1.5-1.5 1.5" />
      </svg>
    </span>
    Artifacts
  </a>

  <a class="item" class:active={section === 'usage'} href="#/usage" aria-current={section === 'usage' ? 'page' : undefined}>
    <span class="tile">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3.5 14a7 7 0 1 1 13 0" />
        <path d="M10 13l3.2-4.2" />
        <circle cx="10" cy="13.5" r="1.3" fill="currentColor" stroke="none" />
      </svg>
    </span>
    Usage
  </a>

  <a class="item" class:active={section === 'tools'} href="#/tools" aria-current={section === 'tools' ? 'page' : undefined}>
    <span class="tile">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12.6 3.4a4 4 0 0 0-4.9 5.3L3.5 12.9a1.6 1.6 0 0 0 2.3 2.3l4.2-4.2a4 4 0 0 0 5.3-4.9l-2.4 2.4-2.1-.4-.4-2.1z" />
      </svg>
    </span>
    Tools
  </a>

  <a class="item" class:active={section === 'debug'} href="#/debug/log" aria-current={section === 'debug' ? 'page' : undefined}>
    <span class="tile">
      <!-- A page of log lines, each with its time mark. -->
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="2.75" width="14" height="14.5" rx="2" />
        <path d="M6 6.75h.01M8.5 6.75h5.5M6 10h.01M8.5 10h5.5M6 13.25h.01M8.5 13.25h3.5" />
      </svg>
    </span>
    Logs
  </a>

  <a class="item" class:active={section === 'theme'} href="#/theme" aria-current={section === 'theme' ? 'page' : undefined}>
    <span class="tile">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10 2.5a7.5 7.5 0 1 0 0 15c1 0 1.6-.7 1.6-1.5 0-.9-.8-1.2-.8-2.1 0-.8.7-1.4 1.5-1.4H14a3.5 3.5 0 0 0 3.5-3.5C17.5 5.3 14.1 2.5 10 2.5z" />
        <circle cx="6.5" cy="9" r="1" fill="currentColor" stroke="none" />
        <circle cx="9" cy="6" r="1" fill="currentColor" stroke="none" />
        <circle cx="13" cy="6.5" r="1" fill="currentColor" stroke="none" />
      </svg>
    </span>
    Theme
  </a>

  <a class="item" class:active={section === 'stats'} href="#/stats" aria-current={section === 'stats' ? 'page' : undefined}>
    <span class="tile">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3.5 16.5h13" />
        <path d="M6 13.5v-4M10 13.5v-8M14 13.5v-5.5" />
      </svg>
    </span>
    Stats
  </a>

  <a class="item" class:active={section === 'data'} href="#/data" aria-current={section === 'data' ? 'page' : undefined}>
    <span class="tile">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
        <ellipse cx="10" cy="5" rx="6.5" ry="2.5" />
        <path d="M3.5 5v10c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5V5M3.5 10c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5" />
      </svg>
    </span>
    Data
  </a>

  <a class="item" class:active={section === 'help'} href="#/help" aria-current={section === 'help' ? 'page' : undefined}>
    <span class="tile">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="10" cy="10" r="7.5" />
        <path d="M7.7 7.6a2.4 2.4 0 0 1 4.6.9c0 1.6-2.3 2-2.3 3.5" />
        <circle cx="10" cy="14.6" r=".9" fill="currentColor" stroke="none" />
      </svg>
    </span>
    Help
  </a>

  <span class="spacer"></span>

  <a class="add" href="#/new" aria-label="New chat" title="New chat">
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
      <path d="M10 4v12M4 10h12" />
    </svg>
  </a>

  <div class="me">
    <button
      aria-label={`${app.userName}: account menu`}
      aria-haspopup="menu"
      aria-expanded={menuOpen}
      onclick={(event) => {
        event.stopPropagation();
        menuOpen = !menuOpen;
      }}
    >
      <Avatar kind="person" label={app.userName} />
      <span class="presence" class:off={!app.connected}></span>
    </button>
    {#if menuOpen}
      <div class="menu" role="menu">
        <div class="who">
          <Avatar kind="person" label={app.userName} />
          <div>
            <strong>{app.userName}</strong>
            <span class="status"><span class="dot" class:off={!app.connected}></span>{app.connected ? 'Connected' : 'Reconnecting…'}</span>
          </div>
        </div>
        {#if app.providers.length}
          <ul class="agents" aria-label="Agents">
            {#each app.providers as p (p.provider)}
              <li class={p.provider}>
                <ProviderMark provider={p.provider} size={13} />
                <span>{providerName(p.provider)}</span>
                <em>{p.available ? (p.plan ? p.plan.charAt(0).toUpperCase() + p.plan.slice(1) : 'Signed in') : 'Not available'}</em>
              </li>
            {/each}
          </ul>
        {/if}
        <button role="menuitem" disabled={saving} onclick={() => picker?.click()}>
          {saving ? 'Saving picture…' : app.avatar !== undefined ? 'Change picture…' : 'Upload a picture…'}
        </button>
        {#if app.avatar !== undefined}
          <button role="menuitem" disabled={saving} onclick={() => void changePicture(() => app.clearAvatar())}>Remove picture</button>
        {/if}
        {#if pictureError}<p class="error" role="alert">{pictureError}</p>{/if}
        <hr />
        <button role="menuitem" onclick={() => app.logout()}>Sign out of clack</button>
      </div>
    {/if}
    <!-- Outside the menu, which closes as soon as the file dialog opens. -->
    <input bind:this={picker} type="file" accept="image/*" hidden onchange={picked} />
  </div>
</nav>

<style>
  .rail {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    min-height: 0;
    padding: 6px 0 calc(14px + env(safe-area-inset-bottom));
    color: var(--chrome-text);
  }

  .logo {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    margin-bottom: 4px;
    border-radius: 8px;
    background: var(--chrome-strong);
    color: var(--chrome);
  }

  .item {
    display: grid;
    justify-items: center;
    gap: 3px;
    color: var(--chrome-text);
    font-size: 11px;
    font-weight: 700;
    text-decoration: none;
  }

  .tile {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border-radius: 8px;
    transition: transform 0.1s;
  }

  .item:hover .tile {
    background: var(--chrome-hover);
    transform: scale(1.06);
  }

  .item.active .tile {
    background: var(--chrome-tile);
    color: var(--chrome-strong);
  }

  .spacer {
    flex: 1;
  }

  .add {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--chrome-tile);
    color: var(--chrome-strong);
  }

  .add:hover {
    background: rgb(255 255 255 / 36%);
  }

  .me {
    position: relative;
    height: 36px;
  }

  .me > button {
    position: relative;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: none;
  }

  .presence {
    position: absolute;
    right: -4px;
    bottom: -3px;
    width: 13px;
    height: 13px;
    border: 3px solid var(--chrome-deep);
    border-radius: 50%;
    background: var(--presence);
  }

  .presence.off {
    background: var(--chrome-deep);
    box-shadow: inset 0 0 0 1.5px var(--chrome-text);
  }

  .menu {
    position: absolute;
    left: 44px;
    bottom: 0;
    z-index: 40;
    width: 260px;
    padding: 12px 0 8px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow);
  }

  .who {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 4px 16px 12px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 8px;
  }

  .who strong {
    display: block;
    font-weight: 900;
  }

  .status {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--muted);
    font-size: 13px;
  }

  .dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--presence);
  }

  .dot.off {
    background: none;
    box-shadow: inset 0 0 0 1.5px var(--muted);
  }

  .menu > button {
    display: block;
    width: 100%;
    padding: 5px 16px;
    border: 0;
    background: none;
    text-align: left;
  }

  .menu > button:hover:not(:disabled) {
    background: var(--accent);
    color: var(--accent-ink);
  }

  .menu > button:disabled {
    color: var(--muted);
  }

  .agents {
    display: grid;
    gap: 4px;
    margin: 0 0 8px;
    padding: 0 16px 8px;
    border-bottom: 1px solid var(--border);
    list-style: none;
    font-size: 13px;
  }

  .agents li {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--provider-claude);
  }

  .agents li.codex {
    color: var(--provider-codex);
  }

  .agents span {
    color: var(--text);
    font-weight: 600;
  }

  .agents em {
    margin-left: auto;
    color: var(--muted);
    font-style: normal;
  }

  .menu hr {
    margin: 8px 0;
    border: 0;
    border-top: 1px solid var(--border);
  }

  .menu .error {
    margin: 4px 16px;
    color: var(--danger);
    font-size: 13px;
  }
</style>
