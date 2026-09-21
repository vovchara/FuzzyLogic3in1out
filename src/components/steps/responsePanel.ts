import { applyI18n, q } from "../../dom";
import type { FuzzySystem, FuzzyVariable } from "../../fuzzy/types";
import { t } from "../../i18n";
import { surfaceCss } from "../../styles/chart";
import type { AppShellCtx, Unmount } from "../context";
import { mountSurfacePanel } from "./surfacePanel";
import { mountTransferPanel } from "./transferPanel";

/**
 * Steps back from the single point the rest of the page inspects and shows the
 * controller's behaviour over its whole input space: one transfer curve per
 * input, and one surface per pair of inputs. Nothing to configure — with three
 * inputs every combination fits on screen. Both views re-run the very same
 * engine, so a change to the rules or the membership functions shows up here
 * without any extra wiring. Every surface is coloured against the output
 * variable's full declared range, so a shade means the same number on every
 * map and at every position of the inputs.
 */
export function mountResponsePanel(
  container: HTMLElement,
  ctx: AppShellCtx,
  system: FuzzySystem,
): Unmount {
  const pairs = inputPairs(system.inputs);

  container.innerHTML = `
    <section>
      <h4 class="card-title" data-i18n="response.transferTitle"></h4>
      <p class="text-[11px] text-graphite-400 mt-0.5" data-i18n="response.transferHint"></p>
      <div class="grid gap-4 mt-2 sm:grid-cols-2 xl:grid-cols-3">
        ${system.inputs.map((v) => `<div class="min-w-0" data-curve="${v.id}"></div>`).join("")}
      </div>
    </section>

    ${
      pairs.length === 0
        ? ""
        : `
    <section class="mt-6">
      <div class="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h4 class="card-title" data-i18n="response.surfaceTitle"></h4>
          <p class="text-[11px] text-graphite-400 mt-0.5" data-i18n="response.surfaceHint"></p>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-[10px] font-mono tabular-nums text-graphite-500">${system.output.range[0]}</span>
          <span class="w-24 h-3 rounded-sm border border-graphite-200"
                style="background:linear-gradient(to right, ${rampCss()})"></span>
          <span class="text-[10px] font-mono tabular-nums text-graphite-500">${system.output.range[1]}</span>
          <span class="metric-label" data-i18n="${system.output.nameKey}"></span>
        </div>
      </div>
      <div class="grid gap-4 mt-2 sm:grid-cols-2 xl:grid-cols-3">
        ${pairs
          .map(([a, b]) => `<div class="min-w-0" data-surface="${a.id}:${b.id}"></div>`)
          .join("")}
      </div>
    </section>`
    }
  `;

  const unmounts: Unmount[] = system.inputs.map((v) =>
    mountTransferPanel(q(container, `[data-curve="${v.id}"]`), ctx, system, v.id),
  );

  for (const [a, b] of pairs) {
    unmounts.push(
      mountSurfacePanel(q(container, `[data-surface="${a.id}:${b.id}"]`), ctx, system, a.id, b.id),
    );
  }

  applyI18n(container, t);

  return () => {
    for (const u of unmounts) u();
  };
}

/** Every unordered pair of inputs, in the order the inputs are declared. */
function inputPairs(inputs: readonly FuzzyVariable[]): [FuzzyVariable, FuzzyVariable][] {
  const out: [FuzzyVariable, FuzzyVariable][] = [];
  for (let i = 0; i < inputs.length; i++) {
    for (let j = i + 1; j < inputs.length; j++) out.push([inputs[i], inputs[j]]);
  }
  return out;
}

function rampCss(): string {
  const stops: string[] = [];
  for (let i = 0; i <= 8; i++) stops.push(`${surfaceCss(i / 8)} ${(i / 8) * 100}%`);
  return stops.join(", ");
}
