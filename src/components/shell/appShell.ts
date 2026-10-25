import { applyI18n, q } from "../../dom";
import { onLanguageChange, t } from "../../i18n";
import type { AppShellCtx, Unmount } from "../context";
import { mountFormulasModal } from "./formulasModal";
import { mountLanguageSwitcher } from "./languageSwitcher";
import { mountTabBar } from "./tabBar";
import { mountExperimentScreen } from "../experiment/experimentScreen";
import { mountWorkbench } from "../workbench/workbench";

export function mountAppShell(container: HTMLElement, ctx: AppShellCtx): Unmount {
  container.innerHTML = `
    <div class="min-h-screen flex flex-col">
      <header class="border-b border-graphite-200 bg-white sticky top-0 z-40">
        <div class="max-w-[1400px] mx-auto px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
          <div class="flex items-center gap-3 min-w-0">
            <span class="w-1 h-8 rounded-full bg-brand-600 shrink-0" aria-hidden="true"></span>
            <div class="min-w-0">
              <p class="metric-label leading-none" data-i18n="app.name"></p>
              <h1 class="text-sm md:text-base font-semibold text-graphite-900 leading-snug truncate"
                  data-system-title></h1>
            </div>
          </div>
          <div class="flex gap-2 items-center flex-wrap">
            <button type="button" id="showFormulasBtn" class="btn"
              data-i18n="actions.showFormulas"></button>
            <div id="langSwitcher"></div>
          </div>
        </div>
        <div id="tabBar" class="max-w-[1400px] w-full mx-auto px-4"></div>
      </header>

      <main class="max-w-[1400px] w-full mx-auto px-4 py-4 max-lg:pb-24 flex-1">
        <div id="workbenchView"></div>
        <div id="experimentView" hidden></div>
      </main>
      <div id="modalRoot"></div>
    </div>
  `;

  q(container, "#showFormulasBtn").addEventListener("click", () => {
    ctx.store.setState({ formulasOpen: true });
  });

  // Everything sticky below the header — the control rail, the flow strip and
  // every step's scroll anchor — has to clear it, and its height changes with
  // the viewport as the header wraps. Publishing the measured height as a
  // custom property keeps one source of truth instead of magic offsets.
  const header = q(container, "header");
  const headerObserver = new ResizeObserver(() => {
    document.documentElement.style.setProperty("--header-h", `${header.offsetHeight}px`);
  });
  headerObserver.observe(header);

  // The app's own name says nothing useful on screen, so the heading carries
  // the active controller's purpose. The browser tab keeps the app name: it
  // identifies the window and should not shift under the user. Writing the key
  // back into data-i18n leaves the heading to applyI18n on a language switch;
  // document.title has no such hook and is refreshed explicitly.
  const headingEl = q(container, "[data-system-title]");
  let titledKey = "";
  function syncTitle(force = false): void {
    const { activeSystemId, view } = ctx.store.getState();
    const key =
      view === "experiment" ? "experiment.title" : ctx.getSystem(activeSystemId).descriptionKey;
    if (key === titledKey && !force) return;
    titledKey = key;
    headingEl.dataset.i18n = key;
    headingEl.textContent = t(key);
    document.title = t("app.name");
  }

  const workbenchView = q(container, "#workbenchView");
  const experimentView = q(container, "#experimentView");
  const formulasBtn = q(container, "#showFormulasBtn");
  function syncView(): void {
    const { view } = ctx.store.getState();
    workbenchView.hidden = view !== "workbench";
    experimentView.hidden = view !== "experiment";
    // The formulas modal documents the active controller's workbench; on the
    // experiment screen there is no single active controller to document.
    formulasBtn.hidden = view !== "workbench";
  }

  syncTitle();
  syncView();
  const titleUnsub = ctx.store.subscribe(() => {
    syncTitle();
    syncView();
  });

  const unmounts: Unmount[] = [];
  unmounts.push(mountLanguageSwitcher(q(container, "#langSwitcher")));
  unmounts.push(mountTabBar(q(container, "#tabBar"), ctx));
  unmounts.push(mountWorkbench(workbenchView, ctx));
  unmounts.push(mountExperimentScreen(experimentView, ctx));
  unmounts.push(mountFormulasModal(q(container, "#modalRoot"), ctx));

  applyI18n(container, t);
  const langUnsub = onLanguageChange(() => {
    applyI18n(container, t);
    syncTitle(true);
  });

  return () => {
    langUnsub();
    titleUnsub();
    headerObserver.disconnect();
    for (const u of unmounts) u();
  };
}
