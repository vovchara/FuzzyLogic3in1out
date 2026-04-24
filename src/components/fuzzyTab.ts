import { q } from "../dom";
import { systems as allSystems } from "../fuzzy/systems";
import type { FuzzySystem } from "../fuzzy/types";
import type { AppShellCtx } from "./appShell";
import { mountGraphsPanel } from "./graphsPanel";
import { mountInputsPanel } from "./inputsPanel";
import { mountMembershipsPanel } from "./membershipsPanel";
import { mountOutputPanel } from "./outputPanel";
import { mountRulesPanel } from "./rulesPanel";

export function mountFuzzyTab(container: HTMLElement, ctx: AppShellCtx): void {
  function render(system: FuzzySystem): void {
    container.innerHTML = `
      <div class="grid gap-4 md:grid-cols-2">
        <section id="inputsPanel" class="card"></section>
        <section id="outputPanel" class="card"></section>
        <section id="membershipsPanel" class="card md:col-span-2"></section>
        <section id="graphsPanel" class="card md:col-span-2"></section>
        <section id="rulesPanel" class="card md:col-span-2"></section>
      </div>
    `;
    mountInputsPanel(q(container, "#inputsPanel"), ctx, system);
    mountOutputPanel(q(container, "#outputPanel"), ctx, system);
    mountMembershipsPanel(q(container, "#membershipsPanel"), ctx, system);
    mountGraphsPanel(q(container, "#graphsPanel"), ctx, system);
    mountRulesPanel(q(container, "#rulesPanel"), ctx, system);
  }

  let currentId = ctx.store.getState().activeSystemId;
  render(findSystem(currentId));
  ctx.store.subscribe((s) => {
    if (s.activeSystemId !== currentId) {
      currentId = s.activeSystemId;
      render(findSystem(currentId));
    }
  });
}

function findSystem(id: string): FuzzySystem {
  const s = allSystems.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown system: ${id}`);
  return s;
}
