import { qa } from "../../dom";
import { getLang, LANGUAGES, onLanguageChange, setLang, type Language } from "../../i18n";
import type { Unmount } from "../context";

export function mountLanguageSwitcher(container: HTMLElement): Unmount {
  container.innerHTML = `
    <div class="inline-flex rounded-md border border-graphite-300 overflow-hidden text-sm" role="group" aria-label="Language">
      ${LANGUAGES.map(
        (l) => `
        <button type="button"
          data-lang="${l}"
          class="px-2 py-1.5 transition border-l first:border-l-0 border-graphite-300 text-graphite-600
                 data-[active=true]:bg-brand-700 data-[active=true]:text-white
                 hover:bg-graphite-100 data-[active=true]:hover:bg-brand-700">
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
