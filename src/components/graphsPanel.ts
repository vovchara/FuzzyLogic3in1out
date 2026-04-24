import { getMostActiveTerm, membershipsFor } from "../fuzzy/engine";
import { q, qa } from "../dom";
import { t } from "../i18n";
import type { FuzzySystem, FuzzyVariable } from "../fuzzy/types";
import type { AppShellCtx, Unmount } from "./appShell";
import { drawMembershipGraph } from "./membershipGraph";

export function mountGraphsPanel(
  container: HTMLElement,
  ctx: AppShellCtx,
  system: FuzzySystem,
): Unmount {
  const allVars: FuzzyVariable[] = [...system.inputs, system.output];
  container.innerHTML = `
    <h2 class="card-title" data-i18n="panels.graphs"></h2>
    <div class="grid gap-4 mt-3 sm:grid-cols-2">
      ${allVars
        .map(
          (v) => `
        <div data-graph="${v.id}" class="relative">
          <canvas class="w-full h-[220px] rounded-md bg-white cursor-crosshair"></canvas>
          <div data-tooltip
            class="pointer-events-none fixed z-20 hidden rounded-md bg-slate-900/95 text-white text-xs p-2 shadow-lg"></div>
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
    for (const wrap of wrappers) {
      const varId = wrap.dataset.graph!;
      const variable = allVars.find((v) => v.id === varId)!;
      const canvas = q<HTMLCanvasElement>(wrap, "canvas");
      const isOutput = varId === system.output.id;
      const currentValue = isOutput
        ? (evaluation?.output ?? null)
        : (inputs[varId] ?? variable.defaultValue);
      const ms = evaluation?.memberships[varId];
      const highlightTermId = ms ? getMostActiveTerm(ms) : null;
      drawMembershipGraph({
        variable,
        canvas,
        currentValue: currentValue ?? null,
        highlightTermId: highlightTermId && highlightTermId !== "N/A" ? highlightTermId : null,
      });
    }
  }

  for (const wrap of wrappers) {
    const canvas = q<HTMLCanvasElement>(wrap, "canvas");
    const tip = q<HTMLElement>(wrap, "[data-tooltip]");
    const variable = allVars.find((v) => v.id === wrap.dataset.graph!)!;

    canvas.addEventListener("mousemove", (ev) => {
      const rect = canvas.getBoundingClientRect();
      const mx = ev.clientX - rect.left;
      const paddingLeft = 32;
      const paddingRight = 16;
      const innerW = rect.width - paddingLeft - paddingRight;
      if (mx < paddingLeft || mx > rect.width - paddingRight) {
        tip.style.display = "none";
        return;
      }
      const [xMin, xMax] = variable.range;
      const x = xMin + ((mx - paddingLeft) / innerW) * (xMax - xMin);
      const ms = membershipsFor(variable, x);
      const lines = variable.terms
        .slice()
        .sort((a, b) => (ms[b.id] ?? 0) - (ms[a.id] ?? 0))
        .map(
          (term) => `
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full" style="background:${term.color}"></span>
            <span class="font-medium">${t(term.nameKey)}</span>
            <span class="font-mono tabular-nums">${(ms[term.id] ?? 0).toFixed(3)}</span>
          </div>`,
        )
        .join("");
      tip.innerHTML = `
        <div class="font-semibold mb-1">${t(variable.nameKey)} = ${x.toFixed(1)}</div>
        ${lines}
      `;
      tip.style.display = "block";
      tip.style.left = `${ev.clientX + 14}px`;
      tip.style.top = `${ev.clientY + 14}px`;
    });
    canvas.addEventListener("mouseleave", () => (tip.style.display = "none"));
  }

  renderAll();
  const unsub = ctx.store.subscribe(scheduleRender);
  const onResize = () => scheduleRender();
  window.addEventListener("resize", onResize);

  return () => {
    if (rafId !== null) cancelAnimationFrame(rafId);
    window.removeEventListener("resize", onResize);
    unsub();
  };
}
