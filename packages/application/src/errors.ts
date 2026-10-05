export class ApplicationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ApplicationError";
    this.code = code;
  }
}

export class ValidationError extends ApplicationError {
  constructor(message: string) {
    super("VALIDATION_ERROR", message);
    this.name = "ValidationError";
  }
}

export class AuthenticationError extends ApplicationError {
  constructor(message = "authentication is required") {
    super("AUTHENTICATION_ERROR", message);
    this.name = "AuthenticationError";
  }
}

export class AuthorizationError extends ApplicationError {
  constructor(message = "action is not authorized") {
    super("AUTHORIZATION_ERROR", message);
    this.name = "AuthorizationError";
  }
}

export class NotFoundError extends ApplicationError {
  constructor(message: string) {
    super("NOT_FOUND", message);
    this.name = "NotFoundError";
  }
}

export class AdmissionError extends ApplicationError {
  constructor(message: string) {
    super("ORDER_ADMISSION_REJECTED", message);
    this.name = "AdmissionError";
  }
}
