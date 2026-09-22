# Fuzzy Logic 3-in-1-out

A static SPA that demonstrates a Mamdani-style fuzzy inference system with 3 inputs and 1 output, built for PhD study use. Uses `@thi.ng/fuzzy` with centroid defuzzification; UI written in Vanilla TypeScript + Tailwind CSS, bundled by Vite.

**Live demo:** https://vovchara.github.io/FuzzyLogic3in1out/

[English](#english) · [Українська](#українська)

---

## English

### What it does

Three WSN controllers — clustering, aggregation and routing — each take three inputs and produce one output through a Mamdani inference with centroid defuzzification. Every controller is one data file; the UI is generated from it.

The page is laid out as a workbench: a control rail pinned to the left holds the inputs and the current result, and the inference itself runs down the main column. A flow strip across the top of that column doubles as a diagram of the pipeline and as navigation through it, each node carrying a live reading of its stage.

The four stages, in the order the inference performs them:

1. **Fuzzification** — membership functions per input, with the current value marked and every term's degree projected onto the μ axis so it can be read off directly.
2. **Rule evaluation** — the full rule base, tinted by firing strength, with the strongest rule per output term flagged `max` — those are the ones that set the clipping levels.
3. **Accumulation** — the clipped conclusions and the resulting set the strategy integrates.
4. **Defuzzification** — the crisp value placed back on the output's membership functions.

Also: a "Show formulas" modal rendering the membership functions and rules in LaTeX (via KaTeX) with a PDF download, and an "Export PDF" button that saves a one-page summary of the calculation.

Language can be switched between Ukrainian (default), English and Polish; the choice persists in `localStorage`, as do the inputs, the active controller and which sections are open.

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
  fuzzy/        engine + types + system definitions (data-driven; imports no UI)
  i18n/         i18next setup + ua/en/pl locale JSON
  components/
    context.ts    AppShellCtx, Unmount, InferenceStep — the only contract
                  components share; nothing imports a component for its types
    shell/        app frame: appShell, tabBar, languageSwitcher, formulasModal
    workbench/    per-controller workspace: workbench (owns the step list),
                  controlRail, inputsPanel, outputPanel, flowStrip
    steps/        one panel per inference stage
    chart/        plot.ts (canvas setup + data-to-pixel mapping shared by all
                  three renderers), live.ts (store + resize → one redraw per
                  frame), membershipGraph.ts
  utils/        PDF export + LaTeX helpers
  styles/       Tailwind entry + canvas colour tokens
tests/          Vitest suite (ported from legacy __tests__/)
references/     PDFs with formulas and membership-function diagrams
```

Every panel receives the same `AppShellCtx` (store, systems, input updates, engine
access) and returns an unmount function; nothing else is shared between them. Two
properties are worth keeping, and both are one `grep` away from being checked:
`fuzzy/` imports nothing from `components/`, and only `inputsPanel` ever calls
`updateInputs` — every other panel is read-only, so no chart can change the
system's state out from under the reader. A new
inference step is one entry in `stepsFor()` in `workbench.ts` plus its mount function.

### Reference material

The `references/` folder holds PDFs and diagrams of the formulas used. The PhD manuscript itself is *not* committed — `.gitignore` excludes files matching `*_thesis.*`, `*_phd.*`, and the `/private/` folder.

---

## Українська

### Що це

Три нечіткі контролери БСМ — кластеризація, агрегування та маршрутизація. Кожен приймає три входи й видає один вихід через виведення за Мамдані з центроїдною дефазифікацією. Кожен контролер — один файл даних, інтерфейс будується з нього. Використовує `@thi.ng/fuzzy`; ванільний TypeScript + Tailwind CSS, збірка через Vite. Статичний SPA без серверної частини, розгортається на GitHub Pages.

Сторінка побудована як верстак: ліворуч липка панель із входами й поточним результатом, у головній колонці — сам процес виведення. Зверху колонки — схема потоку, яка водночас є діаграмою конвеєра і навігацією по ньому; кожен вузол показує живий показник свого етапу.

### Етапи, у порядку виконання виведення

1. **Фазифікація** — функції належності кожного входу з позначеним поточним значенням; ступінь належності кожного терма спроєктовано на вісь μ, щоб його можна було зчитати напряму.
2. **Оцінка правил** — уся база правил із заливкою за силою спрацювання; найсильніше правило для кожного терму виходу позначено `max` — саме воно задає рівень обрізання.
3. **Акумуляція** — обрізані висновки та результуюча множина, яку інтегрує стратегія дефазифікації.
4. **Дефазифікація** — чітке значення, покладене назад на функції належності виходу.

### Додатково

- Модальне вікно «Показати формули» з LaTeX-рендерингом (KaTeX) та експортом у PDF.
- Кнопка «Експортувати PDF» зберігає односторінковий звіт обчислення.
- Перемикання мови: українська (типова) / English / Polski. У `localStorage` зберігаються вибір мови, значення входів, активний контролер і те, які секції розгорнуті.

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

Папка `references/` містить PDF-файли з формулами та діаграмами функцій належності. Текст дисертації **не** комітиться — `.gitignore` виключає файли з масками `*_thesis.*`, `*_phd.*` та теку `/private/`.
