import { applyI18n, q } from "../../dom";
import { t } from "../../i18n";

export interface ConfirmOptions {
  readonly titleKey: string;
  readonly bodyKey: string;
  readonly confirmKey: string;
  readonly cancelKey?: string;
}

export interface Choice {
  readonly value: string;
  /** Already translated: choices usually carry numbers interpolated in. */
  readonly label: string;
  readonly hint?: string;
}

export interface ChooseOptions extends ConfirmOptions {
  readonly choices: readonly Choice[];
  readonly initial: string;
}

/**
 * A native <dialog> opened with showModal(): the focus trap, Escape and the
 * inert page behind it come for free. The element lives only while the
 * question is open. Resolves with the button value it was closed by, or with
 * "cancel" for Escape and backdrop clicks.
 */
function openDialog(opts: ConfirmOptions, content: string): Promise<{ result: string; form: HTMLFormElement }> {
  const dialog = document.createElement("dialog");
  dialog.className =
    "rounded-lg shadow-xl p-0 w-[min(26rem,calc(100vw-2rem))] backdrop:bg-graphite-900/50 backdrop:backdrop-blur-sm";
  dialog.innerHTML = `
    <form method="dialog" class="p-5 grid gap-3">
      <h2 class="text-base font-semibold text-graphite-900" data-i18n="${opts.titleKey}"></h2>
      <p class="text-sm text-graphite-600" data-i18n="${opts.bodyKey}"></p>
      ${content}
      <div class="mt-2 flex justify-end gap-2 flex-wrap">
        <button value="cancel" class="btn" data-i18n="${opts.cancelKey ?? "actions.cancel"}"></button>
        <button value="confirm" class="btn-primary" data-i18n="${opts.confirmKey}"></button>
      </div>
    </form>
  `;
  applyI18n(dialog, t);
  document.body.append(dialog);
  const form = q<HTMLFormElement>(dialog, "form");

  return new Promise((resolve) => {
    dialog.addEventListener("close", () => {
      resolve({ result: dialog.returnValue, form });
      dialog.remove();
    });
    // A click that lands on the dialog element itself is on the backdrop.
    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) dialog.close("cancel");
    });
    dialog.showModal();
    // Focus the safe choice: Enter right after the click must not confirm.
    q<HTMLButtonElement>(dialog, 'button[value="cancel"]').focus();
  });
}

/** Asks before an action that throws work away. */
export async function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  const { result } = await openDialog(opts, "");
  return result === "confirm";
}

/** One of a few options, as radio cards. Null when dismissed. */
export async function chooseDialog(opts: ChooseOptions): Promise<string | null> {
  const cards = opts.choices
    .map(
      (c) => `
      <label class="flex items-start gap-3 rounded-md border border-graphite-200 px-3 py-2 cursor-pointer
                    hover:border-graphite-300 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
        <input type="radio" name="choice" value="${c.value}" class="mt-1 accent-brand-700"
               ${c.value === opts.initial ? "checked" : ""} />
        <span class="min-w-0">
          <span class="block text-sm font-medium text-graphite-900">${c.label}</span>
          ${c.hint ? `<span class="block text-xs text-graphite-500">${c.hint}</span>` : ""}
        </span>
      </label>`,
    )
    .join("");
  const { result, form } = await openDialog(opts, `<div class="grid gap-2">${cards}</div>`);
  if (result !== "confirm") return null;
  return new FormData(form).get("choice")?.toString() ?? null;
}
