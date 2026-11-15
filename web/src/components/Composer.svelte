<script lang="ts">
  import type { EffortLevel, PermissionMode, Upload } from '../../../shared/protocol';
  import { fileSize, isImagePath, withAttachments } from '../lib/format';
  import { app } from '../lib/state.svelte';
  import Picker from './Picker.svelte';
  import UsageMeter from './UsageMeter.svelte';

  const MODES: { value: PermissionMode; label: string; description: string }[] = [
    { value: 'default', label: 'Ask before changes', description: 'Claude asks before it edits files or runs commands.' },
    { value: 'acceptEdits', label: 'Accept file edits', description: 'File edits go ahead; commands still ask.' },
    { value: 'plan', label: 'Plan only', description: 'Claude looks and plans, and changes nothing.' },
  ];

  const EFFORT_LABELS: Record<EffortLevel, string> = {
    low: 'Low effort',
    medium: 'Medium effort',
    high: 'High effort',
    xhigh: 'Extra high effort',
    max: 'Max effort',
  };

  // The list's own "default" row stands for "let Claude Code choose".
  const DEFAULT_MODEL = 'default';

  let text = $state('');
  let area = $state<HTMLTextAreaElement>();

  // On a touch keyboard Enter should add a line; sending is the button's job.
  const touch = matchMedia('(pointer: coarse)').matches;
  const ready = $derived(app.connected && app.meta !== null);

  const modelValue = $derived(app.meta?.model ?? DEFAULT_MODEL);
  /** Effort levels the chosen model accepts; empty when it has none to choose from. */
  const efforts = $derived(app.models.find((m) => m.value === modelValue)?.efforts ?? []);
  const effortOptions = $derived([
    { value: '', label: 'Default effort', description: 'Whatever Claude Code picks for this model.' },
    ...efforts.map((effort) => ({ value: effort, label: EFFORT_LABELS[effort] })),
  ]);
  // Switching mid-turn would change the model under a reply that is still being written.
  const canConfigure = $derived(ready && !app.running);

  function pickModel(value: string) {
    const next = app.models.find((m) => m.value === value);
    const effort = app.meta?.effort ?? null;
    // Keep the effort only if the new model has that level.
    app.configure(value === DEFAULT_MODEL ? null : value, effort && next?.efforts.includes(effort) ? effort : null);
  }

  function pickEffort(value: string) {
    app.configure(app.meta?.model ?? null, value ? (value as EffortLevel) : null);
  }

  /** Files saved in the chat's folder, waiting to go out with the next message. */
  let attached = $state<Upload[]>([]);
  /** How many files are still on their way to the server. */
  let uploading = $state(0);
  let dropping = $state(false);
  let picker = $state<HTMLInputElement>();

  const canSend = $derived(ready && !app.running && uploading === 0 && (text.trim() !== '' || attached.length > 0));

  // Attachments belong to the chat they were added in.
  $effect(() => {
    app.sessionId;
    attached = [];
  });

  async function attach(files: Iterable<File>) {
    for (const file of files) {
      uploading++;
      const saved = await app.upload(file);
      uploading--;
      if (saved) attached.push(saved);
    }
    area?.focus();
  }

  function onpaste(event: ClipboardEvent) {
    // A copied picture or file is attached; copied text is pasted as usual.
    const files = event.clipboardData?.files;
    if (!files?.length) return;
    event.preventDefault();
    void attach(files);
  }

  function ondrop(event: DragEvent) {
    dropping = false;
    const files = event.dataTransfer?.files;
    if (!files?.length) return;
    event.preventDefault();
    void attach(files);
  }

  function send() {
    if (!canSend) return;
    const message = withAttachments(
      text.trim(),
      attached.map((file) => file.path),
    );
    if (app.prompt(message)) {
      text = '';
      attached = [];
    }
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && !touch) {
      event.preventDefault();
      send();
    }
  }

  // Grow with the text, up to a point.
  $effect(() => {
    text;
    if (!area) return;
    area.style.height = 'auto';
    area.style.height = `${Math.min(area.scrollHeight, 220)}px`;
  });
</script>

<div class="composer">
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="box"
    class:dropping
    ondragover={(event) => {
      if (!ready || !event.dataTransfer?.types.includes('Files')) return;
      event.preventDefault();
      dropping = true;
    }}
    ondragleave={() => (dropping = false)}
    {ondrop}
  >
    {#if attached.length || uploading}
      <ul class="attached" aria-label="Attached files">
        {#each attached as file, index (file.path)}
          <li>
            {#if isImagePath(file.path) && app.meta}
              <img src={`/api/files/image?path=${encodeURIComponent(`sessions/${app.meta.folder}/${file.path}`)}`} alt="" />
            {:else}
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" aria-hidden="true">
                <path d="M4 1.75h5l3.25 3.25v8.25c0 .55-.45 1-1 1H4c-.55 0-1-.45-1-1v-10.5c0-.55.45-1 1-1z" />
                <path d="M9 1.75V5h3.25" />
              </svg>
            {/if}
            <span class="name" title={file.path}>{file.name}</span>
            <span class="size">{fileSize(file.size)}</span>
            <button aria-label={`Remove ${file.name}`} title="Do not attach this file" onclick={() => attached.splice(index, 1)}>
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </li>
        {/each}
        {#if uploading}
          <li class="busy"><span class="spinner"></span> Uploading…</li>
        {/if}
      </ul>
    {/if}
    <textarea
      bind:this={area}
      bind:value={text}
      {onkeydown}
      {onpaste}
      rows="1"
      placeholder={app.running ? `${app.modelName} is working…` : `Message ${app.modelName}`}
      aria-label="Message"
      disabled={!ready}
    ></textarea>
    <div class="row">
      <div class="pickers">
        <button class="add" aria-label="Attach files" title="Attach files: pictures, documents, anything Claude should look at" disabled={!ready} onclick={() => picker?.click()}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true">
            <path d="M8 3v10M3 8h10" />
          </svg>
        </button>
        <input
          type="file"
          multiple
          hidden
          bind:this={picker}
          onchange={(event) => {
            const input = event.currentTarget;
            if (input.files?.length) void attach([...input.files]);
            // So that picking the same file again is noticed.
            input.value = '';
          }}
        />
        <span class="sep" aria-hidden="true"></span>
        <Picker
          label="Permission mode"
          value={app.meta?.mode ?? 'default'}
          options={MODES}
          disabled={!ready}
          onpick={(value) => app.setMode(value as PermissionMode)}
        />
        {#if app.models.length}
          <Picker label="Model" value={modelValue} options={app.models} disabled={!canConfigure} onpick={pickModel} />
          {#if efforts.length}
            <Picker label="Effort" value={app.meta?.effort ?? ''} options={effortOptions} disabled={!canConfigure} onpick={pickEffort} />
          {/if}
        {/if}
      </div>
      <span class="end">
        <UsageMeter />
      {#if app.running}
        <button class="act stop" onclick={() => app.interrupt()}>
          <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true"><rect width="12" height="12" rx="2" fill="currentColor" /></svg>
          Stop
        </button>
      {:else}
        <button class="act send" aria-label="Send" title="Send" disabled={!canSend} onclick={send}>
          <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M2.7 3.3a.75.75 0 0 1 .82-.12l14 6.15a.75.75 0 0 1 0 1.37l-14 6.15a.75.75 0 0 1-1.02-.9L4.3 10 2.5 4.05a.75.75 0 0 1 .2-.75zM5.6 10.75l-1.2 4 9.1-4z M5.6 9.25h7.9l-9.1-4z" />
          </svg>
        </button>
      {/if}
      </span>
    </div>
  </div>
</div>

<style>
  .composer {
    padding: 4px 20px calc(18px + env(safe-area-inset-bottom));
  }

  .box {
    display: grid;
    gap: 2px;
    padding: 8px 8px 6px 12px;
    border: 1px solid var(--border-strong);
    border-radius: 8px;
    background: var(--surface);
  }

  .box:focus-within {
    border-color: var(--muted);
    box-shadow: 0 0 0 1px var(--muted);
  }

  .box.dropping {
    border-color: var(--link);
    box-shadow: 0 0 0 2px var(--link);
  }

  .attached {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 0 0 4px;
    padding: 0;
    list-style: none;
  }

  .attached li {
    display: flex;
    align-items: center;
    gap: 6px;
    max-width: 100%;
    height: 34px;
    padding: 0 4px 0 6px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--sunken);
    font-size: 13px;
  }

  .attached img {
    width: 24px;
    height: 24px;
    border-radius: 3px;
    object-fit: cover;
  }

  .attached svg {
    flex: none;
  }

  .attached .name {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-weight: 700;
  }

  .attached .size,
  .attached .busy {
    color: var(--muted);
    white-space: nowrap;
  }

  .attached .busy {
    padding-right: 8px;
  }

  .attached button {
    display: grid;
    place-items: center;
    flex: none;
    width: 22px;
    height: 22px;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: none;
    color: var(--muted);
  }

  .attached button:hover {
    background: var(--border);
    color: var(--text);
  }

  .add {
    display: grid;
    place-items: center;
    flex: none;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: var(--sunken);
    color: var(--muted);
  }

  .add:hover:not(:disabled) {
    background: var(--border);
    color: var(--text);
  }

  .add:disabled {
    opacity: 0.55;
    cursor: default;
  }

  .sep {
    align-self: center;
    width: 1px;
    height: 18px;
    margin: 0 5px;
    background: var(--border);
  }

  textarea {
    width: 100%;
    padding: 2px 0 4px;
    border: 0;
    outline: 0;
    resize: none;
    background: none;
    font-size: 16px;
    line-height: 1.45;
  }

  textarea::placeholder {
    color: var(--muted);
    opacity: 0.8;
  }

  .row {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 8px;
  }

  .pickers {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 2px;
    min-width: 0;
    margin-left: -4px;
    color: var(--muted);
  }

  .end {
    display: flex;
    align-items: center;
    gap: 4px;
    flex: none;
  }

  .act {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    flex: none;
    height: 28px;
    min-width: 32px;
    padding: 0 8px;
    border: 0;
    border-radius: 4px;
    font-size: 13px;
    font-weight: 700;
  }

  .send {
    background: var(--accent);
    color: var(--accent-ink);
  }

  .send:hover:not(:disabled) {
    filter: brightness(1.1);
  }

  .send:disabled {
    background: none;
    color: var(--muted);
    opacity: 0.6;
    cursor: default;
  }

  .stop {
    background: var(--danger-soft);
    color: var(--danger);
  }

  @media (max-width: 820px) {
    .composer {
      padding-left: 10px;
      padding-right: 10px;
    }

    .act {
      height: 34px;
      min-width: 40px;
    }
  }
</style>
