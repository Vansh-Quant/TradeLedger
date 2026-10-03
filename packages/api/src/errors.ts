import {
  ApplicationError,
  AuthorizationError,
  NotFoundError,
  ValidationError,
} from "@tradeledger/application";

export function mapError(error: unknown): { status: number; body: unknown } {
  if (error instanceof AuthorizationError) {
    return { status: 401, body: { error: { code: "UNAUTHORIZED", message: "authentication or authorization failed" } } };
  }
  if (error instanceof NotFoundError) {
    return { status: 404, body: { error: { code: "NOT_FOUND", message: "resource not found" } } };
  }
  if (error instanceof ValidationError) {
    return { status: 400, body: { error: { code: "VALIDATION_ERROR", message: error.message } } };
  }
  if (error instanceof ApplicationError) {
    return { status: 409, body: { error: { code: error.code, message: error.message } } };
  }
  return { status: 500, body: { error: { code: "INTERNAL_ERROR", message: "internal server error" } } };
}
