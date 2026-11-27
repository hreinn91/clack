<script lang="ts">
  import type { Provider } from '../../../shared/protocol';
  import { providerMaker, providerName } from '../lib/format';
  import { app } from '../lib/state.svelte';
  import CodeText from './CodeText.svelte';
  import ProviderMark from './ProviderMark.svelte';

  let { onmenu }: { onmenu: () => void } = $props();

  // How to get going: whether each agent is signed in on the server, how to
  // sign in where it is not, the keyboard shortcuts, and a few things that are
  // easy to miss.

  const mac = /Mac|iPhone|iPad/.test(navigator.platform);
  const mod = mac ? '⌘' : 'Ctrl';
  const shift = mac ? '⇧' : 'Shift';

  let checking = $state(false);
  /** The command just copied, said on its button for a moment. */
  let copied = $state('');

  $effect(() => {
    void app.loadModels();
  });

  async function checkAgain() {
    checking = true;
    try {
      await app.loadModels(true);
    } finally {
      checking = false;
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      copied = text;
      setTimeout(() => {
        if (copied === text) copied = '';
      }, 1500);
    } catch {
      // No clipboard here (an insecure address, say): the command can still be selected by hand.
    }
  }

  const status = (provider: Provider) => app.providers.find((p) => p.provider === provider);
  const titled = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

  const SHORTCUTS: { keys: string[]; what: string }[] = [
    { keys: [mod, 'K'], what: 'Quick switcher: jump to a chat, start a chat in a folder, or open a page' },
    { keys: [mod, shift, 'D'], what: 'Show or hide the sidebar' },
    { keys: ['Enter'], what: 'Send the message (on a phone, Enter adds a line and the button sends)' },
    { keys: [shift, 'Enter'], what: 'New line in the message' },
    { keys: ['↑', '↓'], what: 'In an empty message box: step through what you sent earlier in the chat' },
    { keys: [mod, 'E'], what: 'In a note: switch between writing and the preview' },
    { keys: [mod, 'S'], what: 'In a note: save now (notes also save themselves as you type)' },
    { keys: [mod, 'B'], what: `In a note: make the selection bold (${mod} I makes it italic)` },
    { keys: ['Esc'], what: 'Close a menu, card or dialog; in the search field, clear it' },
    { keys: ['↑', '↓', 'Enter'], what: 'Move through and pick in menus, the folder finder and the quick switcher' },
    { keys: ['←', '→'], what: 'With the sidebar edge focused: make the sidebar narrower or wider (Enter hides it)' },
  ];
</script>

{#snippet command(text: string)}
  <span class="command">
    <code>{text}</code>
    <button class="copy" onclick={() => copy(text)} aria-label={`Copy ${text}`}>{copied === text ? 'Copied' : 'Copy'}</button>
  </span>
{/snippet}

{#snippet keys(list: string[])}
  <span class="keys">{#each list as key, i (i)}<kbd>{key}</kbd>{/each}</span>
{/snippet}

<header class="pane-bar">
  <button class="icon-btn menu" aria-label="Open menu" onclick={onmenu}>
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
      <path d="M3 5.5h14M3 10h14M3 14.5h14" />
    </svg>
  </button>
  <h1>Help</h1>
</header>

<div class="scroll">
  <div class="page">
    <section>
      <h2>Agents on this server</h2>
      <p class="hint">
        clack runs each chat on Claude Code or Codex, on the computer the server runs on. Either one is enough; with both,
        the model menu in a chat offers both, and a chat can move from one to the other.
      </p>
      <div class="agents">
        {#each ['claude', 'codex'] as Provider[] as provider (provider)}
          {@const s = status(provider)}
          <div class="agent" class:off={s && !s.available}>
            <span class="tile {provider}"><ProviderMark {provider} size={16} /></span>
            <div>
              <strong>{providerName(provider)} <span class="maker">· {providerMaker(provider)}</span></strong>
              <span class="state">
                {#if !app.providers.length}
                  Checking…
                {:else if !s}
                  Turned off on this server (<code>CLACK_CODEX=off</code>)
                {:else if s.available}
                  <span class="dot good"></span> Signed in{s.plan ? ` · ${titled(s.plan)}` : ''}
                {:else}
                  <span class="dot bad"></span> <span><CodeText text={s.reason ?? 'Not available'} /></span>
                {/if}
              </span>
            </div>
          </div>
        {/each}
      </div>
      <p class="row">
        <button class="btn" disabled={checking} onclick={checkAgain}>
          {#if checking}<span class="spinner"></span>{/if}
          Check again
        </button>
        <span class="hint">After signing in on the server, check again: there is no need to restart clack.</span>
      </p>
    </section>

    <section>
      <h2><span class="tile small claude"><ProviderMark provider="claude" size={13} /></span> Signing in to Claude</h2>
      <p>Claude needs a Claude subscription (Pro or Max), or an Anthropic API key. On the server computer, run:</p>
      {@render command('claude auth login')}
      <p>It opens a page to sign in to your Claude account. On a server without a browser, it prints a link to open elsewhere and a code to paste back.</p>
      <p>
        <strong>In Docker:</strong>
      </p>
      {@render command('docker compose exec clack claude auth login')}
      <p>
        Or, without touching the server: run <code>claude setup-token</code> on any computer and put the token it prints in
        <code>.env</code> as <code>CLAUDE_CODE_OAUTH_TOKEN</code>, then start clack again. An API key goes in
        <code>.env</code> as <code>ANTHROPIC_API_KEY</code>; usage is then billed per token instead of from a plan.
      </p>
    </section>

    <section>
      <h2><span class="tile small codex"><ProviderMark provider="codex" size={13} /></span> Signing in to Codex</h2>
      <p>
        Codex needs the <code>codex</code> command on the server and a ChatGPT plan (Plus or higher) or an OpenAI API key.
        clack starts Codex itself when it is needed; there is nothing else to run. To install it:
      </p>
      {@render command(mac ? 'brew install codex' : 'npm install -g @openai/codex')}
      <p>Then sign in, once:</p>
      {@render command('codex login')}
      <p>On a server without a browser, sign in with a code instead (allow device code sign-in in your ChatGPT account's security settings first):</p>
      {@render command('codex login --device-auth')}
      <p><strong>In Docker</strong> (the image comes with Codex):</p>
      {@render command('docker compose exec clack codex login --device-auth')}
      <p>
        Or put an OpenAI API key in <code>.env</code> as <code>CODEX_API_KEY</code>. With <code>CLACK_CODEX=off</code> in
        <code>.env</code>, clack leaves Codex out altogether.
      </p>
    </section>

    <section>
      <h2>Keyboard shortcuts</h2>
      <table>
        <tbody>
          {#each SHORTCUTS as shortcut (shortcut.what)}
            <tr>
              <td>{@render keys(shortcut.keys)}</td>
              <td>{shortcut.what}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </section>

    <section>
      <h2>Good to know</h2>
      <ul class="tips">
        <li>
          <strong>Picking the agent.</strong> The model menu in the message box lists both agents' models. Before the first
          message any of them can be picked; later, picking the other agent's model moves the chat over, and the new agent is
          handed the conversation so far.
        </li>
        <li>
          <strong>Which agent is which.</strong> Claude's spark and Codex's <code>&gt;_</code> show on replies, beside each
          chat in the sidebar, and on the chip under a chat's title, which also shows that agent's plan limits.
        </li>
        <li>
          <strong>Folders.</strong> Every chat works in a folder of its own, under <code>data/sessions</code> or one you added
          from the computer, and the agent can only change files inside it.
        </li>
        <li>
          <strong>Permission modes.</strong> Auto, Ask before changes, Accept file edits and Plan only, beside the model menu.
          Questions the agent has show up as cards in the chat.
        </li>
        <li>
          <strong>Steps or Raw.</strong> The menu after the effort menu shows replies as a checklist of steps, with each step's
          tool calls folded under it and the answer in full, or raw, everything as it happened.
        </li>
        <li>
          <strong>Artifacts.</strong> Ask for a page, a small app, a document or a diagram to keep, and the agent makes it as
          an artifact: it opens on the left in the sidebar's place (the button beside the sidebar button, or
          <strong>Artifacts</strong> in the chat's header), with every version kept. <a href="#/artifacts">Artifacts</a> in the
          rail lists them all.
        </li>
        <li>
          <strong>Stats.</strong> <a href="#/stats">Stats</a> shows how you have used Claude and Codex over time: tokens, cost at
          API prices, models, projects, tools and when you work. It reads the agents' own records on the server, numbers only,
          and uses no tokens.
        </li>
        <li>
          <strong>Diagrams.</strong> Ask for a diagram or a chart and it is drawn in the reply (from a
          <code>mermaid</code> code block). Click it to zoom; point at it to see its code or download it as PNG or SVG.
          On a phone, press and hold the zoomed diagram to copy or save it.
        </li>
        <li>
          <strong>Attaching files.</strong> Use the <strong>+</strong> button, drop files on the message box, or paste a picture
          into it. They are saved in the chat's folder.
        </li>
        <li>
          <strong>Notes.</strong> <a href="#/notes">Notes</a> in the rail holds markdown notes, kept as <code>.md</code> files in
          <code>data/notes</code>. Put a note inside another with <strong>+</strong> on its row or by dragging it there;
          copy one with the copy button, and export a note as <code>.md</code> or a whole branch (or everything) as
          <code>.zip</code> from the <strong>⋯</strong> menu.
        </li>
        <li>
          <strong>Renaming.</strong> Click a chat's title. Archive, move and delete are in the <strong>⋯</strong> menu.
        </li>
        <li>
          <strong>Usage and tools.</strong> <a href="#/usage">Usage</a> shows each agent's plan limits;
          <a href="#/tools">Tools</a> lists each agent's MCP servers, skills and built-in tools.
          <a href="#/debug">Logs</a> records everything that happens.
        </li>
        {#if app.dataDir}
          <li><strong>Where things are.</strong> The data directory on the server is <code>{app.dataDir}</code>.</li>
        {/if}
      </ul>
    </section>
  </div>
</div>

<style>
  .scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 24px 20px calc(32px + env(safe-area-inset-bottom));
  }

  .page {
    display: grid;
    gap: 32px;
    max-width: 720px;
  }

  section {
    display: grid;
    gap: 10px;
  }

  h2 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    font-size: 18px;
    font-weight: 900;
  }

  p {
    margin: 0;
  }

  .hint {
    color: var(--muted);
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  }

  .row .btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .agents {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 10px;
  }

  .agent {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
  }

  .agent > div {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  .maker {
    color: var(--muted);
    font-weight: 500;
  }

  .state {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--muted);
    font-size: 13px;
  }

  .dot {
    flex: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .dot.good {
    background: var(--presence);
  }

  .dot.bad {
    background: var(--danger);
  }

  .tile {
    display: grid;
    place-items: center;
    flex: none;
    width: 30px;
    height: 30px;
    border-radius: 7px;
    background: var(--provider-claude);
    color: #fff;
  }

  .tile.codex {
    background: var(--provider-codex);
  }

  .tile.small {
    width: 24px;
    height: 24px;
    border-radius: 6px;
  }

  code {
    padding: 0.1em 0.35em;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--sunken);
    font: 0.9em var(--mono);
    overflow-wrap: anywhere;
  }

  .command {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 8px 8px 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--sunken);
  }

  .command code {
    flex: 1;
    min-width: 0;
    padding: 0;
    border: 0;
    background: none;
    font-size: 14px;
  }

  .copy {
    flex: none;
    padding: 3px 10px;
    border: 1px solid var(--border-strong);
    border-radius: 6px;
    background: var(--surface);
    color: var(--text);
    font-size: 12.5px;
  }

  .copy:hover {
    border-color: var(--accent);
  }

  table {
    border-collapse: collapse;
    width: 100%;
  }

  td {
    padding: 7px 10px 7px 0;
    border-bottom: 1px solid var(--border);
    vertical-align: top;
  }

  td:first-child {
    width: 1%;
    white-space: nowrap;
  }

  .keys {
    display: inline-flex;
    gap: 3px;
  }

  kbd {
    display: inline-grid;
    place-items: center;
    min-width: 24px;
    padding: 1px 6px;
    border: 1px solid var(--border-strong);
    border-bottom-width: 2px;
    border-radius: 5px;
    background: var(--surface);
    font: 600 12.5px var(--font);
  }

  .tips {
    display: grid;
    gap: 8px;
    margin: 0;
    padding-left: 18px;
  }

  a {
    color: var(--link);
  }

  @media (max-width: 520px) {
    td:first-child {
      white-space: normal;
    }
  }
</style>
