import { qa } from "../../dom";
import type { AppShellCtx, Unmount } from "../context";

export function mountTabBar(container: HTMLElement, ctx: AppShellCtx): Unmount {
  container.innerHTML = `
    <div class="flex gap-1 overflow-x-auto -mb-px">
      ${ctx.systems
        .map(
          (s) => `
        <button type="button" data-system="${s.id}"
          class="px-2.5 py-2 text-xs sm:px-4 sm:text-sm whitespace-nowrap border-b-2 transition flex items-center gap-1 sm:gap-2 font-medium
                 data-[active=true]:border-brand-600 data-[active=true]:text-brand-700
                 border-transparent text-graphite-500 hover:text-graphite-900">
          <span data-i18n="${s.nameKey}"></span>
          ${s.draft ? `<span class="text-[9px] sm:text-[10px] font-semibold uppercase tracking-wide px-1 sm:px-1.5 py-0.5 rounded bg-amber-100 text-amber-800" data-i18n="status.draft"></span>` : ""}
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
