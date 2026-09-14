import { getMostActiveTerm } from "../fuzzy/engine";
import { q, qa } from "../dom";
import type { FuzzySystem, FuzzyVariable } from "../fuzzy/types";
import type { AppShellCtx, Unmount } from "./appShell";
import { drawMembershipGraph } from "./membershipGraph";

export function mountGraphsPanel(
  container: HTMLElement,
  ctx: AppShellCtx,
  system: FuzzySystem,
): Unmount {
  const allVars: FuzzyVariable[] = [...system.inputs, system.output];
  // Which reading the output list shows depends on the inference path, so both
  // captions are rendered and one is revealed once an evaluation exists.
  const outputCaption = `
    <p class="mt-2 text-[11px] text-slate-400 leading-tight">
      <span data-caption="activations" hidden data-i18n="memberships.activationLevels"></span>
      <span data-caption="backFuzzified" hidden data-i18n="memberships.backFuzzified"></span>
    </p>`;
  container.innerHTML = `
    <div class="grid gap-4 sm:grid-cols-2">
      ${allVars
        .map(
          (v) => `
        <div data-graph="${v.id}">
          <canvas class="w-full h-[220px] rounded-md bg-white"></canvas>
          ${v.id === system.output.id ? outputCaption : ""}
          <ul class="mt-2 flex flex-col gap-1">
            ${v.terms
              .map(
                (term) => `
              <li data-term="${term.id}"
                  class="flex items-center justify-between gap-2 px-2 py-1 rounded transition
                         data-[active=true]:ring-1 data-[active=true]:ring-slate-300 data-[active=true]:bg-slate-50">
                <span class="flex items-center gap-2 text-sm">
                  <span class="w-2.5 h-2.5 rounded-full" style="background:${term.color}"></span>
                  <span data-i18n="${term.nameKey}"></span>
                </span>
                <span class="font-mono tabular-nums text-xs text-slate-700" data-value>0.000</span>
              </li>`,
              )
              .join("")}
          </ul>
        </div>`,
        )
        .join("")}
    </div>
  `;

  const wrappers = qa(container, "[data-graph]");

  let rafId: number | null = null;
  function scheduleRender(): void {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      renderAll();
    });
  }

  function renderAll(): void {
    const { evaluation, inputs } = ctx.store.getState();

    if (evaluation) {
      const activations = evaluation.outputTermActivations !== undefined;
      for (const el of qa(container, "[data-caption]")) {
        el.hidden = (el.dataset.caption === "activations") !== activations;
      }
    }

    for (const wrap of wrappers) {
      const varId = wrap.dataset.graph!;
      const variable = allVars.find((v) => v.id === varId)!;
      const canvas = q<HTMLCanvasElement>(wrap, "canvas");
      const isOutput = varId === system.output.id;
      const currentValue = isOutput
        ? (evaluation?.fired ? evaluation.output : null)
        : (inputs[varId] ?? variable.defaultValue);
      const ms = evaluation?.memberships[varId];
      const strongest = ms ? strongestTerm(ms) : null;

      drawMembershipGraph({
        variable,
        canvas,
        currentValue: currentValue ?? null,
        highlightTermId: strongest,
      });

      if (!ms) continue;
      for (const termEl of qa(wrap, "[data-term]")) {
        const termId = termEl.dataset.term!;
        termEl.querySelector<HTMLElement>("[data-value]")!.textContent = (ms[termId] ?? 0).toFixed(3);
        termEl.dataset.active = String(termId === strongest);
      }
    }
  }

  renderAll();
  const unsub = ctx.store.subscribe(scheduleRender);
  // Watching the canvases rather than the window also catches the moment a
  // collapsed step is opened: until then the canvas has no size to draw on.
  const observer = new ResizeObserver(scheduleRender);
  for (const wrap of wrappers) observer.observe(q(wrap, "canvas"));

  return () => {
    if (rafId !== null) cancelAnimationFrame(rafId);
    observer.disconnect();
    unsub();
  };
}

// A term only counts as the active one when it actually carries weight, so a
// variable outside every term stays unhighlighted instead of picking the first.
function strongestTerm(memberships: Readonly<Record<string, number>>): string | null {
  const id = getMostActiveTerm(memberships);
  if (id === "N/A") return null;
  return (memberships[id] ?? 0) > 0.1 ? id : null;
}
