<script lang="ts">
  import type { Artifact } from '../../../shared/protocol';
  import { artifacts } from '../lib/artifacts.svelte';
  import Diagram from './Diagram.svelte';
  import Markdown from './Markdown.svelte';

  // An artifact as it looks, or its source. Pages run in a sealed frame: the
  // server sends them with a sandbox, so they have no origin of their own and
  // cannot reach Clack or the internet, and the frame is sandboxed as well.
  let { artifact, version, mode }: { artifact: Artifact; version: number | null; mode: 'preview' | 'code' } = $props();

  const url = $derived(artifacts.rawUrl(artifact, version));
  const ext = $derived(artifact.ext);
  const textual = $derived(artifact.type !== 'file' || ['csv', 'tsv', 'json', 'txt', 'md'].includes(ext));
  const previewable = $derived(['html', 'svg', 'markdown', 'mermaid'].includes(artifact.type));
  const showCode = $derived(artifact.type === 'code' || (mode === 'code' && previewable));
  const picture = $derived(artifact.type === 'file' && ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext));

  let text = $state<string | null>(null);
  let failed = $state('');
  let highlighted = $state('');

  // Text is fetched when it is to be shown as text: source, documents, diagrams, tables.
  $effect(() => {
    const wanted = url;
    const need = textual && (showCode || artifact.type === 'markdown' || artifact.type === 'mermaid' || artifact.type === 'file');
    text = null;
    failed = '';
    highlighted = '';
    if (!need) return;
    let stale = false;
    fetch(wanted)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? 'It could not be read.');
        return res.text();
      })
      .then((body) => {
        if (!stale) text = body;
      })
      .catch((err: unknown) => {
        if (!stale) failed = err instanceof Error ? err.message : String(err);
      });
    return () => (stale = true);
  });

  const LANGUAGE: Record<string, string> = { html: 'xml', svg: 'xml', markdown: 'markdown', mermaid: 'plaintext' };
  const language = $derived(artifact.type === 'code' ? (artifact.language ?? artifact.ext) : (LANGUAGE[artifact.type] ?? 'plaintext'));

  // Source in the theme's code colours.
  $effect(() => {
    const source = text;
    if (source === null || !showCode) return;
    let stale = false;
    void import('highlight.js/lib/common').then(({ default: hljs }) => {
      if (stale) return;
      const lang = hljs.getLanguage(language) ? language : undefined;
      highlighted = lang ? hljs.highlight(source, { language: lang, ignoreIllegals: true }).value : '';
    });
    return () => (stale = true);
  });

  /** A CSV or TSV file as rows, the first few hundred. */
  const rows = $derived.by(() => {
    if (text === null || !['csv', 'tsv'].includes(ext)) return null;
    const separator = ext === 'tsv' ? '\t' : ',';
    const out: string[][] = [];
    for (const line of text.split(/\r?\n/).slice(0, 400)) {
      if (!line) continue;
      const cells: string[] = [];
      let cell = '';
      let quoted = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i]!;
        if (quoted) {
          if (c === '"' && line[i + 1] === '"') {
            cell += '"';
            i++;
          } else if (c === '"') quoted = false;
          else cell += c;
        } else if (c === '"') quoted = true;
        else if (c === separator) {
          cells.push(cell);
          cell = '';
        } else cell += c;
      }
      cells.push(cell);
      out.push(cells);
    }
    return out;
  });
</script>

<div class="view" class:framed={!showCode && artifact.type === 'html'}>
  {#if failed}
    <p class="note">{failed}</p>
  {:else if showCode}
    {#if text === null}
      <p class="note"><span class="spinner"></span> Reading…</p>
    {:else}
      <!-- Highlighted by highlight.js, which escapes the source; plain text otherwise. -->
      <pre class="source syntax"><code>{#if highlighted}{@html highlighted}{:else}{text}{/if}</code></pre>
    {/if}
  {:else if artifact.type === 'html'}
    {#key url}
      <iframe title={artifact.title} src={url} sandbox="allow-scripts allow-modals allow-downloads" referrerpolicy="no-referrer"></iframe>
    {/key}
  {:else if artifact.type === 'svg' || picture}
    <div class="picture"><img src={url} alt={artifact.title} /></div>
  {:else if artifact.type === 'markdown'}
    {#if text !== null}<div class="doc"><Markdown {text} /></div>{:else}<p class="note"><span class="spinner"></span> Reading…</p>{/if}
  {:else if artifact.type === 'mermaid'}
    {#if text !== null}<div class="doc">{#key text}<Diagram source={text} />{/key}</div>{/if}
  {:else if ext === 'pdf'}
    <iframe title={artifact.title} src={url}></iframe>
  {:else if rows}
    <div class="table">
      <table>
        <tbody>
          {#each rows as row, i (i)}
            <tr class:head={i === 0}>
              {#each row as cell, j (j)}<td>{cell}</td>{/each}
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else if textual && text !== null}
    <pre class="source"><code>{text}</code></pre>
  {:else}
    <div class="file">
      <strong>{artifact.title}</strong>
      <span>A .{ext} file, which cannot be shown here.</span>
      <a class="btn" href={artifacts.rawUrl(artifact, version, true)} download>Download</a>
    </div>
  {/if}
</div>

<style>
  .view {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: auto;
    background: var(--bg);
  }

  .view.framed {
    overflow: hidden;
    /* A page draws on white unless it says otherwise, as in a browser. */
    background: #fff;
  }

  iframe {
    flex: 1;
    width: 100%;
    min-height: 0;
    border: 0;
    background: #fff;
  }

  .picture {
    display: grid;
    flex: 1;
    place-items: center;
    padding: 20px;
  }

  .picture img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }

  .doc {
    padding: 20px 24px;
    font-size: 15px;
    line-height: 1.6;
  }

  .source {
    flex: 1;
    margin: 0;
    padding: 14px 16px;
    background: var(--code-bg);
    color: var(--code-fg);
    font: 12.5px/1.55 var(--mono);
    white-space: pre;
    tab-size: 2;
  }

  .note {
    margin: 0;
    padding: 20px;
    color: var(--muted);
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .table {
    overflow: auto;
  }

  table {
    border-collapse: collapse;
    font-size: 13px;
    font-variant-numeric: tabular-nums;
  }

  td {
    padding: 5px 10px;
    border: 1px solid var(--border);
    white-space: nowrap;
  }

  tr.head td {
    background: var(--sunken);
    font-weight: 700;
  }

  .file {
    display: grid;
    gap: 8px;
    justify-items: start;
    padding: 24px;
  }

  .file span {
    color: var(--muted);
  }
</style>
