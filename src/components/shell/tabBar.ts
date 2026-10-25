import { qa } from "../../dom";
import type { AppView } from "../../state";
import type { AppShellCtx, Unmount } from "../context";

const TAB_CLASS = `px-2.5 py-2 text-xs sm:px-4 sm:text-sm whitespace-nowrap border-b-2 transition flex items-center gap-1 sm:gap-2 font-medium
                 data-[active=true]:border-brand-600 data-[active=true]:text-brand-700
                 border-transparent text-graphite-500 hover:text-graphite-900`;

export function mountTabBar(container: HTMLElement, ctx: AppShellCtx): Unmount {
  container.innerHTML = `
    <div class="flex gap-1 overflow-x-auto -mb-px">
      ${ctx.systems
        .map(
          (s) => `
        <button type="button" data-system="${s.id}" class="${TAB_CLASS}">
          <span data-i18n="${s.nameKey}"></span>
          ${s.draft ? `<span class="text-[9px] sm:text-[10px] font-semibold uppercase tracking-wide px-1 sm:px-1.5 py-0.5 rounded bg-amber-100 text-amber-800" data-i18n="status.draft"></span>` : ""}
        </button>`,
        )
        .join("")}
      <span class="w-px self-center h-5 bg-graphite-200 mx-1 shrink-0" aria-hidden="true"></span>
      <button type="button" data-view-tab="simulation" class="${TAB_CLASS}">
        <span data-i18n="simulation.tab"></span>
      </button>
      <button type="button" data-view-tab="experiment" class="${TAB_CLASS}">
        <span data-i18n="experiment.tab"></span>
      </button>
    </div>
  `;

  const systemTabs = qa<HTMLButtonElement>(container, "[data-system]");
  const viewTabs = qa<HTMLButtonElement>(container, "[data-view-tab]");

  const refresh = () => {
    const { activeSystemId, view } = ctx.store.getState();
    for (const btn of systemTabs) {
      btn.dataset.active = String(view === "workbench" && btn.dataset.system === activeSystemId);
    }
    for (const btn of viewTabs) btn.dataset.active = String(view === btn.dataset.viewTab);
  };

  for (const btn of systemTabs) {
    btn.addEventListener("click", () => {
      const { activeSystemId, view } = ctx.store.getState();
      const id = btn.dataset.system!;
      if (view !== "workbench") ctx.setView("workbench");
      if (id !== activeSystemId) ctx.switchSystem(id);
    });
  }

  for (const btn of viewTabs) {
    btn.addEventListener("click", () => {
      const view = btn.dataset.viewTab as AppView;
      if (ctx.store.getState().view !== view) ctx.setView(view);
    });
  }

  refresh();
  const unsub = ctx.store.subscribe(refresh);
  return unsub;
}
