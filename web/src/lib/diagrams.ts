import DOMPurify from 'dompurify';
import type { Mermaid } from 'mermaid';
import { theme } from './theme.svelte';

// Mermaid diagrams in replies and notes. Mermaid is part of clack's own build,
// in a file of its own that the browser fetches from the clack server the
// first time a diagram is shown, so pages without one never load it.

let loading: Promise<Mermaid> | null = null;

function mermaid(): Promise<Mermaid> {
  loading ??= import('mermaid').then((module) => module.default);
  return loading;
}

/**
 * Text drawn as SVG text in a system font, not as HTML: the diagram stays a
 * plain picture that can become a PNG, and its text measures the same
 * wherever it is shown (a picture cannot use the page's own fonts).
 */
const FONT = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

function css(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** The theme's colours, as Mermaid's "base" theme takes them. */
function themeVariables(): Record<string, string | boolean> {
  const bg = css('--bg');
  const surface = css('--surface');
  const sunken = css('--sunken');
  const text = css('--text');
  const muted = css('--muted');
  const border = css('--border');
  const strong = css('--border-strong');
  const accent = css('--accent');
  const soft = css('--accent-soft');
  // The theme's terminal colours, for charts that need several.
  const palette = ['--syn-function', '--syn-string', '--syn-keyword', '--syn-type', '--syn-attr', '--syn-tag', '--syn-number', '--syn-meta'].map(css);
  const series: Record<string, string> = {};
  palette.forEach((color, i) => {
    series[`pie${i + 1}`] = color;
    series[`git${i}`] = color;
    series[`cScale${i}`] = color;
  });
  return {
    darkMode: theme.base.dark,
    fontFamily: FONT,
    fontSize: '14px',
    background: bg,
    primaryColor: soft,
    primaryBorderColor: accent,
    primaryTextColor: text,
    secondaryColor: sunken,
    secondaryBorderColor: strong,
    secondaryTextColor: text,
    tertiaryColor: surface,
    tertiaryBorderColor: border,
    tertiaryTextColor: text,
    mainBkg: soft,
    nodeBorder: accent,
    nodeTextColor: text,
    textColor: text,
    titleColor: text,
    lineColor: muted,
    defaultLinkColor: muted,
    edgeLabelBackground: bg,
    clusterBkg: sunken,
    clusterBorder: strong,
    noteBkgColor: surface,
    noteBorderColor: strong,
    noteTextColor: text,
    actorBkg: soft,
    actorBorder: accent,
    actorTextColor: text,
    actorLineColor: strong,
    signalColor: text,
    signalTextColor: text,
    labelBoxBkgColor: surface,
    labelBoxBorderColor: strong,
    labelTextColor: text,
    loopTextColor: text,
    activationBkgColor: sunken,
    activationBorderColor: strong,
    sequenceNumberColor: bg,
    pieStrokeColor: bg,
    pieOuterStrokeColor: strong,
    pieTitleTextColor: text,
    pieSectionTextColor: bg,
    pieLegendTextColor: text,
    ...series,
  };
}

/** What the drawing depends on in the theme: when it changes, diagrams are drawn again. */
export function diagramTheme(): string {
  return `${theme.base.id}|${JSON.stringify(theme.custom)}`;
}

let configuredFor = '';
let seq = 0;
/** One diagram at a time: Mermaid's settings and scratch space are shared. */
let queue: Promise<unknown> = Promise.resolve();

/**
 * A diagram from Mermaid code, as SVG markup ready to put on the page.
 * Throws with Mermaid's own message when the code has a mistake.
 */
export function drawDiagram(source: string): Promise<string> {
  const run = queue.then(async () => {
    const lib = await mermaid();
    const key = diagramTheme();
    if (configuredFor !== key) {
      lib.initialize({
        startOnLoad: false,
        // Replies are untrusted: no scripts, no click actions, labels cleaned.
        securityLevel: 'strict',
        theme: 'base',
        themeVariables: themeVariables(),
        fontFamily: FONT,
        htmlLabels: false,
        flowchart: { htmlLabels: false },
      });
      configuredFor = key;
    }
    const id = `clack-diagram-${++seq}`;
    try {
      const { svg } = await lib.render(id, source.trim());
      return naturalSize(DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true }, ADD_TAGS: ['style'] }));
    } finally {
      // Mermaid draws in a scratch element on the page, which a failed drawing can leave behind.
      document.getElementById(id)?.remove();
      document.getElementById(`d${id}`)?.remove();
    }
  });
  queue = run.catch(() => {});
  return run;
}

/** A Mermaid error, short enough to show. */
export function diagramError(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  return text.split('\n').filter((line) => line.trim()).slice(0, 4).join('\n') || 'Mermaid could not read it.';
}

/** The diagram's size in CSS pixels, from its viewBox. */
export function diagramSize(svg: string): { width: number; height: number } {
  const box = /viewBox="\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*"/.exec(svg);
  return { width: box ? Number(box[1]) : 600, height: box ? Number(box[2]) : 400 };
}

/**
 * Shown at the size it was drawn at, so its text matches the page's; only one
 * wider than the reply is shrunk to fit. (Mermaid stretches some to the full
 * width, which blows a small diagram up.)
 */
function naturalSize(svg: string): string {
  const { width, height } = diagramSize(svg);
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = doc.documentElement;
  if (root.nodeName !== 'svg') return svg;
  root.setAttribute('width', String(width));
  root.setAttribute('height', String(height));
  root.setAttribute('style', 'max-width: 100%; height: auto;');
  return new XMLSerializer().serializeToString(root);
}

/** The diagram as a file of its own: its size fixed, and the theme's background behind it so it reads anywhere. */
export function standaloneSvg(svg: string): string {
  const { width, height } = diagramSize(svg);
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const root = doc.documentElement;
  root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  root.setAttribute('width', String(width));
  root.setAttribute('height', String(height));
  root.removeAttribute('style');
  root.setAttribute('style', `background-color: ${css('--bg')}`);
  return new XMLSerializer().serializeToString(root);
}

/** The diagram as a PNG, `scale` times its size (capped so a huge one still fits in a canvas). */
export async function diagramPng(svg: string, scale = 2): Promise<Blob> {
  const { width, height } = diagramSize(svg);
  const factor = Math.min(scale, 8000 / Math.max(width, height, 1));
  const url = URL.createObjectURL(new Blob([standaloneSvg(svg)], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * factor));
    canvas.height = Math.max(1, Math.round(height * factor));
    const context = canvas.getContext('2d')!;
    context.fillStyle = css('--bg');
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, 'image/png'));
    if (!blob) throw new Error('The picture could not be made.');
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** A name for the diagram's files, from its type: "flowchart.png", "sequence-diagram.svg". */
export function diagramName(source: string, extension: 'png' | 'svg'): string {
  const first = source
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith('%%') && line !== '---');
  const kind = (first?.split(/\s+/)[0] ?? 'diagram')
    .replace(/-v2$|-beta$/, '')
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '');
  return `${kind || 'diagram'}.${extension}`;
}

export function saveFile(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Pictures can only be put on the clipboard on a secure page (HTTPS or localhost). */
export const canCopyImage = typeof window !== 'undefined' && window.isSecureContext && 'ClipboardItem' in window && !!navigator.clipboard?.write;
