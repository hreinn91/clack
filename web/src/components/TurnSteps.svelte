<script lang="ts">
  import type { Item, PlanItem } from '../../../shared/protocol';
  import { layoutTurn } from '../lib/steps';
  import type { TurnStep } from '../lib/steps';
  import { app } from '../lib/state.svelte';
  import ChatPlan from './ChatPlan.svelte';
  import Entry from './Entry.svelte';
  import PermissionCard from './PermissionCard.svelte';

  // The Steps view of the agent's turn: a checklist of the work with the
  // details folded under each step, any plan-mode proposal, then the answer.
  let {
    items,
    before,
    live = false,
    agent,
  }: {
    items: Item[];
    /** The entry just before these, where a step may have started. */
    before?: string;
    /** The agent is still working on this turn. */
    live?: boolean;
    /** Who did the work, for the tooltips: "Claude", "Codex". */
    agent: string;
  } = $props();

  const layout = $derived(layoutTurn(items, { live, before }));
  const done = $derived(layout.steps.filter((step) => step.status === 'done').length);
  const calls = $derived(layout.steps.reduce((sum, step) => sum + step.calls, 0));
  /** The whole list can be folded to its heading. */
  let open = $state(true);

  const STATUS: Record<TurnStep['status'], string> = {
    done: 'Done',
    running: 'Under way',
    unfinished: 'Not finished',
    pending: 'Not started',
  };
</script>

{#snippet mark(step: TurnStep)}
  {#if step.status === 'running'}
    <span class="spinner" role="img" aria-label={STATUS.running}></span>
  {:else}
    <span class="mark" role="img" aria-label={STATUS[step.status]}>
      {#if step.status === 'done'}
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="m2.5 8 3.5 3.5 7-7" /></svg>
      {/if}
    </span>
  {/if}
{/snippet}

{#snippet proposal(plan: PlanItem, withSteps: boolean)}
  {#if plan.markdown}<ChatPlan plan={withSteps ? plan : { ...plan, steps: [] }} />{/if}
  {#each app.pending.filter((request) => request.planId === plan.id) as request (request.id)}
    <PermissionCard {request} />
  {/each}
{/snippet}

{#if layout.source === 'none'}
  {#each layout.shown as item (item.id)}
    {#if item.kind === 'plan'}
      {@render proposal(item, true)}
    {:else}
      <Entry {item} />
    {/if}
  {/each}
{:else}
  <section
    class="steps"
    aria-label="Steps"
    title={layout.source === 'plan' ? `${agent}'s own plan for this turn, ticked off as it worked` : `Put together by Clack from the tools ${agent} used`}
  >
    <button class="head" aria-expanded={open} onclick={() => (open = !open)}>
      <span class="title">Steps</span>
      <span class="sum">
        {#if layout.source === 'plan'}{done} of {layout.steps.length} done{:else}{calls} tool {calls === 1 ? 'call' : 'calls'}{/if}
      </span>
      <svg class="chevron" width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 3.5 4.5 4.5L6 12.5" /></svg>
    </button>
    {#if open}
      <ol>
        {#each layout.steps as step (step.key)}
          <li class={step.status}>
            {#if step.items.length}
              <details>
                <summary title={step.title}>
                  {@render mark(step)}
                  <span class="hit">
                    <span class="label">{step.label}</span>
                    {#if layout.source === 'plan' && step.calls}<span class="count">{step.calls} {step.calls === 1 ? 'call' : 'calls'}</span>{/if}
                    {#if step.failed}<span class="flag">{step.failed} failed</span>{/if}
                    <svg class="chevron" width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 3.5 4.5 4.5L6 12.5" /></svg>
                  </span>
                </summary>
                <div class="work">
                  {#each step.items as item (item.id)}<Entry {item} />{/each}
                </div>
              </details>
            {:else}
              <div class="row">
                {@render mark(step)}
                <span class="hit"><span class="label">{step.label}</span></span>
              </div>
            {/if}
          </li>
        {/each}
      </ol>
    {/if}
  </section>
  {#if layout.plan}{@render proposal(layout.plan, layout.source !== 'plan')}{/if}
  {#each layout.shown as item (item.id)}<Entry {item} />{/each}
{/if}

<style>
  .steps {
    margin: 6px 0 6px;
    font-size: 14px;
  }

  button.head {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin: 0 0 4px -6px;
    padding: 2px 6px;
    border: 0;
    border-radius: 6px;
    background: none;
    color: var(--muted);
    font: inherit;
    font-size: 12.5px;
    cursor: pointer;
  }

  button.head:hover {
    background: var(--hover);
    color: var(--text);
  }

  .title {
    font-weight: 700;
  }

  .sum {
    font-variant-numeric: tabular-nums;
  }

  .sum::before {
    content: '·';
    margin-right: 6px;
  }

  .chevron {
    flex: none;
    transition: transform 0.15s;
  }

  button.head[aria-expanded='true'] .chevron,
  details[open] > summary .chevron {
    transform: rotate(90deg);
  }

  ol {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* The steps hang on a thin line, from each step's mark down to the next one's. */
  li {
    position: relative;
  }

  li::before {
    content: '';
    position: absolute;
    left: 7.5px;
    top: 26px;
    bottom: -5px;
    width: 1px;
    background: var(--border);
  }

  li:last-child:not(:has(> details[open]))::before {
    display: none;
  }

  li:last-child::before {
    bottom: 8px;
  }

  summary,
  .row {
    display: flex;
    align-items: center;
    gap: 4px;
    width: fit-content;
    max-width: 100%;
    padding: 3px 0;
  }

  summary {
    list-style: none;
    cursor: pointer;
  }

  summary::-webkit-details-marker {
    display: none;
  }

  .hit {
    display: inline-flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
    padding: 2px 6px;
    border-radius: 6px;
  }

  .hit .chevron {
    align-self: center;
    color: var(--muted);
  }

  summary:hover .hit {
    background: var(--hover);
  }

  summary:hover .chevron {
    color: var(--text);
  }

  .label {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .running .label {
    font-weight: 600;
  }

  .pending .label {
    color: var(--muted);
  }

  .count {
    flex: none;
    color: var(--muted);
    font-size: 12.5px;
    font-variant-numeric: tabular-nums;
  }

  .flag {
    flex: none;
    color: var(--danger);
    font-size: 12.5px;
    font-weight: 600;
  }

  .mark,
  .spinner {
    flex: none;
    box-sizing: border-box;
    width: 16px;
    height: 16px;
    margin: 0 6px 0 0;
  }

  .mark {
    display: inline-grid;
    place-items: center;
    border: 1.5px solid var(--border-strong, var(--muted));
    border-radius: 50%;
    background: var(--bg);
  }

  .done .mark {
    border: 0;
    background: var(--accent);
    color: var(--accent-ink);
  }

  /* Was under way when the turn ended. */
  .unfinished .mark {
    border-color: var(--accent);
    border-style: dashed;
  }

  .work {
    display: flex;
    flex-direction: column;
    gap: 8px;
    /* In line with the steps' names. */
    margin: 4px 0 12px 32px;
  }

  @media (prefers-reduced-motion: reduce) {
    .chevron {
      transition: none;
    }
  }
</style>
