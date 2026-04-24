import { qa } from "../dom";
import { t } from "../i18n";
import type { AppShellCtx } from "./appShell";

export function mountTabBar(container: HTMLElement, ctx: AppShellCtx): void {
  container.innerHTML = `
    <div class="flex gap-1 overflow-x-auto border-b border-slate-200">
      ${ctx.systems
        .map(
          (s) => `
        <button type="button" data-system="${s.id}"
          class="px-4 py-2 text-sm whitespace-nowrap border-b-2 transition
                 data-[active=true]:border-slate-900 data-[active=true]:text-slate-900
                 border-transparent text-slate-500 hover:text-slate-900">
          <span data-i18n="${s.nameKey}"></span>
        </button>`,
        )
        .join("")}
    </div>
  `;

  const refresh = () => {
    const active = ctx.store.getState().activeSystemId;
    for (const btn of qa<HTMLButtonElement>(container, "[data-system]")) {
      btn.dataset.active = String(btn.dataset.system === active);
    }
  };

  for (const btn of qa<HTMLButtonElement>(container, "[data-system]")) {
    btn.addEventListener("click", () => {
      const id = btn.dataset.system!;
      if (id !== ctx.store.getState().activeSystemId) {
        const system = ctx.systems.find((s) => s.id === id);
        if (!system) return;
        const inputs: Record<string, number> = {};
        for (const v of system.inputs) inputs[v.id] = v.defaultValue;
        ctx.store.setState({ activeSystemId: id, inputs });
        ctx.recompute();
      }
    });
  }

  refresh();
  ctx.store.subscribe(refresh);
  void t;
}
