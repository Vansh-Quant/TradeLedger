import type { Bar } from "./market-data.js";

export interface DatasetSplit {
  readonly train: readonly Bar[];
  readonly validation: readonly Bar[];
  readonly test: readonly Bar[];
}

export function splitResearchDataset(
  bars: readonly Bar[],
  trainFraction = 0.6,
  validationFraction = 0.2,
): DatasetSplit {
  if (bars.length < 3) throw new Error("at least three bars are required");
  if (!Number.isFinite(trainFraction) || trainFraction <= 0 || trainFraction >= 1) throw new Error("trainFraction must be between 0 and 1");
  if (!Number.isFinite(validationFraction) || validationFraction <= 0 || trainFraction + validationFraction >= 1) throw new Error("validationFraction must leave room for test data");
  const ordered = [...bars].sort((a,b)=>Date.parse(a.startAt)-Date.parse(b.startAt));
  const trainEnd = Math.max(1, Math.floor(ordered.length * trainFraction));
  const validationEnd = Math.max(trainEnd + 1, Math.floor(ordered.length * (trainFraction + validationFraction)));
  if (validationEnd >= ordered.length) throw new Error("dataset is too small for requested split");
  return Object.freeze({
    train: Object.freeze(ordered.slice(0, trainEnd)),
    validation: Object.freeze(ordered.slice(trainEnd, validationEnd)),
    test: Object.freeze(ordered.slice(validationEnd)),
  });
}
