export {
  ConflictError,
  InvalidTransitionError,
  NotFoundError,
  PolicyViolationError,
  SlotUnavailableError,
} from "@/lib/errors";

/**
 * Postgres raises SQLSTATE 23P01 when the `bookings_no_overlap` exclusion
 * constraint rejects a row. Prisma (driver adapter) surfaces it as an unknown
 * request error, so detection is by constraint name / SQLSTATE.
 */
export function isOverlapViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as {
    code?: string;
    message?: string;
    meta?: { code?: string; message?: string };
  };
  const text = `${e.message ?? ""} ${e.meta?.message ?? ""}`;
  return (
    e.code === "23P01" ||
    e.meta?.code === "23P01" ||
    text.includes("bookings_no_overlap") ||
    text.includes("23P01")
  );
}
