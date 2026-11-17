/**
 * Where a dropdown card goes under the chip that opened it: lined up with the
 * chip's left edge, kept on screen, and as wide as the screen allows up to
 * `max`. The card is fixed in place, because the header line it hangs from
 * clips anything that overflows it.
 */
export function placeBelow(anchor: HTMLElement, max = 400): { top: number; left: number; width: number } {
  const rect = anchor.getBoundingClientRect();
  const margin = 12;
  const width = Math.min(max, window.innerWidth - margin * 2);
  const left = Math.min(Math.max(margin, rect.left), window.innerWidth - width - margin);
  return { top: rect.bottom + 6, left, width };
}
