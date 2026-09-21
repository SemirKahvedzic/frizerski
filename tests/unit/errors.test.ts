import { describe, expect, it } from "vitest";

import {
  AppError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  PolicyViolationError,
  RateLimitedError,
  SlotUnavailableError,
  ValidationError,
  isAppError,
  toAppError,
} from "@/lib/errors";

describe("AppError hierarchy", () => {
  it("maps subclasses to codes and HTTP statuses", () => {
    expect(new ValidationError()).toMatchObject({ code: "VALIDATION_ERROR", status: 400 });
    expect(new ForbiddenError()).toMatchObject({ code: "FORBIDDEN", status: 403 });
    expect(new NotFoundError("Salon")).toMatchObject({
      code: "NOT_FOUND",
      status: 404,
      message: "Salon not found.",
    });
    expect(new SlotUnavailableError()).toMatchObject({ code: "SLOT_UNAVAILABLE", status: 409 });
    expect(new PolicyViolationError("CUTOFF_PASSED")).toMatchObject({
      code: "POLICY_VIOLATION",
      status: 422,
      details: { reason: "CUTOFF_PASSED" },
    });
    expect(new RateLimitedError(30)).toMatchObject({ code: "RATE_LIMITED", status: 429 });
  });

  it("sets the error name to the subclass name", () => {
    expect(new NotFoundError().name).toBe("NotFoundError");
    expect(new NotFoundError()).toBeInstanceOf(AppError);
    expect(new NotFoundError()).toBeInstanceOf(Error);
  });

  it("serializes without leaking the stack", () => {
    const json = JSON.parse(JSON.stringify(new ValidationError("Bad", { field: "x" })));
    expect(json).toEqual({ code: "VALIDATION_ERROR", message: "Bad", details: { field: "x" } });
  });

  it("wraps unknown errors into a non-exposed InternalError", () => {
    const cause = new TypeError("boom");
    const wrapped = toAppError(cause);
    expect(wrapped).toBeInstanceOf(InternalError);
    expect(wrapped.status).toBe(500);
    expect(wrapped.expose).toBe(false);
    expect(wrapped.cause).toBe(cause);
    expect(wrapped.message).not.toContain("boom");
  });

  it("passes AppErrors through untouched", () => {
    const original = new ForbiddenError();
    expect(toAppError(original)).toBe(original);
    expect(isAppError(original)).toBe(true);
    expect(isAppError(new Error("x"))).toBe(false);
  });
});
