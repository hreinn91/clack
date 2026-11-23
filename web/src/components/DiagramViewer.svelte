<script lang="ts">
  import { onMount } from 'svelte';
  import { diagramName, diagramPng, diagramSize, saveFile, standaloneSvg } from '../lib/diagrams';

  // A diagram over the whole window: it starts fitted to the window, the
  // wheel or a pinch zooms, dragging moves it, Esc or a click beside it closes.
  // On a touch screen it is a PNG, so a long press offers the system's own
  // Copy and Save, which work even where the page cannot copy pictures.
  let { svg, source, onclose }: { svg: string; source: string; onclose: () => void } = $props();

  const MIN = 0.1;
  const MAX = 8;
  const touch = matchMedia('(pointer: coarse)').matches;
  const natural = $derived(diagramSize(svg));

  let stage = $state<HTMLElement>();
  let url = $state('');
  let scale = $state(1);
  let x = $state(0);
  let y = $state(0);
  let fitted = 1;
  /** Where each pointer on the stage is, for dragging and pinching. */
  const pointers = new Map<number, { x: number; y: number }>();
  let pinch: { distance: number; scale: number } | null = null;
  /** Whether the pointer moved since it went down: a drag is not a click beside the diagram. */
  let moved = false;

  /** Shown over everything, outside the chat's own layout. */
  function portal(node: HTMLElement) {
    document.body.append(node);
    return { destroy: () => node.remove() };
  }

  onMount(() => {
    let made = '';
    const ready = touch
      ? diagramPng(svg, 3).then((blob) => (made = URL.createObjectURL(blob)))
      : Promise.resolve((made = URL.createObjectURL(new Blob([standaloneSvg(svg)], { type: 'image/svg+xml' }))));
    void ready.then((done) => {
      url = done;
      fit();
    });
    const before = document.activeElement as HTMLElement | null;
    stage?.focus();
    return () => {
      if (made) URL.revokeObjectURL(made);
      before?.focus?.({ preventScroll: true });
    };
  });

  function fit() {
    if (!stage) return;
    const room = { width: stage.clientWidth - 48, height: stage.clientHeight - 48 };
    fitted = Math.min(room.width / natural.width, room.height / natural.height, 2);
    scale = fitted;
    x = (stage.clientWidth - natural.width * scale) / 2;
    y = (stage.clientHeight - natural.height * scale) / 2;
  }

  /** Zooms to `next`, keeping the point (px, py) of the stage where it is. */
  function zoomTo(next: number, px = (stage?.clientWidth ?? 0) / 2, py = (stage?.clientHeight ?? 0) / 2) {
    const clamped = Math.min(MAX, Math.max(MIN, next));
    x = px - ((px - x) * clamped) / scale;
    y = py - ((py - y) * clamped) / scale;
    scale = clamped;
  }

  function onwheel(event: WheelEvent) {
    event.preventDefault();
    const box = stage!.getBoundingClientRect();
    // Trackpad pinches arrive as wheel events with Ctrl held, and in finer steps.
    const step = event.ctrlKey ? 0.01 : 0.0015;
    zoomTo(scale * Math.exp(-event.deltaY * step), event.clientX - box.left, event.clientY - box.top);
  }

  function onpointerdown(event: PointerEvent) {
    if (event.button !== 0) return;
    if (!pointers.size) moved = false;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { distance: Math.hypot(a!.x - b!.x, a!.y - b!.y), scale };
    }
  }

  function onpointermove(event: PointerEvent) {
    const last = pointers.get(event.pointerId);
    if (!last) return;
    const now = { x: event.clientX, y: event.clientY };
    pointers.set(event.pointerId, now);
    if (Math.abs(now.x - last.x) + Math.abs(now.y - last.y) > 0) moved = true;
    if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()];
      const box = stage!.getBoundingClientRect();
      const middle = { x: (a!.x + b!.x) / 2 - box.left, y: (a!.y + b!.y) / 2 - box.top };
      zoomTo((pinch.scale * Math.hypot(a!.x - b!.x, a!.y - b!.y)) / pinch.distance, middle.x, middle.y);
    } else if (pointers.size === 1) {
      x += now.x - last.x;
      y += now.y - last.y;
    }
  }

  function onpointerup(event: PointerEvent) {
    pointers.delete(event.pointerId);
    if (pointers.size < 2) pinch = null;
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onclose();
    } else if (event.key === '+' || event.key === '=') zoomTo(scale * 1.25);
    else if (event.key === '-') zoomTo(scale / 1.25);
    else if (event.key === '0') fit();
    else if (event.key.startsWith('Arrow')) {
      event.preventDefault();
      const step = 60;
      if (event.key === 'ArrowLeft') x += step;
      else if (event.key === 'ArrowRight') x -= step;
      else if (event.key === 'ArrowUp') y += step;
      else y -= step;
    }
  }

  async function downloadPng() {
    saveFile(await diagramPng(svg, 3), diagramName(source, 'png'));
  }

  function downloadSvg() {
    saveFile(new Blob([standaloneSvg(svg)], { type: 'image/svg+xml' }), diagramName(source, 'svg'));
  }
</script>

<svelte:window onresize={fit} />

<div class="viewer" role="dialog" aria-modal="true" aria-label="Diagram" use:portal>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <div
    class="stage"
    role="application"
    aria-label="Diagram: scroll or pinch to zoom, drag to move, Escape to close"
    tabindex="0"
    bind:this={stage}
    {onwheel}
    {onpointerdown}
    {onpointermove}
    {onpointerup}
    onpointercancel={onpointerup}
    {onkeydown}
    ondblclick={() => (Math.abs(scale - fitted) < 0.01 ? zoomTo(1) : fit())}
    onclick={(event) => {
      if (event.target === event.currentTarget && event.detail === 1 && !moved) onclose();
    }}
  >
    {#if url}
      <img
        src={url}
        alt="Diagram"
        draggable="false"
        style:width={`${natural.width * scale}px`}
        style:height={`${natural.height * scale}px`}
        style:transform={`translate(${x}px, ${y}px)`}
      />
    {:else}
      <span class="spinner"></span>
    {/if}
  </div>

  <div class="bar">
    <button title="Zoom out (−)" aria-label="Zoom out" onclick={() => zoomTo(scale / 1.25)}>−</button>
    <button class="percent" title="Fit to the window (0)" onclick={fit}>{Math.round(scale * 100)}%</button>
    <button title="Zoom in (+)" aria-label="Zoom in" onclick={() => zoomTo(scale * 1.25)}>+</button>
    <span class="sep"></span>
    <button class="text" title="Download as PNG" onclick={downloadPng}>PNG</button>
    <button class="text" title="Download as SVG" onclick={downloadSvg}>SVG</button>
    <span class="sep"></span>
    <button title="Close (Esc)" aria-label="Close" onclick={onclose}>
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">
        <path d="M4 4l8 8M12 4l-8 8" />
      </svg>
    </button>
  </div>
  {#if touch}<p class="hint">Press and hold the diagram to copy or save it.</p>{/if}
</div>

<style>
  .viewer {
    position: fixed;
    inset: 0;
    z-index: 80;
    background: color-mix(in srgb, var(--bg) 88%, #000);
  }

  .stage {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    overflow: hidden;
    cursor: grab;
    touch-action: none;
  }

  .stage:active {
    cursor: grabbing;
  }

  .stage:focus {
    outline: none;
  }

  img {
    position: absolute;
    top: 0;
    left: 0;
    max-width: none;
    border-radius: 6px;
    box-shadow: 0 8px 40px rgb(0 0 0 / 35%);
    user-select: none;
    /* A long press on a phone offers the system's own Copy and Save. */
    -webkit-touch-callout: default;
  }

  .bar {
    position: absolute;
    top: calc(12px + env(safe-area-inset-top));
    right: 12px;
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 4px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    box-shadow: var(--shadow);
  }

  .bar button {
    display: grid;
    place-items: center;
    min-width: 32px;
    height: 32px;
    padding: 0 6px;
    border: 0;
    border-radius: 6px;
    background: none;
    color: var(--text);
    font-size: 16px;
    font-weight: 700;
  }

  .bar button:hover {
    background: var(--hover);
  }

  .bar .percent,
  .bar .text {
    font-size: 12.5px;
  }

  .percent {
    min-width: 52px !important;
    font-variant-numeric: tabular-nums;
  }

  .sep {
    width: 1px;
    height: 20px;
    margin: 0 4px;
    background: var(--border);
  }

  .hint {
    position: absolute;
    bottom: calc(16px + env(safe-area-inset-bottom));
    left: 50%;
    margin: 0;
    padding: 6px 12px;
    border-radius: 999px;
    background: var(--surface);
    color: var(--muted);
    font-size: 13px;
    white-space: nowrap;
    transform: translateX(-50%);
    pointer-events: none;
  }
</style>
