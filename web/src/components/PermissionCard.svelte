<script lang="ts">
  import type { PermissionRequest } from '../../../shared/protocol';
  import { providerName } from '../lib/format';
  import { app } from '../lib/state.svelte';
  import ToolInput from './ToolInput.svelte';

  let { request }: { request: PermissionRequest } = $props();

  type Question = {
    question: string;
    header?: string;
    multiSelect?: boolean;
    options: { label: string; description?: string }[];
  };

  // AskUserQuestion arrives as a permission request too, but it wants answers rather than a yes or no.
  const questions = $derived(
    request.toolName === 'AskUserQuestion' && Array.isArray(request.input.questions)
      ? (request.input.questions as Question[])
      : null,
  );
  const isPlan = $derived(request.toolName === 'ExitPlanMode');
  const agent = $derived(providerName(app.provider));
  /** An MCP server asking for details: a form rather than yes or no. */
  const form = $derived(request.form);
  let values = $state<Record<string, string>>({});
  const formComplete = $derived(form?.fields.every((field) => !field.required || (values[field.name] ?? '') !== '') ?? true);

  function submitForm() {
    app.decide(request.id, 'allow', { ...values });
  }
  // For file tools the description is just the path, which the preview below already shows.
  const description = $derived(
    request.description && !String(request.input.file_path ?? '').endsWith(request.description)
      ? request.description
      : '',
  );

  let picked = $state<Record<number, string[]>>({});
  let typed = $state<Record<number, string>>({});

  function toggle(index: number, label: string, multi: boolean) {
    const current = picked[index] ?? [];
    if (multi) {
      picked[index] = current.includes(label) ? current.filter((l) => l !== label) : [...current, label];
    } else {
      picked[index] = [label];
      typed[index] = '';
    }
  }

  function answer(index: number): string {
    const own = (typed[index] ?? '').trim();
    return [...(picked[index] ?? []), ...(own ? [own] : [])].join(', ');
  }

  const complete = $derived(questions?.every((_, i) => answer(i)) ?? true);

  function submitAnswers() {
    if (!questions) return;
    app.decide(request.id, 'allow', Object.fromEntries(questions.map((q, i) => [q.question, answer(i)])));
  }
</script>

<section class="card" aria-label={`${agent} needs your input`}>
  {#if form}
    <h3>{request.title ?? 'Some details are needed'}</h3>
    {#if form.message}<p class="desc">{form.message}</p>{/if}
    {#if form.url}
      <p class="desc">Open <a href={form.url} target="_blank" rel="noopener noreferrer">{form.url}</a>, finish there, then carry on here.</p>
    {/if}
    {#each form.fields as field (field.name)}
      <label class="field">
        <span>{field.label}{field.required ? '' : ' (optional)'}</span>
        {#if field.description}<small>{field.description}</small>{/if}
        {#if field.type === 'choice' && field.options}
          <select bind:value={values[field.name]}>
            <option value="">Choose…</option>
            {#each field.options as option (option)}<option value={option}>{option}</option>{/each}
          </select>
        {:else if field.type === 'boolean'}
          <select bind:value={values[field.name]}>
            <option value="">Choose…</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
        {:else}
          <input type={field.type === 'number' ? 'number' : 'text'} bind:value={values[field.name]} />
        {/if}
      </label>
    {/each}
    <div class="actions">
      <button class="btn" onclick={() => app.decide(request.id, 'deny')}>Decline</button>
      <button class="btn primary" disabled={!formComplete} onclick={submitForm}>{form.fields.length ? 'Send' : 'Done'}</button>
    </div>
  {:else if questions}
    {#each questions as q, i (q.question)}
      <fieldset>
        <legend>{q.question}</legend>
        <div class="options">
          {#each q.options as option (option.label)}
            <button
              class="option"
              class:on={picked[i]?.includes(option.label)}
              aria-pressed={picked[i]?.includes(option.label) ?? false}
              onclick={() => toggle(i, option.label, !!q.multiSelect)}
            >
              <strong>{option.label}</strong>
              {#if option.description}<span>{option.description}</span>{/if}
            </button>
          {/each}
        </div>
        <input
          type="text"
          placeholder={q.multiSelect ? 'Add your own…' : 'Or type your own answer…'}
          aria-label="Your own answer"
          bind:value={typed[i]}
          oninput={() => {
            if (!q.multiSelect) picked[i] = [];
          }}
        />
      </fieldset>
    {/each}
    <div class="actions">
      <button class="btn" onclick={() => app.decide(request.id, 'deny')}>Skip</button>
      <button class="btn primary" disabled={!complete} onclick={submitAnswers}>Send answers</button>
    </div>
  {:else}
    <h3>{isPlan ? `${agent} has a plan. Go ahead with it?` : (request.title ?? `Allow ${agent} to use ${request.toolName}?`)}</h3>
    {#if description}<p class="desc">{description}</p>{/if}
    <ToolInput name={request.toolName} input={request.input} />
    <div class="actions">
      <button class="btn" onclick={() => app.decide(request.id, 'deny')}>{isPlan ? 'Keep planning' : 'Deny'}</button>
      {#if request.canAlways && !isPlan}
        <button class="btn" onclick={() => app.decide(request.id, 'always')}>{request.alwaysLabel ?? 'Always allow'}</button>
      {/if}
      <button class="btn primary" onclick={() => app.decide(request.id, 'allow')}>
        {isPlan ? 'Approve plan' : 'Allow once'}
      </button>
    </div>
  {/if}
</section>

<style>
  .card {
    display: grid;
    gap: 10px;
    padding: 14px;
    border: 1px solid var(--accent);
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--shadow);
  }

  h3,
  legend {
    margin: 0;
    padding: 0;
    font-size: 15px;
    font-weight: 600;
  }

  .desc {
    margin: 0;
    color: var(--muted);
    font-size: 13.5px;
  }

  fieldset {
    display: grid;
    gap: 8px;
    margin: 0;
    padding: 0;
    border: 0;
    min-width: 0;
  }

  .options {
    display: grid;
    gap: 6px;
    margin-top: 8px;
  }

  .option {
    display: grid;
    gap: 1px;
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg);
    text-align: left;
  }

  .option span {
    color: var(--muted);
    font-size: 13px;
  }

  .option.on {
    border-color: var(--accent);
    background: var(--accent-soft);
  }

  .field {
    display: grid;
    gap: 4px;
  }

  .field span {
    font-weight: 600;
    font-size: 14px;
  }

  .field small {
    color: var(--muted);
  }

  select {
    min-height: 38px;
    padding: 6px 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg);
    font-size: 16px;
  }

  input {
    min-height: 38px;
    padding: 6px 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg);
    font-size: 16px;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
  }

  @media (max-width: 520px) {
    .actions .btn {
      flex: 1;
      min-height: 44px;
    }
  }
</style>
