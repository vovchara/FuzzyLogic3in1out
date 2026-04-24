import { q, qa } from "../dom";
import { t } from "../i18n";
import type { FuzzySystem } from "../fuzzy/types";
import type { AppShellCtx } from "./appShell";

export function mountInputsPanel(
  container: HTMLElement,
  ctx: AppShellCtx,
  system: FuzzySystem,
): void {
  container.innerHTML = `
    <h2 class="card-title" data-i18n="panels.inputs"></h2>
    <div class="grid gap-4 mt-3">
      ${system.inputs
        .map(
          (v) => `
        <label class="block" data-input="${v.id}">
          <div class="flex items-baseline justify-between text-sm">
            <span class="font-medium text-slate-700" data-i18n="${v.nameKey}"></span>
            <span class="font-mono tabular-nums text-slate-900" data-display></span>
          </div>
          <div class="flex items-center gap-3 mt-1">
            <input type="range"
              min="${v.range[0]}" max="${v.range[1]}" step="0.1"
              data-slider
              class="flex-1 accent-slate-700" />
            <input type="number"
              min="${v.range[0]}" max="${v.range[1]}" step="0.1"
              data-number
              class="w-20 px-2 py-1 text-sm border border-slate-300 rounded-md tabular-nums" />
          </div>
          <div class="flex justify-between text-[10px] text-slate-400 mt-1 font-mono">
            <span>${v.range[0]}</span><span>${v.range[1]}</span>
          </div>
        </label>`,
        )
        .join("")}
    </div>
  `;

  const rows = qa(container, "[data-input]");

  function sync(): void {
    const inputs = ctx.store.getState().inputs;
    for (const row of rows) {
      const id = row.dataset.input!;
      const value = inputs[id] ?? 0;
      const slider = q<HTMLInputElement>(row, "[data-slider]");
      const num = q<HTMLInputElement>(row, "[data-number]");
      const display = q(row, "[data-display]");
      const valStr = value.toFixed(1);
      if (document.activeElement !== slider) slider.value = String(value);
      if (document.activeElement !== num) num.value = valStr;
      display.textContent = valStr;
    }
  }

  function setValue(id: string, raw: string): void {
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed)) return;
    const variable = system.inputs.find((v) => v.id === id)!;
    const clamped = Math.max(variable.range[0], Math.min(variable.range[1], parsed));
    ctx.store.setState((s) => ({ inputs: { ...s.inputs, [id]: clamped } }));
    ctx.recompute();
  }

  for (const row of rows) {
    const id = row.dataset.input!;
    const slider = q<HTMLInputElement>(row, "[data-slider]");
    const num = q<HTMLInputElement>(row, "[data-number]");
    slider.addEventListener("input", () => setValue(id, slider.value));
    num.addEventListener("input", () => setValue(id, num.value));
  }

  sync();
  ctx.store.subscribe(sync);
  void t;
}
