export function generateParameterGrid(
  dimensions: Readonly<Record<string, readonly number[]>>,
): readonly Readonly<Record<string, number>>[] {
  const entries = Object.entries(dimensions);
  if (entries.some(([key, values]) => !key.trim() || values.length === 0)) {
    throw new Error("parameter dimensions must have non-empty names and values");
  }
  let grid: Readonly<Record<string, number>>[] = [{}];
  for (const [key, values] of entries) {
    const next: Readonly<Record<string, number>>[] = [];
    for (const base of grid) {
      for (const value of values) {
        if (!Number.isFinite(value)) throw new Error("parameter values must be finite");
        next.push(Object.freeze({ ...base, [key]: value }));
      }
    }
    grid = next;
  }
  return Object.freeze(grid);
}
