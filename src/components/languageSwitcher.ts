import { qa } from "../dom";
import { getLang, LANGUAGES, onLanguageChange, setLang, type Language } from "../i18n";
import type { Unmount } from "./appShell";

export function mountLanguageSwitcher(container: HTMLElement): Unmount {
  container.innerHTML = `
    <div class="inline-flex rounded-md border border-slate-300 overflow-hidden text-sm" role="group" aria-label="Language">
      ${LANGUAGES.map(
        (l) => `
        <button type="button"
          data-lang="${l}"
          class="px-2.5 py-1.5 transition border-l first:border-l-0 border-slate-300
                 data-[active=true]:bg-slate-900 data-[active=true]:text-white
                 hover:bg-slate-100 data-[active=true]:hover:bg-slate-900">
          ${l.toUpperCase()}
        </button>`,
      ).join("")}
    </div>
  `;

  const refresh = () => {
    const current = getLang();
    for (const btn of qa<HTMLButtonElement>(container, "[data-lang]")) {
      btn.dataset.active = String(btn.dataset.lang === current);
    }
  };

  for (const btn of qa<HTMLButtonElement>(container, "[data-lang]")) {
    btn.addEventListener("click", () => {
      const lang = btn.dataset.lang as Language;
      if (lang !== getLang()) void setLang(lang);
    });
  }

  refresh();
  return onLanguageChange(refresh);
}
