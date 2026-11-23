// The launcher: the first page of the desktop app. It opens the server used
// last; when nothing answers there it says so, lets another address be typed,
// and (for an address on this computer) can start Clack from its folder.

const { invoke } = window.__TAURI__.core;
const $ = (id) => document.getElementById(id);

/** Came here from "Change Server…": no connecting by itself. */
const changing = new URLSearchParams(location.search).has('change');
let info = null;
let starting = false;
let logTimer = 0;

function show(section) {
  $('busy').hidden = section !== 'busy';
  $('pick').hidden = section !== 'pick';
}

function busy(text, { log = false, cancel = null } = {}) {
  $('busy-text').textContent = text;
  $('busy-log').hidden = !log;
  $('busy-log').textContent = '';
  $('busy-cancel').hidden = !cancel;
  $('busy-cancel').onclick = cancel;
  show('busy');
}

function problem(text) {
  $('problem').textContent = text ?? '';
  $('problem').hidden = !text;
}

/** Whether an address is this computer, where Clack can be started. */
function isLocal(address) {
  try {
    const url = new URL(address.includes('://') ? address : `http://${address}`);
    return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

async function refreshLocal() {
  const local = isLocal($('address').value);
  $('local').hidden = !local;
  if (!local) return;
  const found = await invoke('folder_info');
  $('folder').textContent = found.folder ?? 'Not chosen';
  $('node').textContent = found.node.problem ?? `${found.node.version} (${found.node.path})`;
  $('node').classList.toggle('bad', !!found.node.problem);
  const problems = [...found.problems];
  $('folder-problems').replaceChildren(
    ...problems.map((text) => {
      const item = document.createElement('li');
      // `npm install` and the like are shown as code.
      for (const [i, part] of text.split('`').entries()) {
        item.append(i % 2 ? Object.assign(document.createElement('code'), { textContent: part }) : part);
      }
      return item;
    }),
  );
  $('folder-problems').hidden = !problems.length;
  $('start').disabled = problems.length > 0 || !!found.node.problem;
  return problems.length === 0 && !found.node.problem;
}

/** Opens the server at the address when it answers; otherwise says why it did not. */
async function connect(address, { auto = false } = {}) {
  problem('');
  busy(`Connecting to ${address}…`);
  let probe;
  try {
    probe = await invoke('probe_server', { address });
  } catch (err) {
    probe = { reachable: false, clack: false, error: String(err), local: false };
  }
  if (probe.clack) {
    await invoke('open_server', { address });
    return;
  }
  $('address').value = address;
  const ready = await refreshLocal();
  const canStart = probe.local && !probe.reachable && ready;
  if (auto && canStart && info.settings.autoStart) {
    await start();
    return;
  }
  problem(
    probe.local && !probe.reachable
      ? `Clack is not running on this computer (${probe.url.replace(/\/$/, '')}). Start it below, or connect to another server.`
      : `Could not reach Clack at ${probe.url.replace(/\/$/, '')}: ${probe.error}`,
  );
  show('pick');
}

async function start() {
  if (starting) return;
  starting = true;
  const address = $('address').value.trim();
  problem('');
  busy('Starting Clack…', {
    log: true,
    cancel: async () => {
      await invoke('stop_server');
    },
  });
  // The server's own output, as it starts.
  logTimer = setInterval(async () => {
    const lines = await invoke('server_log');
    $('busy-log').textContent = lines.slice(-8).join('\n');
  }, 400);
  try {
    await invoke('start_server', { address, autoStart: $('auto').checked });
    clearInterval(logTimer);
    await invoke('open_server', { address });
  } catch (err) {
    clearInterval(logTimer);
    problem(String(err).split('\n')[0]);
    const detail = String(err).split('\n').slice(1).join('\n');
    $('start-log').textContent = detail;
    $('start-log').hidden = !detail;
    await refreshLocal();
    show('pick');
  } finally {
    starting = false;
  }
}

$('connect').addEventListener('submit', (event) => {
  event.preventDefault();
  void connect($('address').value.trim() || 'http://localhost:4317');
});

$('address').addEventListener('input', () => void refreshLocal());

$('choose').addEventListener('click', async () => {
  await invoke('choose_folder');
  await refreshLocal();
});

$('auto').addEventListener('change', () => void invoke('set_auto_start', { on: $('auto').checked }));

$('start').addEventListener('click', () => void start());

(async () => {
  info = await invoke('launcher_info');
  $('address').value = info.settings.server;
  $('auto').checked = info.settings.autoStart;
  if (changing) {
    await refreshLocal();
    show('pick');
    $('address').focus();
    $('address').select();
  } else {
    await connect(info.settings.server, { auto: true });
  }
})();
