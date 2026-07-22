export function valueStep(range: readonly [number, number]): number {
  return range[1] - range[0] <= 1 ? 0.01 : 0.1;
}

export function valueDecimals(range: readonly [number, number]): number {
  return range[1] - range[0] <= 1 ? 2 : 1;
}
