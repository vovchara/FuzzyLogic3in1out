/**
 * How every number in the UI is written. Three different quantities show up
 * side by side — a membership degree, a variable's value and the defuzzified
 * result — and each wants its own precision. Deciding that per call site is
 * how the same degree ended up as 0.30 on a chart axis and 0.297 in the list
 * directly beneath it, so the choice lives here instead.
 */

export function valueStep(range: readonly [number, number]): number {
  return range[1] - range[0] <= 1 ? 0.01 : 0.1;
}

export function valueDecimals(range: readonly [number, number]): number {
  return range[1] - range[0] <= 1 ? 2 : 1;
}

/**
 * A membership degree, firing strength or activation level. Always in [0, 1],
 * where the third decimal still separates two rules, so it is always shown.
 */
export function formatDegree(degree: number): string {
  return degree.toFixed(3);
}

/**
 * A variable's value on its own domain: sliders, number fields, chart markers,
 * "held at" captions. Precision follows the width of the domain, so a `[0, 1]`
 * variable reads 0.65 and a `[0, 50]` one reads 18.0.
 */
export function formatValue(value: number, range: readonly [number, number]): string {
  return value.toFixed(valueDecimals(range));
}

/**
 * The defuzzified result, wherever it is presented as the controller's answer.
 * Held at two decimals rather than the output domain's own precision: it is
 * the one number a reader copies out, and it is not tied to any slider step.
 */
export function formatOutput(value: number): string {
  return value.toFixed(2);
}

/**
 * An axis scale label. These only mark where you are on the scale, so they are
 * written as short as they can be without losing anything: 0.2 rather than
 * 0.20, 50 rather than 50.0.
 */
export function formatTick(value: number): string {
  return String(Number(value.toFixed(4)));
}
