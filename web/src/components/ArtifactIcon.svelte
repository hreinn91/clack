<script lang="ts">
  import type { ArtifactType } from '../../../shared/protocol';

  // A small sign for what kind of artifact something is.
  let { type, size = 16 }: { type: ArtifactType; size?: number } = $props();
</script>

<svg class="art-icon kind-{type}" width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  {#if type === 'html'}
    <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.5" />
    <path d="M1.75 5.75h12.5M4 4.25h.01M5.75 4.25h.01" />
  {:else if type === 'svg'}
    <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.5" />
    <path d="M2.5 11.5 6 8l2.5 2.5L10.5 8.5l3 3" />
    <circle cx="10.75" cy="5.75" r="1" />
  {:else if type === 'markdown'}
    <path d="M4 1.75h5l3.25 3.25v8.25c0 .55-.45 1-1 1H4c-.55 0-1-.45-1-1v-10.5c0-.55.45-1 1-1z" />
    <path d="M5.5 8h5M5.5 10.5h3.5" />
  {:else if type === 'mermaid'}
    <rect x="1.75" y="2" width="4.5" height="3.5" rx="1" />
    <rect x="9.75" y="10.5" width="4.5" height="3.5" rx="1" />
    <path d="M4 5.5v3.5c0 .55.45 1 1 1h4.75" />
  {:else if type === 'code'}
    <path d="M5.5 4.5 2 8l3.5 3.5M10.5 4.5 14 8l-3.5 3.5" />
  {:else}
    <path d="M4 1.75h5l3.25 3.25v8.25c0 .55-.45 1-1 1H4c-.55 0-1-.45-1-1v-10.5c0-.55.45-1 1-1z" />
    <path d="M9 1.75V5h3.25" />
  {/if}
</svg>

<style>
  .art-icon {
    flex: none;
    color: var(--muted);
  }

  .art-icon.kind-html {
    color: var(--series-1);
  }

  .art-icon.kind-svg {
    color: var(--series-5);
  }

  .art-icon.kind-markdown {
    color: var(--series-3);
  }

  .art-icon.kind-mermaid {
    color: var(--series-7);
  }

  .art-icon.kind-code {
    color: var(--series-2);
  }
</style>
