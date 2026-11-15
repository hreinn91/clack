<script lang="ts">
  import { colorFor, initials } from '../lib/format';

  // 'person' and 'folder' show letters, 'model' a spark, 'system' a plain grey tile.
  let {
    kind,
    label,
    size = 36,
  }: { kind: 'person' | 'folder' | 'model' | 'system'; label: string; size?: number } = $props();

  const MODEL_COLORS: Record<string, string> = {
    fable: '#3667c8',
    opus: '#c2571a',
    sonnet: '#7c3085',
    haiku: '#2b8a6e',
  };

  const color = $derived.by(() => {
    if (kind === 'system') return '';
    if (kind !== 'model') return colorFor(label);
    const family = Object.keys(MODEL_COLORS).find((name) => label.toLowerCase().includes(name));
    return family ? MODEL_COLORS[family]! : '#d1345b';
  });
</script>

<span
  class="avatar"
  class:system={kind === 'system'}
  style:width={`${size}px`}
  style:height={`${size}px`}
  style:font-size={`${Math.round(size * 0.42)}px`}
  style:border-radius={`${size > 24 ? 6 : 4}px`}
  style:background={color || undefined}
  aria-hidden="true"
>
  {#if kind === 'model'}
    <svg viewBox="0 0 24 24" width="62%" height="62%" fill="currentColor">
      <path d="M12 2.5c.5 5.4 3.6 8.5 9 9.5-5.4 1-8.5 4.1-9 9.5-.5-5.4-3.6-8.5-9-9.5 5.4-1 8.5-4.1 9-9.5z" />
    </svg>
  {:else if kind === 'system'}
    <svg viewBox="0 0 24 24" width="58%" height="58%" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 7.6v.1" />
    </svg>
  {:else}
    {initials(label).slice(0, kind === 'folder' ? 1 : 2)}
  {/if}
</span>

<style>
  .avatar {
    display: inline-grid;
    place-items: center;
    flex: none;
    color: #fff;
    font-weight: 900;
    line-height: 1;
    user-select: none;
  }

  .avatar.system {
    background: var(--border);
    color: var(--muted);
  }
</style>
