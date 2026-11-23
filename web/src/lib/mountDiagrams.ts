import { mount, unmount } from 'svelte';
import Diagram from '../components/Diagram.svelte';

/**
 * Turns each ```mermaid block rendered inside `root` into a drawn diagram.
 * The block's <pre> stays where it is (the page's own markup still owns it)
 * and the diagram goes inside it. Returns what takes them down again.
 */
export function mountDiagrams(root: HTMLElement, streaming = false): () => void {
  const mounted: ReturnType<typeof mount>[] = [];
  for (const code of root.querySelectorAll<HTMLElement>('pre > code.language-mermaid')) {
    const pre = code.parentElement!;
    const source = code.textContent ?? '';
    pre.classList.add('diagram-host');
    pre.replaceChildren();
    mounted.push(mount(Diagram, { target: pre, props: { source, streaming } }));
  }
  return () => {
    for (const diagram of mounted) void unmount(diagram);
  };
}
