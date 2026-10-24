/** Legend entries shared by the simulation and experiment screens. */

export function legendChip(color: string, key: string, square = false): string {
  return `
    <span class="inline-flex items-center gap-1.5 text-xs text-graphite-600">
      <span class="w-2.5 h-2.5 shrink-0 ${square ? "rotate-45" : "rounded-full"}"
            style="background:${color}"></span>
      <span data-i18n="${key}"></span>
    </span>`;
}

/** A legend entry whose swatch is a line sample (route arrow, data-flow dash). */
export function legendLine(sample: string, key: string): string {
  return `
    <span class="inline-flex items-center gap-1.5 text-xs text-graphite-600">
      <svg viewBox="0 0 24 8" class="w-6 h-2.5 shrink-0" aria-hidden="true">${sample}</svg>
      <span data-i18n="${key}"></span>
    </span>`;
}

