<script lang="ts">
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
          to create one. Claude works there from the next message; no files are moved.
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
