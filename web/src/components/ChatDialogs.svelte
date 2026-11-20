<script lang="ts">
  import { folderPlace, modelName, providerMaker, providerName, within as inside } from '../lib/format';
  import { app } from '../lib/state.svelte';
  import FolderFinder from './FolderFinder.svelte';
  import Modal from './Modal.svelte';

  // The questions asked about one chat: what to call it, which folder it
  // should work in, and whether it should really be deleted.
  const dialog = $derived(app.dialog);

  let value = $state('');
  let busy = $state(false);
  let error = $state('');

  // Each time a dialog opens it starts from the chat as it is now.
  $effect(() => {
    if (!dialog) return;
    value = dialog.kind === 'rename' ? dialog.session.title : '';
    error = '';
    busy = false;
  });

  // The folder list may be stale (folders made or deleted elsewhere): read it again when the dialog opens.
  $effect(() => {
    if (dialog?.kind === 'move') void app.loadFolders();
  });

  function close() {
    if (!busy) app.dialog = null;
  }

  async function run(action: () => Promise<void>) {
    busy = true;
    error = '';
    try {
      await action();
      app.dialog = null;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
  }

  // ---- deleting a folder from the chat tree ----

  const folder = $derived(app.deletingFolder);
  const within = (path: string) => folder !== null && inside(path, folder);
  /** The chats that work in the folder, or in one inside it. They stay, but lose their folder. */
  const folderChats = $derived(app.sessions.filter((chat) => !chat.missing && within(chat.folder)));
  const subfolders = $derived(app.folders.filter((entry) => entry.name !== folder && within(entry.name)).length);
  const busyChat = $derived(folderChats.some((chat) => chat.running));

  $effect(() => {
    if (folder === null) return;
    error = '';
    busy = false;
  });

  function closeFolder() {
    if (!busy) app.deletingFolder = null;
  }

  async function removeFolder(event: SubmitEvent) {
    event.preventDefault();
    if (folder === null || busy) return;
    busy = true;
    error = '';
    try {
      await app.deleteFolder(folder);
      app.deletingFolder = null;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
  }

  // ---- taking an added outside folder off the list ----

  const root = $derived(app.removingRoot);
  const rootChats = $derived(root ? app.sessions.filter((chat) => inside(chat.folder, root.path)).length : 0);

  $effect(() => {
    if (root === null) return;
    error = '';
    busy = false;
  });

  function closeRoot() {
    if (!busy) app.removingRoot = null;
  }

  async function forget(event: SubmitEvent) {
    event.preventDefault();
    if (root === null || busy) return;
    busy = true;
    error = '';
    try {
      await app.removeRoot(root.path);
      app.removingRoot = null;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
  }

  // ---- moving the open chat to the other agent ----

  const switching = $derived(app.switching);
  const target = $derived(switching ? app.usages[switching.provider] : undefined);
  /** The target agent's most-used limit, so it is clear what the switch will cost. */
  const tightest = $derived(
    target?.available ? target.windows.reduce<(typeof target.windows)[number] | undefined>((worst, w) => (!worst || w.used > worst.used ? w : worst), undefined) : undefined,
  );

  function closeSwitch() {
    app.switching = null;
  }

  function confirmSwitch(event: SubmitEvent) {
    event.preventDefault();
    if (!switching) return;
    app.configure(switching.model, switching.effort, switching.provider);
    app.switching = null;
  }

  function submit(event: SubmitEvent) {
    event.preventDefault();
    if (!dialog) return;
    const { kind, session } = dialog;
    if (kind === 'rename') void run(() => app.renameChat(session.sessionId, value));
    else if (kind === 'delete') void run(() => app.deleteChat(session.sessionId));
    // Moving happens when a folder is picked in the finder.
  }
</script>

{#if dialog}
  {@const session = dialog.session}
  <Modal title={dialog.kind === 'rename' ? 'Rename chat' : dialog.kind === 'move' ? 'Change folder' : 'Delete chat'} onclose={close}>
    <form onsubmit={submit}>
      {#if dialog.kind === 'rename'}
        <h2>Rename chat</h2>
        <input type="text" aria-label="Chat name" maxlength="120" bind:value />
      {:else if dialog.kind === 'move'}
        <h2>Change folder</h2>
        <p>
          <strong>{session.title}</strong> works in <code>{session.folder}</code>. Find another folder, or type a new name
          to create one. {providerName(app.provider)} works there from the next message; no files are moved.
        </p>
        <FolderFinder
          current={session.folder}
          {busy}
          action="Move here"
          placeholder="Find a folder, or name a new one"
          onpick={(path) => void run(() => app.moveChat(session.sessionId, path))}
        />
      {:else}
        <h2>Delete this chat?</h2>
        <p>
          <strong>{session.title}</strong> will be removed for good, and cannot be brought back. The files in
          <code>{session.folder}</code> stay where they are.
        </p>
      {/if}

      {#if error}<p class="error" role="alert">{error}</p>{/if}

      <div class="actions">
        <!-- For a deletion the keyboard starts on Cancel, so a stray Enter deletes nothing. -->
        <button type="button" class="btn" data-autofocus={dialog.kind === 'delete' ? '' : undefined} onclick={close} disabled={busy}>Cancel</button>
        {#if dialog.kind === 'rename'}
          <button class="btn primary" disabled={busy || !value.trim() || value.trim() === session.title}>Save</button>
        {:else if dialog.kind === 'delete'}
          <button class="btn delete" disabled={busy}>Delete</button>
        {/if}
      </div>
    </form>
  </Modal>
{/if}

{#if folder !== null}
  <Modal title="Delete folder" onclose={closeFolder}>
    <form onsubmit={removeFolder}>
      <h2>Delete this folder?</h2>
      <p>
        <code>{folderPlace(folder, app.home)}</code> and everything in it{subfolders
          ? `, including ${subfolders} folder${subfolders === 1 ? '' : 's'} inside it,`
          : ''} will be deleted for good. The files cannot be brought back.
      </p>
      {#if folderChats.length}
        <p>
          {folderChats.length === 1 ? '1 chat works' : `${folderChats.length} chats work`} in it. The
          {folderChats.length === 1 ? 'chat is' : 'chats are'} kept and move to the Archived list, where the folder can be
          recreated empty or another one picked.
        </p>
      {/if}
      {#if busyChat}<p class="error">A chat in this folder is still working. Stop it or wait for it to finish first.</p>{/if}

      {#if error}<p class="error" role="alert">{error}</p>{/if}

      <div class="actions">
        <!-- The keyboard starts on Cancel, so a stray Enter deletes nothing. -->
        <button type="button" class="btn" data-autofocus="" onclick={closeFolder} disabled={busy}>Cancel</button>
        <button class="btn delete" disabled={busy || busyChat}>Delete folder</button>
      </div>
    </form>
  </Modal>
{/if}

{#if root !== null}
  <Modal title="Remove folder" onclose={closeRoot}>
    <form onsubmit={forget}>
      <h2>Remove this folder from clack?</h2>
      <p>
        <code>{root.label}</code> leaves the sidebar, and new chats can no longer work in it. Nothing in the folder is
        deleted or changed.
      </p>
      {#if rootChats}
        <p>
          {rootChats === 1 ? 'Its 1 chat leaves' : `Its ${rootChats} chats leave`} the sidebar too. Add the folder again
          to get {rootChats === 1 ? 'it' : 'them'} back.
        </p>
      {/if}

      {#if error}<p class="error" role="alert">{error}</p>{/if}

      <div class="actions">
        <button type="button" class="btn" data-autofocus="" onclick={closeRoot} disabled={busy}>Cancel</button>
        <button class="btn primary" disabled={busy}>Remove</button>
      </div>
    </form>
  </Modal>
{/if}

{#if switching}
  {@const to = providerName(switching.provider)}
  {@const from = providerName(app.provider)}
  <Modal title={`Switch to ${to}`} onclose={closeSwitch}>
    <form onsubmit={confirmSwitch}>
      <h2>Carry on with {to}?</h2>
      <p>
        This chat moves from {from} to <strong>{to}{switching.model ? ` · ${modelName(switching.model)}` : ''}</strong>
        ({providerMaker(switching.provider)}). {to} starts fresh: with your next message it is handed the conversation so far as text,
        with older parts shortened. What {from} changed in the folder stays on disk; what it read or ran is not in {to}'s memory.
      </p>
      <p>
        Usage from then on counts against your {switching.provider === 'codex' ? 'ChatGPT' : 'Claude'} plan{tightest
          ? ` (${tightest.label.toLowerCase()}: ${tightest.used}% used)`
          : ''}. You can switch back later; the chat keeps both parts.
      </p>
      <div class="actions">
        <button type="button" class="btn" data-autofocus="" onclick={closeSwitch}>Cancel</button>
        <button class="btn primary">Switch to {to}</button>
      </div>
    </form>
  </Modal>
{/if}

<style>
  form {
    display: grid;
    gap: 12px;
    padding: 20px 24px;
    min-height: 0;
    overflow-y: auto;
  }

  h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 900;
  }

  p {
    margin: 0;
  }

  code {
    padding: 0.1em 0.3em;
    border: 1px solid var(--border);
    border-radius: 3px;
    background: var(--sunken);
    font: 0.85em var(--mono);
  }

  input {
    min-height: 40px;
    padding: 6px 12px;
    border: 1px solid var(--border-strong);
    border-radius: 6px;
    background: var(--bg);
    font-size: 16px;
  }

  .error {
    color: var(--danger);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 4px;
  }

  .delete {
    border-color: var(--danger);
    background: var(--danger);
    color: #fff;
  }

  .delete:hover:not(:disabled) {
    background: var(--danger);
    filter: brightness(1.1);
  }
</style>
