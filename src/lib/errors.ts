/**
 * Centralized application errors (docs/architecture.md §8, docs/api.md §1).
 *
 * Services throw `AppError` subclasses; adapters (`defineRoute`, `defineAction`)
 * map them to HTTP responses. Anything else is an unexpected error: logged with
 * its stack, reported to the error tracker, and shown to the client as a
 * generic 500 with a request id.
 */

export const ERROR_CODES = [
  "VALIDATION_ERROR",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "SLOT_UNAVAILABLE",
  "POLICY_VIOLATION",
  "INVALID_TRANSITION",
  "PAYLOAD_TOO_LARGE",
  "UNSUPPORTED_MEDIA_TYPE",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export type ErrorDetails = Record<string, unknown>;

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: ErrorDetails | undefined;
  /** When false the error is expected behaviour and is logged at `info`, not `error`. */
  readonly expose: boolean;

  constructor(
    code: ErrorCode,
    message: string,
    status: number,
    options: { details?: ErrorDetails; cause?: unknown; expose?: boolean } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = new.target.name;
    this.code = code;
    this.status = status;
    this.details = options.details;
    this.expose = options.expose ?? true;
  }

  toJSON() {
    return { code: this.code, message: this.message, details: this.details };
  }
}

export class ValidationError extends AppError {
  constructor(message = "Invalid input.", details?: ErrorDetails) {
    super("VALIDATION_ERROR", message, 400, { details });
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = "Authentication required.") {
    super("UNAUTHENTICATED", message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to perform this action.") {
    super("FORBIDDEN", message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(entity = "Resource", details?: ErrorDetails) {
    super("NOT_FOUND", `${entity} not found.`, 404, { details });
  }
}

export class ConflictError extends AppError {
  constructor(message = "The resource was modified by someone else.", details?: ErrorDetails) {
    super("CONFLICT", message, 409, { details });
  }
}

export class SlotUnavailableError extends AppError {
  constructor(message = "This time is no longer available.", details?: ErrorDetails) {
    super("SLOT_UNAVAILABLE", message, 409, { details });
  }
}

export class PolicyViolationError extends AppError {
  constructor(reason: string, message = "This action is not allowed by the salon policy.") {
    super("POLICY_VIOLATION", message, 422, { details: { reason } });
  }
}

export class InvalidTransitionError extends AppError {
  constructor(from: string, to: string) {
    super("INVALID_TRANSITION", `Cannot change status from ${from} to ${to}.`, 422, {
      details: { from, to },
    });
  }
}

export class PayloadTooLargeError extends AppError {
  constructor(maxBytes: number) {
    super("PAYLOAD_TOO_LARGE", "The uploaded file is too large.", 413, {
      details: { maxBytes },
    });
  }
}

export class UnsupportedMediaTypeError extends AppError {
  constructor(allowed: string[]) {
    super("UNSUPPORTED_MEDIA_TYPE", "This file type is not supported.", 415, {
      details: { allowed },
    });
  }
}

export class RateLimitedError extends AppError {
  constructor(readonly retryAfterSeconds: number) {
    super("RATE_LIMITED", "Too many requests. Please try again shortly.", 429, {
      details: { retryAfterSeconds },
    });
  }
}

export class InternalError extends AppError {
  constructor(cause?: unknown) {
    super("INTERNAL_ERROR", "Something went wrong on our side.", 500, { cause, expose: false });
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/** Normalizes any thrown value into an `AppError` without leaking internals. */
export function toAppError(error: unknown): AppError {
  if (isAppError(error)) return error;
  return new InternalError(error);
}
