<script lang="ts">
  import type { Provider } from '../../../shared/protocol';
  import { colorFor, distinctColors, initials } from '../lib/format';
  import { app } from '../lib/state.svelte';
  import ProviderMark from './ProviderMark.svelte';

  // 'person' and 'folder' show letters, 'model' its agent's sign (Claude's
  // spark, Codex's prompt), 'system' a plain grey tile.
  let {
    kind,
    label,
    size = 36,
    provider = 'claude',
  }: { kind: 'person' | 'folder' | 'model' | 'system'; label: string; size?: number; provider?: Provider } = $props();

  /** Each agent's models in colours of their own, by the word that names the model's family. */
  const MODEL_COLORS: Record<Provider, Record<string, string>> = {
    claude: { fable: '#3667c8', opus: '#c2571a', sonnet: '#7c3085', haiku: '#2b8a6e' },
    codex: { sol: '#1f7a8c', astra: '#4a8f3c', terra: '#8a6418', luna: '#5a4fb8' },
  };

  const OTHER_MODEL: Record<Provider, string> = { claude: '#d1345b', codex: '#1f7a8c' };

  /** The person's own picture, when they have one. Initials show again if it cannot be loaded. */
  let broken = $state<number | undefined>();
  const picture = $derived(kind === 'person' && app.avatar !== undefined && broken !== app.avatar ? `/api/me/avatar?v=${app.avatar}` : '');

  const color = $derived.by(() => {
    if (kind === 'system') return '';
    if (kind !== 'model') return colorFor(label);
    const colors = MODEL_COLORS[provider];
    const family = Object.keys(colors).find((name) => label.toLowerCase().includes(name));
    const own = family ? colors[family]! : OTHER_MODEL[provider];
    // The agent never wears the person's colour, or one close to it, so replies stand apart from prompts at a glance.
    const person = colorFor(app.userName);
    if (distinctColors(own, person)) return own;
    return [...Object.values(colors), OTHER_MODEL[provider], ...Object.values(MODEL_COLORS[provider === 'claude' ? 'codex' : 'claude'])].find((other) => distinctColors(other, person)) ?? own;
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
  {#if picture}
    <img src={picture} alt="" onerror={() => (broken = app.avatar)} />
  {:else if kind === 'model'}
    <ProviderMark {provider} size={Math.round(size * 0.6)} />
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

  .avatar {
    overflow: hidden;
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .avatar.system {
    background: var(--border);
    color: var(--muted);
  }
</style>
