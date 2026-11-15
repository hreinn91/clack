<script lang="ts" module>
  import '@fontsource/jetbrains-mono/400.css';
  import '@fontsource/jetbrains-mono/700.css';

  const FONT = '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace';

  type Parts = {
    Terminal: typeof import('@xterm/xterm').Terminal;
    FitAddon: typeof import('@xterm/addon-fit').FitAddon;
    gpu: typeof import('@xterm/addon-webgl') | null;
  };

  let parts: Promise<Parts> | undefined;

  /**
   * The terminal emulator is xterm.js. It is a sizeable download, so it is
   * fetched the first time a terminal is shown, along with the font, which
   * the emulator measures once when it starts.
   */
  function loadParts(): Promise<Parts> {
    parts ??= (async () => {
      const [{ Terminal }, { FitAddon }, gpu] = await Promise.all([
        import('@xterm/xterm'),
        import('@xterm/addon-fit'),
        import('@xterm/addon-webgl').catch(() => null),
        import('@xterm/xterm/css/xterm.css'),
        Promise.all([document.fonts.load('13px "JetBrains Mono"'), document.fonts.load('bold 13px "JetBrains Mono"')]).catch(
          () => undefined,
        ),
      ]);
      return { Terminal, FitAddon, gpu };
    })();
    parts.catch(() => (parts = undefined));
    return parts;
  }

  // Keys a phone's keyboard does not have, and what each one sends.
  const KEYS: { label: string; name: string; data: string }[] = [
    { label: 'esc', name: 'Escape', data: '\x1b' },
    { label: 'tab', name: 'Tab', data: '\t' },
    { label: '^C', name: 'Control C', data: '\x03' },
    { label: '^D', name: 'Control D', data: '\x04' },
    { label: '↑', name: 'Up', data: '\x1b[A' },
    { label: '↓', name: 'Down', data: '\x1b[B' },
    { label: '←', name: 'Left', data: '\x1b[D' },
    { label: '→', name: 'Right', data: '\x1b[C' },
  ];
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import type { Terminal } from '@xterm/xterm';
  import type { FitAddon } from '@xterm/addon-fit';
  import type { TerminalClientMessage, TerminalServerMessage } from '../../../shared/protocol';
  import { app } from '../lib/state.svelte';
  import { theme } from '../lib/theme.svelte';

  // One shell on the server, shown here. The shell outlives this view: leaving
  // the page only disconnects, and coming back redraws what is on its screen.
  let { id, active }: { id: string; active: boolean } = $props();

  let host = $state<HTMLElement>();
  let status = $state<'loading' | 'open' | 'reconnecting' | 'failed'>('loading');
  let term = $state.raw<Terminal>();
  let fit: FitAddon | undefined;
  let socket: WebSocket | undefined;

  function send(message: TerminalClientMessage) {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }

  onMount(() => {
    let gone = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let fitTimer: ReturnType<typeof setTimeout> | undefined;
    let retryMs = 500;
    let observer: ResizeObserver | undefined;
    let screen: Terminal | undefined;

    function connect() {
      const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${scheme}://${location.host}/ws/term/${id}`);
      socket = ws;
      ws.onopen = () => {
        retryMs = 500;
        status = 'open';
        // The server starts by sending what is on the shell's screen, so start from a blank one.
        screen?.reset();
        if (screen) send({ t: 'resize', cols: screen.cols, rows: screen.rows });
      };
      ws.onmessage = (event) => {
        const message = JSON.parse(event.data) as TerminalServerMessage;
        if (message.t === 'out') screen?.write(message.data);
      };
      ws.onclose = (event) => {
        if (gone || socket !== ws) return;
        if (event.code === 4404) {
          // The shell has ended. The list of terminals says so too, and this view goes with it.
          void app.loadTerminals();
          return;
        }
        status = 'reconnecting';
        retryTimer = setTimeout(connect, retryMs);
        retryMs = Math.min(retryMs * 2, 5000);
      };
    }

    loadParts()
      .then(({ Terminal, FitAddon, gpu }) => {
        if (gone || !host) return;
        const view = host;
        const created = new Terminal({ fontFamily: FONT, fontSize: 13, cursorBlink: true, scrollback: 10_000, theme: theme.terminal });
        const fitter = new FitAddon();
        created.loadAddon(fitter);
        created.open(view);
        if (gpu) {
          try {
            const addon = new gpu.WebglAddon();
            // The browser can take the GPU away; xterm.js then goes back to drawing with ordinary elements.
            addon.onContextLoss(() => addon.dispose());
            created.loadAddon(addon);
          } catch {
            // No WebGL here: the ordinary renderer is already in place.
          }
        }
        fitter.fit();
        created.onData((data) => send({ t: 'in', data }));
        created.onResize(({ cols, rows }) => send({ t: 'resize', cols, rows }));
        // Refit when the room changes, but not on every pixel of a drag: each new size redraws the shell's prompt.
        observer = new ResizeObserver(() => {
          clearTimeout(fitTimer);
          fitTimer = setTimeout(() => {
            if (view.clientWidth && view.clientHeight) fitter.fit();
          }, 60);
        });
        observer.observe(view);
        screen = created;
        fit = fitter;
        term = created;
        connect();
        if (active) created.focus();
      })
      .catch(() => {
        status = 'failed';
      });

    return () => {
      gone = true;
      clearTimeout(retryTimer);
      clearTimeout(fitTimer);
      observer?.disconnect();
      socket?.close();
      screen?.dispose();
    };
  });

  // Coming to the front: the space may have changed while this was behind another tab.
  $effect(() => {
    if (!active || !term) return;
    fit?.fit();
    term.focus();
  });

  // The terminal's colours follow the theme.
  $effect(() => {
    if (term) term.options.theme = theme.terminal;
  });
</script>

<div class="view">
  <div class="screen" bind:this={host}></div>
  {#if status !== 'open'}
    <p class="status" role="status">
      {#if status === 'failed'}
        The terminal could not be loaded. Reload the page to try again.
      {:else}
        <span class="spinner"></span> {status === 'loading' ? 'Starting terminal…' : 'Reconnecting…'}
      {/if}
    </p>
  {/if}
  <div class="keys" role="toolbar" aria-label="Extra keys">
    {#each KEYS as key (key.label)}
      <button
        aria-label={key.name}
        onclick={() => {
          send({ t: 'in', data: key.data });
          term?.focus();
        }}
      >
        {key.label}
      </button>
    {/each}
  </div>
</div>

<style>
  .view {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--term-bg);
  }

  .screen {
    flex: 1;
    min-height: 0;
    margin: 6px 0 4px 10px;
    overflow: hidden;
  }

  /* xterm.js gives its scroll area a background of its own; the view already has one. */
  .screen :global(.xterm-viewport) {
    background: transparent !important;
  }

  .status {
    position: absolute;
    top: 8px;
    right: 14px;
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    padding: 3px 10px;
    border-radius: 999px;
    background: rgb(0 0 0 / 55%);
    color: #eaeaea;
    font-size: 12.5px;
  }

  .keys {
    display: none;
    gap: 6px;
    padding: 6px 8px calc(6px + env(safe-area-inset-bottom));
    overflow-x: auto;
    background: var(--term-strip);
  }

  .keys button {
    flex: 1 0 auto;
    min-width: 40px;
    height: 34px;
    padding: 0 8px;
    border: 0;
    border-radius: 6px;
    background: var(--term-key);
    color: var(--term-fg);
    font: 13px var(--mono);
  }

  /* Only where there is no real keyboard to reach for. */
  @media (pointer: coarse) {
    .keys {
      display: flex;
    }
  }
</style>
