import { qa } from "../dom";
import type { AppShellCtx, Unmount } from "./appShell";

export function mountTabBar(container: HTMLElement, ctx: AppShellCtx): Unmount {
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
      if (id !== ctx.store.getState().activeSystemId) ctx.switchSystem(id);
    });
  }

  refresh();
  const unsub = ctx.store.subscribe(refresh);
  return unsub;
}
