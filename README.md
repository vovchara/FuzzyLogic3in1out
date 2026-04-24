# Fuzzy Logic 3-in-1-out

A static SPA that demonstrates a Mamdani-style fuzzy inference system with 3 inputs and 1 output, built for PhD study use. Uses `@thi.ng/fuzzy` with centroid defuzzification; UI written in Vanilla TypeScript + Tailwind CSS, bundled by Vite.

**Live demo:** _(GitHub Pages link appears after first deploy)_

[English](#english) · [Українська](#українська)

---

## English

### What it does

Given three inputs — Residual Energy (E), Transmission Coefficient (T), Delay Coefficient (D), all in `[0, 100]` — the system computes a Probability `P ∈ [0, 100]` using 27 fuzzy rules and centroid defuzzification. The UI shows:

- inputs as sliders and numeric fields,
- membership graphs for each variable with hover tooltips,
- the degree of membership of each term for the current inputs and output,
- the crisp result and the most-active output term,
- the rule base (highlighted rules whose firing strength > 0.5),
- a "Show formulas" modal rendering the membership functions and rules in LaTeX (via KaTeX), with a PDF download,
- an "Export PDF" button that saves a one-page summary of the calculation.

Language can be switched between Ukrainian (default) and English; the choice persists in `localStorage`.

### Extending with another fuzzy system

Each system is a single data file in `src/fuzzy/systems/`. Add a file that exports a `FuzzySystem` (see `src/fuzzy/types.ts`) and register it in `src/fuzzy/systems/index.ts`. The UI auto-renders a new tab.

### Commands

```bash
npm install
npm run dev          # local dev server
npm run build        # production build to dist/
npm run preview      # preview dist/ locally
npm run test         # run Vitest suite
npm run test:watch   # watch-mode tests
npm run typecheck    # tsc --noEmit
```

### Deployment

`.github/workflows/deploy.yml` builds on push to `main` and publishes `dist/` to GitHub Pages.

### Project layout

```
src/
  fuzzy/        engine + types + system definitions (data-driven)
  i18n/         i18next setup + uk/en locale JSON
  components/   mount-fn style components (no framework)
  utils/        PDF export + LaTeX helpers
  styles/       Tailwind entry
tests/          Vitest suite (ported from legacy __tests__/)
references/     PDFs with formulas and membership-function diagrams
```

### Reference material

The `references/` folder holds PDFs and diagrams of the formulas used. The PhD manuscript itself is *not* committed — `.gitignore` excludes files matching `*_thesis.*`, `*_phd.*`, and the `/private/` folder.

---

## Українська

### Що це

Нечіткий логічний контролер (3 входи → 1 вихід) для обчислення вірогідності системи зв'язку на основі залишкової енергії (E), коефіцієнта передавання (T) та коефіцієнта затримки (D). Використовує `@thi.ng/fuzzy` з центроїдною дефазифікацією. Інтерфейс — ванільний TypeScript + Tailwind CSS, збірка через Vite. Весь застосунок — статичний SPA без серверної частини, розгортається на GitHub Pages.

### Можливості

- Повзунки та числові поля для введення значень у діапазоні `[0, 100]`.
- Графіки функцій приналежності з інтерактивними підказками.
- Перегляд ступенів приналежності для кожного терма кожної змінної.
- База з 27 правил (правила з силою спрацьовування > 0.5 підсвічуються).
- Модальне вікно «Показати формули» з LaTeX-рендерингом (KaTeX) та експортом у PDF.
- Кнопка «Експортувати PDF» зберігає односторінковий звіт обчислення.
- Перемикання мови: українська (типова) / English — вибір зберігається у `localStorage`.

### Як додати ще одну нечітку систему

Кожна система — окремий файл у `src/fuzzy/systems/`, що експортує об'єкт типу `FuzzySystem` (див. `src/fuzzy/types.ts`). Додайте файл і зареєструйте в `src/fuzzy/systems/index.ts` — інтерфейс автоматично створить нову вкладку.

### Команди

```bash
npm install
npm run dev          # локальний dev-сервер
npm run build        # продакшн-збірка в dist/
npm run preview      # локальний перегляд dist/
npm run test         # прогін тестів Vitest
npm run typecheck    # перевірка типів TypeScript
```

### Довідкові матеріали

Папка `references/` містить PDF-файли з формулами та діаграмами функцій приналежності. Текст дисертації **не** комітиться — `.gitignore` виключає файли з масками `*_thesis.*`, `*_phd.*` та теку `/private/`.
