# Fuzzy Logic 3-in-1-out

A static SPA that demonstrates a Mamdani-style fuzzy inference system with 3 inputs and 1 output, built for PhD study use. Uses `@thi.ng/fuzzy` with centroid defuzzification; UI written in Vanilla TypeScript + Tailwind CSS, bundled by Vite.

**Live demo:** https://vovchara.github.io/FuzzyLogic3in1out/

[English](#english) · [Українська](#українська)

---

## English

### What it does

Three WSN controllers — clustering, aggregation and routing — each take three inputs and produce one output through a Mamdani inference with centroid defuzzification. Every controller is one data file; the UI is generated from it.

The page is laid out as a workbench: a control rail pinned to the left holds the inputs and the current result, and the inference itself runs down the main column. A flow strip across the top of that column doubles as a diagram of the pipeline and as navigation through it, each node carrying a live reading of its stage.

The stages, in the order the inference performs them:

1. **Fuzzification** — membership functions per input, with the current value marked and every term's degree projected onto the μ axis so it can be read off directly.
2. **Rule evaluation** — the full rule base, tinted by firing strength, with the strongest rule per output term flagged `max` — those are the ones that set the clipping levels.
3. **Accumulation** — the clipped conclusions merged into the resulting set.
4. **Defuzzification** — the same set with the crisp value the strategy integrated out of it (its centre of gravity) marked on the axis.
5. **Result interpretation** — the crisp value placed back on the output's membership functions.

The aggregation controller has singleton outputs and no resulting set, so it skips accumulation and interpretation: its defuzzification step shows the rule activations and the weighted sum computed from them.

Also: a "Show formulas" modal rendering the membership functions and rules in LaTeX (via KaTeX) with a PDF download, and an "Export PDF" button that saves a one-page summary of the calculation.

Language can be switched between Ukrainian (default), English and Polish; the choice persists in `localStorage`, as do the inputs, the active controller and which sections are open.

### Genetic optimisation (routing)

The routing controller can be tuned by a genetic algorithm on a dataset, following section 4.3.3 of the dissertation. A card under the result takes an `.xlsx` or `.csv` whose first row names the columns `RE`, `Dist`, `LQ`, `RS`; **Get test dataset** offers a synthetic one of 40, 120 or 500 rows (about 5 s, 30 s or 2 min of training). The GA runs in a Web Worker: a hybrid chromosome (incrementally coded gaussian centres and widths + one gene per rule consequent, 0 switching a rule off), tournament selection, arithmetic / two-point crossover, gaussian mutation with a narrowing spread, elitism, and MATLAB's `ga` stall test for stopping: the run ends once the average relative change of the best objective over the last 50 generations drops to 1e-5 (MATLAB's default is 1e-6, too slow for a browser), with a cap of 300 generations. The objective is RMSE normalised by the output domain plus a small penalty per active rule; 20% of the rows are held out as a test set. The optimised controller replaces the expert one on every chart, survives a reload, and **Restore expert parameters** brings the original back. **Export report (.xlsx)** exports the summary, every parameter before/after, the rule base before/after and the per-generation objective.

The template dataset is made up: it is produced by the expert controller with a few centres moved, so training visibly pulls them back. It is a placeholder until the real dataset arrives.

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
  training/     genetic optimisation, separate from the controller: takes a
                FuzzySystem + dataset, returns an optimised FuzzySystem and a
                report (genetic, dataset, train, record, report, worker, client);
                config.ts switches the optimisation card on per controller
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

---

## Українська

### Що це

Три нечіткі контролери БСМ — кластеризація, агрегування та маршрутизація. Кожен приймає три входи й видає один вихід через виведення за Мамдані з центроїдною дефазифікацією. Кожен контролер — один файл даних, інтерфейс будується з нього. Використовує `@thi.ng/fuzzy`; ванільний TypeScript + Tailwind CSS, збірка через Vite. Статичний SPA без серверної частини, розгортається на GitHub Pages.

Сторінка побудована як верстак: ліворуч липка панель із входами й поточним результатом, у головній колонці — сам процес виведення. Зверху колонки — схема потоку, яка водночас є діаграмою конвеєра і навігацією по ньому; кожен вузол показує живий показник свого етапу.

### Етапи, у порядку виконання виведення

1. **Фазифікація** — функції належності кожного входу з позначеним поточним значенням; ступінь належності кожного терма спроєктовано на вісь μ, щоб його можна було зчитати напряму.
2. **Оцінка правил** — уся база правил із заливкою за силою спрацювання; найсильніше правило для кожного терму виходу позначено `max` — саме воно задає рівень обрізання.
3. **Акумуляція** — обрізані висновки, об’єднані в результуючу множину.
4. **Дефазифікація** — та сама множина з позначеним чітким значенням, яке з неї обчислила стратегія (центр ваги).
5. **Інтерпретація результату** — чітке значення, покладене назад на функції належності виходу.

Контролер агрегування має синглтонні виходи й не будує результуючої множини, тому акумуляції та інтерпретації в нього немає: крок дефазифікації показує рівні активації правил і зважену суму, обчислену з них.

### Додатково

- Модальне вікно «Показати формули» з LaTeX-рендерингом (KaTeX) та експортом у PDF.
- Кнопка «Експортувати PDF» зберігає односторінковий звіт обчислення.
- Перемикання мови: українська (типова) / English / Polski. У `localStorage` зберігаються вибір мови, значення входів, активний контролер і те, які секції розгорнуті.

### Генетична оптимізація (маршрутизація)

Контролер маршрутизації можна налаштувати генетичним алгоритмом за датасетом, як у підрозділі 4.3.3 дисертації. Картка під результатом приймає `.xlsx` або `.csv`, у першому рядку якого стовпці `RE`, `Dist`, `LQ`, `RS`; кнопка **Отримати тестовий датасет** пропонує синтетичний датасет на 40, 120 або 500 рядків (навчання приблизно 5 с, 30 с або 2 хв). ГА працює у Web Worker: гібридна хромосома (інкрементно закодовані центри й ширини гаусових ФН + ген на консеквент кожного правила, 0 вимикає правило), турнірна селекція, арифметичне / двоточкове схрещування, гаусівська мутація зі звуженням, елітизм і зупинка за критерієм `ga` з MATLAB: навчання завершується, коли середня відносна зміна найкращого значення цільової функції за останні 50 поколінь падає до 1e-5 (у MATLAB за замовчуванням 1e-6 — для браузера задовго), не більше 300 поколінь. Цільова функція — RMSE, нормований на діапазон виходу, плюс невеликий штраф за кожне активне правило; 20% рядків відкладаються як тестова вибірка. Оптимізований контролер замінює експертний на всіх графіках, зберігається після перезавантаження, а **Повернути експертні параметри** відновлює початковий. **Експортувати звіт (.xlsx)** експортує підсумок, усі параметри до/після, базу правил до/після і значення цільової функції по поколіннях.

Шаблонний датасет вигаданий: його згенеровано експертним контролером із кількома зсунутими центрами, тож після навчання видно, як параметри до них підтягуються. Це заглушка до появи справжнього датасету.

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
