import {
  createIntelligenceEvent,
  type ImpactLevel,
  type IntelligenceEvent,
} from "./intelligence.js";

type TypedEvent<T extends IntelligenceEvent["type"]> =
  Omit<IntelligenceEvent, "type"> & { readonly type: T };

export type NewsEvent = TypedEvent<"news">;
export type CentralBankEvent = TypedEvent<"central_bank"> & {
  readonly institution: string;
};
export type EarningsEvent = TypedEvent<"earnings"> & {
  readonly fiscalPeriod: string;
};
export type FilingEvent = TypedEvent<"filing"> & {
  readonly filingType: string;
};

type BaseInput = {
  readonly id: string; readonly title: string; readonly summary: string; readonly source: string;
  readonly publishedAt: string; readonly effectiveAt?: string; readonly instruments?: readonly string[];
  readonly regions?: readonly string[]; readonly impact?: ImpactLevel; readonly tags?: readonly string[];
};

function base<T extends "news" | "central_bank" | "earnings" | "filing">(
  input: BaseInput,
  type: T,
): TypedEvent<T> {
  return createIntelligenceEvent({ ...input, type }) as TypedEvent<T>;
}

export function createNewsEvent(input: BaseInput): NewsEvent {
  return Object.freeze(base(input, "news"));
}

export function createCentralBankEvent(
  input: BaseInput & { readonly institution: string },
): CentralBankEvent {
  if (!input.institution.trim()) throw new Error("institution must not be empty");
  return Object.freeze({
    ...base(input, "central_bank"),
    institution: input.institution.trim(),
  });
}

export function createEarningsEvent(
  input: BaseInput & { readonly fiscalPeriod: string },
): EarningsEvent {
  if (!input.fiscalPeriod.trim()) throw new Error("fiscalPeriod must not be empty");
  return Object.freeze({
    ...base(input, "earnings"),
    fiscalPeriod: input.fiscalPeriod.trim(),
  });
}

export function createFilingEvent(
  input: BaseInput & { readonly filingType: string },
): FilingEvent {
  if (!input.filingType.trim()) throw new Error("filingType must not be empty");
  return Object.freeze({
    ...base(input, "filing"),
    filingType: input.filingType.trim(),
  });
}
