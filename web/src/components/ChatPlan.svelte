<script lang="ts">
  import type { PlanItem } from '../../../shared/protocol';
  import Markdown from './Markdown.svelte';

  let { plan }: { plan: PlanItem } = $props();
  const completed = $derived(plan.steps.filter(step => step.status === 'completed').length);
</script>

<section class="plan" aria-label="Plan">
  <header>
    <h2>Plan</h2>
    {#if plan.steps.length}<span>{completed} of {plan.steps.length} complete</span>{/if}
  </header>
  {#if plan.markdown}<Markdown text={plan.markdown} />{/if}
  {#if plan.steps.length}
    <ul aria-label="Plan steps">
      {#each plan.steps as step}
        <li class:active={step.status === 'in_progress'} class:done={step.status === 'completed'}>
          <span class="mark" role="img" aria-label={step.status === 'in_progress' ? 'In progress' : step.status === 'completed' ? 'Completed' : 'Pending'}>
            {#if step.status === 'completed'}
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m2.5 8 3.5 3.5 7-7"/></svg>
            {/if}
          </span>
          <span>{step.label}</span>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .plan { display: grid; gap: 12px; padding: 14px 16px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); }
  header { display: flex; align-items: baseline; flex-wrap: wrap; gap: 10px; }
  h2 { margin: 0; font-size: 16px; }
  header span { color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
  ul { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
  li { display: flex; align-items: baseline; gap: 9px; overflow-wrap: anywhere; }
  .mark { display: inline-grid; flex: none; place-items: center; align-self: flex-start; margin-top: 0.25em; width: 15px; height: 15px; border: 1px solid var(--muted); border-radius: 50%; }
  .active .mark, .done .mark { color: var(--accent); border-color: currentColor; }
  .active .mark::after { content: ''; width: 7px; height: 7px; background: currentColor; border-radius: 50%; }
  .active { font-weight: 600; }
  .done { color: var(--muted); }
</style>
