import { applyI18n, q } from "../dom";
import { onLanguageChange, t } from "../i18n";
import type { FuzzySystem } from "../fuzzy/types";
import type { Store } from "../state";
import { mountFormulasModal } from "./formulasModal";
import { mountFuzzyTab } from "./fuzzyTab";
import { mountLanguageSwitcher } from "./languageSwitcher";
import { mountTabBar } from "./tabBar";

export interface AppShellCtx {
  store: Store;
  systems: readonly FuzzySystem[];
  updateInputs(patch: Readonly<Record<string, number>>): void;
  switchSystem(id: string): void;
}

export type Unmount = () => void;

export function mountAppShell(container: HTMLElement, ctx: AppShellCtx): Unmount {
  container.innerHTML = `
    <div class="min-h-screen flex flex-col">
      <header class="px-4 py-3 border-b bg-white shadow-sm sticky top-0 z-10">
        <div class="max-w-6xl mx-auto flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 class="text-base md:text-lg font-semibold text-slate-900 leading-snug"
                data-system-title></h1>
          </div>
          <div class="flex gap-2 items-center flex-wrap">
            <button type="button" id="showFormulasBtn"
              class="px-3 py-1.5 text-sm rounded-md border border-slate-300 bg-white hover:bg-slate-50 transition"
              data-i18n="actions.showFormulas"></button>
            <div id="langSwitcher"></div>
          </div>
        </div>
      </header>

      <nav id="tabBar" class="max-w-6xl w-full mx-auto mt-3 px-4"></nav>
      <main id="activeTab" class="max-w-6xl w-full mx-auto px-4 py-4 flex-1"></main>
      <div id="modalRoot"></div>
    </div>
  `;

  q(container, "#showFormulasBtn").addEventListener("click", () => {
    ctx.store.setState({ formulasOpen: true });
  });

  // The app's own name says nothing useful on screen, so the heading carries
  // the active controller's purpose. The browser tab keeps the app name: it
  // identifies the window and should not shift under the user. Writing the key
  // back into data-i18n leaves the heading to applyI18n on a language switch;
  // document.title has no such hook and is refreshed explicitly.
  const headingEl = q(container, "[data-system-title]");
  let titledSystemId = "";
  function syncTitle(force = false): void {
    const { activeSystemId } = ctx.store.getState();
    if (activeSystemId === titledSystemId && !force) return;
    const system = ctx.systems.find((s) => s.id === activeSystemId);
    if (!system) return;
    titledSystemId = activeSystemId;
    headingEl.dataset.i18n = system.descriptionKey;
    headingEl.textContent = t(system.descriptionKey);
    document.title = t("app.name");
  }
  syncTitle();
  const titleUnsub = ctx.store.subscribe(() => syncTitle());

  const unmounts: Unmount[] = [];
  unmounts.push(mountLanguageSwitcher(q(container, "#langSwitcher")));
  unmounts.push(mountTabBar(q(container, "#tabBar"), ctx));
  unmounts.push(mountFuzzyTab(q(container, "#activeTab"), ctx));
  unmounts.push(mountFormulasModal(q(container, "#modalRoot"), ctx));

  applyI18n(container, t);
  const langUnsub = onLanguageChange(() => {
    applyI18n(container, t);
    syncTitle(true);
  });

  return () => {
    langUnsub();
    titleUnsub();
    for (const u of unmounts) u();
  };
}
