<script lang="ts">
  import { AUTO, COLOR_FIELDS, FONTS, PRESETS, SIZES, previewVariables, theme } from '../lib/theme.svelte';
  import type { Colors, Preset } from '../lib/theme.svelte';

  let { onmenu }: { onmenu: () => void } = $props();

  const light = PRESETS.find((p) => p.id === 'aubergine')!;
  const dark = PRESETS.find((p) => p.id === 'aubergine-dark')!;

  const groups = [...new Set(COLOR_FIELDS.map((field) => field.group))];

  function style(preset: Preset): string {
    return Object.entries(previewVariables(preset))
      .map(([name, value]) => `${name}:${value}`)
      .join(';');
  }

  function typed(key: keyof Colors, value: string) {
    const hex = value.trim().startsWith('#') ? value.trim() : `#${value.trim()}`;
    theme.setColor(key, hex);
  }
</script>

<!-- A small picture of the app in a theme's colours. -->
{#snippet picture(preset: Preset)}
  <span class="picture" style={style(preset)} aria-hidden="true">
    <span class="p-rail"><i></i><i></i><i></i></span>
    <span class="p-side"><i></i><i class="on"></i><i></i><i></i></span>
    <span class="p-page">
      <i class="who"></i>
      <i class="line"></i>
      <i class="line short"></i>
      <span class="p-row"><i class="chip c-link"></i><i class="chip c-code"></i><i class="chip c-ok"></i></span>
      <span class="p-box"><i class="send"></i></span>
    </span>
  </span>
{/snippet}

<header class="pane-bar">
  <button class="icon-btn menu" aria-label="Open menu" onclick={onmenu}>
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
      <path d="M3 5.5h14M3 10h14M3 14.5h14" />
    </svg>
  </button>
  <h1>Theme</h1>
</header>

<div class="scroll">
  <div class="page">
    <section>
      <h2>Themes</h2>
      <p class="hint">Pick a look. It is remembered by this browser, so another device can have its own.</p>
      <div class="grid" role="radiogroup" aria-label="Theme">
        <button class="card" role="radio" aria-checked={theme.preset === AUTO} onclick={() => theme.choose(AUTO)}>
          <span class="split">
            {@render picture(light)}
            {@render picture(dark)}
          </span>
          <span class="name">Aubergine, automatic</span>
          <span class="note">Light or dark, as the device is set</span>
        </button>
        {#each PRESETS as preset (preset.id)}
          <button class="card" role="radio" aria-checked={theme.preset === preset.id} onclick={() => theme.choose(preset.id)}>
            {@render picture(preset)}
            <span class="name">{preset.name}</span>
            <span class="note">{preset.dark ? 'Dark' : 'Light'}</span>
          </button>
        {/each}
      </div>
    </section>

    <section>
      <div class="title-row">
        <h2>Colours</h2>
        <button class="btn" disabled={!theme.customized} onclick={() => theme.reset()}>Back to {theme.base.name}</button>
      </div>
      <p class="hint">
        Change any colour of the chosen theme. The rest of the app, such as hover shades and soft backgrounds, is worked out
        from these. Picking another theme starts over from its colours.
      </p>
      <div class="colours">
        {#each groups as group (group)}
          <fieldset>
            <legend>{group}</legend>
            {#each COLOR_FIELDS.filter((field) => field.group === group) as field (field.key)}
              {@const value = theme.colors[field.key]}
              <label class:changed={field.key in theme.custom}>
                <input type="color" {value} aria-label={`${group}: ${field.label}`} oninput={(event) => theme.setColor(field.key, event.currentTarget.value)} />
                <span class="what">{field.label}</span>
                <input
                  type="text"
                  class="hex"
                  {value}
                  maxlength="7"
                  spellcheck="false"
                  aria-label={`${group}: ${field.label}, as a hex code`}
                  onchange={(event) => typed(field.key, event.currentTarget.value)}
                />
              </label>
            {/each}
          </fieldset>
        {/each}
      </div>
    </section>

    <section>
      <h2>Text</h2>
      <div class="text">
        <fieldset>
          <legend>Font</legend>
          <div class="choices">
            {#each FONTS as font (font.value)}
              <button class="choice" aria-pressed={theme.font === font.value} style:font-family={font.css} onclick={() => theme.setFont(font.value)}>
                {font.label}
              </button>
            {/each}
          </div>
        </fieldset>
        <fieldset>
          <legend>Size</legend>
          <div class="choices">
            {#each SIZES as size (size.value)}
              <button class="choice" aria-pressed={theme.size === size.value} onclick={() => theme.setSize(size.value)}>{size.label}</button>
            {/each}
          </div>
        </fieldset>
      </div>
      <p class="sample">
        The quick brown fox jumps over the lazy dog. A <a href="#/theme">link</a>, some <code>inline code</code>, and
        <strong>bold text</strong> look like this.
      </p>
    </section>
  </div>
</div>

<style>
  .scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 24px 20px calc(32px + env(safe-area-inset-bottom));
  }

  .page {
    display: grid;
    gap: 36px;
    max-width: 980px;
  }

  section {
    display: grid;
    gap: 10px;
  }

  h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 900;
  }

  .hint {
    margin: 0;
    max-width: 640px;
    color: var(--muted);
  }

  .title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
    gap: 14px;
    margin-top: 4px;
  }

  .card {
    display: grid;
    gap: 2px;
    padding: 8px 8px 10px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    color: inherit;
    text-align: left;
  }

  .card:hover {
    border-color: var(--border-strong);
  }

  .card[aria-checked='true'] {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent);
  }

  .name {
    margin-top: 8px;
    padding: 0 2px;
    font-weight: 700;
  }

  .note {
    padding: 0 2px;
    color: var(--muted);
    font-size: 12.5px;
  }

  /* The little picture. Its colours come from the theme it shows, set as variables on the element. */
  .picture {
    display: grid;
    grid-template-columns: 12% 26% 1fr;
    height: 104px;
    border-radius: 6px;
    background: var(--chrome);
    overflow: hidden;
  }

  .split {
    display: grid;
    grid-template-columns: 1fr 1fr;
    border-radius: 6px;
    overflow: hidden;
  }

  .split .picture {
    border-radius: 0;
    grid-template-columns: 16% 30% 1fr;
  }

  .picture i {
    display: block;
    border-radius: 2px;
  }

  .p-rail {
    display: grid;
    align-content: start;
    justify-items: center;
    gap: 5px;
    padding-top: 8px;
  }

  .p-rail i {
    width: 55%;
    aspect-ratio: 1;
    background: var(--chrome-tile);
  }

  .p-side {
    display: grid;
    align-content: start;
    gap: 5px;
    margin-top: 6px;
    padding: 9px 5px;
    border-top-left-radius: 5px;
    background: var(--side);
  }

  .p-side i {
    height: 5px;
    width: 80%;
    background: var(--chrome-muted);
    opacity: 0.7;
  }

  .p-side i.on {
    width: 100%;
    height: 9px;
    background: var(--chrome-active);
    opacity: 1;
  }

  .p-page {
    display: grid;
    align-content: start;
    gap: 5px;
    margin-top: 6px;
    padding: 9px 7px 6px;
    background: var(--bg);
  }

  .p-page .who {
    width: 34%;
    height: 6px;
    background: var(--text);
  }

  .p-page .line {
    height: 4px;
    background: var(--muted);
    opacity: 0.75;
  }

  .p-page .short {
    width: 62%;
  }

  .p-row {
    display: flex;
    gap: 4px;
  }

  .chip {
    width: 16px;
    height: 6px;
  }

  .chip.c-link {
    background: var(--link);
  }

  .chip.c-code {
    background: var(--code);
  }

  .chip.c-ok {
    background: var(--presence);
  }

  .p-box {
    display: flex;
    justify-content: flex-end;
    align-self: end;
    margin-top: 6px;
    padding: 3px;
    border: 1px solid var(--border-strong);
    border-radius: 3px;
    background: var(--surface);
  }

  .send {
    width: 12px;
    height: 7px;
    background: var(--accent);
  }

  /* Colour fields. */
  .colours {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(270px, 1fr));
    gap: 20px 28px;
    margin-top: 4px;
  }

  fieldset {
    display: grid;
    align-content: start;
    gap: 6px;
    margin: 0;
    padding: 0;
    border: 0;
    min-width: 0;
  }

  legend {
    margin-bottom: 6px;
    padding: 0;
    color: var(--muted);
    font-size: 13px;
    font-weight: 700;
  }

  label {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  input[type='color'] {
    flex: none;
    width: 34px;
    height: 28px;
    padding: 0;
    border: 1px solid var(--border-strong);
    border-radius: 6px;
    background: none;
    cursor: pointer;
  }

  input[type='color']::-webkit-color-swatch-wrapper {
    padding: 2px;
  }

  input[type='color']::-webkit-color-swatch {
    border: 0;
    border-radius: 3px;
  }

  .what {
    flex: 1;
    min-width: 0;
  }

  .changed .what::after {
    content: ' •';
    color: var(--accent);
  }

  .hex {
    width: 86px;
    height: 28px;
    padding: 0 8px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--bg);
    font: 12.5px var(--mono);
  }

  .text {
    display: flex;
    flex-wrap: wrap;
    gap: 20px 40px;
  }

  .choices {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .choice {
    min-height: 34px;
    padding: 4px 14px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface);
    color: inherit;
  }

  .choice:hover {
    border-color: var(--border-strong);
  }

  .choice[aria-pressed='true'] {
    border-color: var(--accent);
    background: var(--accent-soft);
    font-weight: 700;
  }

  .sample {
    max-width: 640px;
    margin: 6px 0 0;
    padding: 12px 14px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
  }

  .sample a {
    color: var(--link);
  }

  .sample code {
    padding: 0.1em 0.3em;
    border: 1px solid var(--border);
    border-radius: 3px;
    background: var(--sunken);
    color: var(--code);
    font: 0.8em var(--mono);
  }

  @media (max-width: 820px) {
    .scroll {
      padding-left: 14px;
      padding-right: 14px;
    }
  }
</style>
