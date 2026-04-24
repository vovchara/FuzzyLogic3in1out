import { applyI18n, q } from "../dom";
import { systems as allSystems } from "../fuzzy/systems";
import type { FuzzySystem } from "../fuzzy/types";
import { t } from "../i18n";
import type { AppShellCtx, Unmount } from "./appShell";
import { mountGraphsPanel } from "./graphsPanel";
import { mountInputsPanel } from "./inputsPanel";
import { mountMembershipsPanel } from "./membershipsPanel";
import { mountOutputPanel } from "./outputPanel";
import { mountRulesPanel } from "./rulesPanel";

export function mountFuzzyTab(container: HTMLElement, ctx: AppShellCtx): Unmount {
  let childUnmounts: Unmount[] = [];

  function render(system: FuzzySystem): void {
    for (const u of childUnmounts) u();
    childUnmounts = [];

    container.innerHTML = `
      <div class="grid gap-4 md:grid-cols-2">
        <section id="inputsPanel" class="card"></section>
        <section id="outputPanel" class="card"></section>
        <section id="membershipsPanel" class="card md:col-span-2"></section>
        <section id="graphsPanel" class="card md:col-span-2"></section>
        <section id="rulesPanel" class="card md:col-span-2"></section>
      </div>
    `;
    childUnmounts.push(mountInputsPanel(q(container, "#inputsPanel"), ctx, system));
    childUnmounts.push(mountOutputPanel(q(container, "#outputPanel"), ctx, system));
    childUnmounts.push(mountMembershipsPanel(q(container, "#membershipsPanel"), ctx, system));
    childUnmounts.push(mountGraphsPanel(q(container, "#graphsPanel"), ctx, system));
    childUnmounts.push(mountRulesPanel(q(container, "#rulesPanel"), ctx, system));

    applyI18n(container, t);
  }

  let currentId = ctx.store.getState().activeSystemId;
  render(findSystem(currentId));

  const unsub = ctx.store.subscribe((s) => {
    if (s.activeSystemId !== currentId) {
      currentId = s.activeSystemId;
      render(findSystem(currentId));
    }
  });

  return () => {
    unsub();
    for (const u of childUnmounts) u();
    childUnmounts = [];
  };
}

function findSystem(id: string): FuzzySystem {
  const s = allSystems.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown system: ${id}`);
  return s;
}
