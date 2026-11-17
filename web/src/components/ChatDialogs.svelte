<script lang="ts">
  import { folderPath } from '../lib/format';
  import { app } from '../lib/state.svelte';
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

  /** What the server will make of a typed folder name. */
  const slug = $derived(folderPath(value));
  const exists = $derived(app.folders.some((folder) => folder.name === slug));
  const others = $derived(app.pickableFolders.filter((folder) => folder.name !== dialog?.session.folder));

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
    else if (kind === 'move') void run(() => app.moveChat(session.sessionId, slug));
    else void run(() => app.deleteChat(session.sessionId));
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
          <strong>{session.title}</strong> works in <code>{session.folder}</code>. Pick another folder, or type a new name
          to create one. Claude works there from the next message. No files are moved.
        </p>
        <input type="text" class="mono" aria-label="Folder name" placeholder="folder-name" autocapitalize="off" autocomplete="off" spellcheck="false" maxlength="80" bind:value />
        {#if slug}
          <p class="path">
            data/sessions/<strong>{slug}</strong>
            <span>{slug === session.folder ? 'is where it works now' : exists ? 'exists already' : 'will be created'}</span>
          </p>
        {/if}
        {#if others.length}
          <ul class="folders" aria-label="Existing folders">
            {#each others as folder (folder.name)}
              <li>
                <button type="button" class:on={folder.name === slug} onclick={() => (value = folder.name)}>
                  <span aria-hidden="true">#</span>
                  {folder.name}
                </button>
              </li>
            {/each}
          </ul>
        {/if}
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
        {:else if dialog.kind === 'move'}
          <button class="btn primary" disabled={busy || !slug || slug === session.folder}>Use this folder</button>
        {:else}
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

  input.mono {
    font-family: var(--mono);
    font-size: 15px;
  }

  .path {
    color: var(--muted);
    font: 13px var(--mono);
    overflow-wrap: anywhere;
  }

  .path strong {
    color: var(--text);
  }

  .path span {
    margin-left: 6px;
    font-family: var(--font);
  }

  .folders {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 0;
    padding: 0;
    max-height: 168px;
    overflow-y: auto;
    list-style: none;
  }

  .folders button {
    display: flex;
    gap: 5px;
    padding: 4px 10px;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: none;
    font: 13px var(--mono);
  }

  .folders button:hover {
    border-color: var(--border-strong);
    background: var(--hover);
  }

  .folders button.on {
    border-color: var(--accent);
    background: var(--accent-soft);
  }

  .folders span {
    color: var(--muted);
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
