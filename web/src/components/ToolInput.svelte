<script lang="ts">
  import { relativeTo } from '../lib/format';
  import { app } from '../lib/state.svelte';
  import Markdown from './Markdown.svelte';

  let { name, input }: { name: string; input: unknown } = $props();

  const fields = $derived((input && typeof input === 'object' ? input : {}) as Record<string, unknown>);
  const str = (value: unknown) => (typeof value === 'string' ? value : '');
  const path = $derived(relativeTo(str(fields.file_path), app.meta?.cwd));
</script>

{#if name === 'Bash'}
  <pre class="code">{str(fields.command)}</pre>
  {#if fields.description}<p class="note">{str(fields.description)}</p>{/if}
{:else if name === 'Edit'}
  <p class="path">{path}</p>
  <pre class="code del">{str(fields.old_string)}</pre>
  <pre class="code add">{str(fields.new_string)}</pre>
{:else if name === 'Write'}
  <p class="path">{path}</p>
  <pre class="code add">{str(fields.content)}</pre>
{:else if name === 'ExitPlanMode' && fields.plan}
  <Markdown text={str(fields.plan)} />
{:else}
  <pre class="code">{JSON.stringify(input, null, 2)}</pre>
{/if}

<style>
  .path,
  .note {
    margin: 0;
    color: var(--muted);
    font-size: 13px;
  }

  .path {
    font-family: var(--mono);
    overflow-wrap: anywhere;
  }
</style>
