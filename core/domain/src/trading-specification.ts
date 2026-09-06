/**
 * Mechanical trading rules for an instrument.
 *
 * This model describes what an order must satisfy for the instrument itself.
 * Strategy intent, account risk, and execution policy belong to other domains.
 */

export interface PriceRules {
  readonly tickSize: number;
  readonly pricePrecision: number;
}

export interface QuantityRules {
  readonly minQuantity: number;
  readonly maxQuantity: number;
  readonly quantityStep: number;
  readonly quantityPrecision: number;
}

export interface ContractRules {
  readonly contractSize: number;
}

export interface TradingSpecificationInput {
  readonly price: PriceRules;
  readonly quantity: QuantityRules;
  readonly contract: ContractRules;
}

export interface TradingSpecification extends TradingSpecificationInput {}

function requirePositive(value: number, field: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${field} must be a finite positive number`);
  }

  return value;
}

function requireNonNegativeInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }

  return value;
}

function validateQuantityRules(rules: QuantityRules): QuantityRules {
  const minQuantity = requirePositive(rules.minQuantity, "minQuantity");
  const maxQuantity = requirePositive(rules.maxQuantity, "maxQuantity");
  const quantityStep = requirePositive(rules.quantityStep, "quantityStep");

  if (maxQuantity < minQuantity) {
    throw new Error("maxQuantity must be greater than or equal to minQuantity");
  }

  return {
    minQuantity,
    maxQuantity,
    quantityStep,
    quantityPrecision: requireNonNegativeInteger(
      rules.quantityPrecision,
      "quantityPrecision",
    ),
  };
}

function validatePriceRules(rules: PriceRules): PriceRules {
  return {
    tickSize: requirePositive(rules.tickSize, "tickSize"),
    pricePrecision: requireNonNegativeInteger(
      rules.pricePrecision,
      "pricePrecision",
    ),
  };
}

function validateContractRules(rules: ContractRules): ContractRules {
  return {
    contractSize: requirePositive(rules.contractSize, "contractSize"),
  };
}

/**
 * Creates a validated, immutable trading specification.
 *
 * The factory establishes basic domain invariants once so downstream engines
 * can rely on trusted mechanical instrument rules.
 */
export function createTradingSpecification(
  input: TradingSpecificationInput,
): TradingSpecification {
  const specification: TradingSpecification = {
    price: validatePriceRules(input.price),
    quantity: validateQuantityRules(input.quantity),
    contract: validateContractRules(input.contract),
  };

  Object.freeze(specification.price);
  Object.freeze(specification.quantity);
  Object.freeze(specification.contract);

  return Object.freeze(specification);
}

/**
 * Checks whether a price conforms to the instrument's tick size and precision.
 */
export function isValidPrice(
  price: number,
  rules: PriceRules,
): boolean {
  if (!Number.isFinite(price) || price <= 0) {
    return false;
  }

  const units = price / rules.tickSize;
  const roundedUnits = Math.round(units);
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(units)) * 10;

  if (Math.abs(units - roundedUnits) > tolerance) {
    return false;
  }

  return countDecimalPlaces(price) <= rules.pricePrecision;
}

/**
 * Checks whether a quantity conforms to the instrument's minimum, maximum,
 * step, and precision rules.
 */
export function isValidQuantity(
  quantity: number,
  rules: QuantityRules,
): boolean {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return false;
  }

  if (quantity < rules.minQuantity || quantity > rules.maxQuantity) {
    return false;
  }

  const steps = (quantity - rules.minQuantity) / rules.quantityStep;
  const roundedSteps = Math.round(steps);
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(steps)) * 10;

  if (Math.abs(steps - roundedSteps) > tolerance) {
    return false;
  }

  return countDecimalPlaces(quantity) <= rules.quantityPrecision;
}

function countDecimalPlaces(value: number): number {
  const text = value.toString().toLowerCase();

  if (text.includes("e")) {
    const [coefficient, exponentText] = text.split("e");
    const exponent = Number(exponentText);
    const decimals = coefficient.split(".")[1]?.length ?? 0;
    return Math.max(0, decimals - exponent);
  }

  return text.split(".")[1]?.length ?? 0;
}
