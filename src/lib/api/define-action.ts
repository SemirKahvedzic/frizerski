import type { ZodType } from "zod";

import { ValidationError, isAppError, toAppError, type ErrorCode } from "@/lib/errors";
import { logger, type Logger } from "@/lib/logger";

/**
 * Server Action wrapper with the same guarantees as `defineRoute`
 * (docs/architecture.md §5): principal resolution, Zod validation, uniform
 * error mapping and logging. The principal type is generic so this stays in
 * `lib`; the auth module binds it to the real session resolver.
 */
export type ActionFailure = {
  ok: false;
  error: {
    code: ErrorCode;
    message: string;
    fieldErrors?: Record<string, string>;
    requestId: string;
  };
};

export type ActionSuccess<T> = { ok: true; data: T };

export type ActionResult<T> = ActionSuccess<T> | ActionFailure;

export type ActionContext<P, I> = {
  principal: P;
  input: I;
  requestId: string;
  log: Logger;
};

export type ActionConfig<P, I, O> = {
  name: string;
  schema?: ZodType<I>;
  resolvePrincipal: () => Promise<P>;
  handler: (ctx: ActionContext<P, I>) => Promise<O>;
};

export function defineAction<P, I, O>(config: ActionConfig<P, I, O>) {
  return async (rawInput: unknown): Promise<ActionResult<O>> => {
    const requestId = crypto.randomUUID();
    const log = logger.child({ requestId, action: config.name });
    const startedAt = Date.now();

    try {
      const principal = await config.resolvePrincipal();

      let input = rawInput as I;
      if (config.schema) {
        const parsed = config.schema.safeParse(
          rawInput instanceof FormData ? formDataToObject(rawInput) : rawInput,
        );
        if (!parsed.success) {
          const fieldErrors: Record<string, string> = {};
          for (const issue of parsed.error.issues) {
            const key = issue.path.join(".") || "_";
            fieldErrors[key] ??= issue.message;
          }
          throw new ValidationError("Invalid input.", { fieldErrors });
        }
        input = parsed.data;
      }

      const data = await config.handler({ principal, input, requestId, log });
      log.info({ durationMs: Date.now() - startedAt }, "action completed");
      return { ok: true, data };
    } catch (error) {
      const appError = toAppError(error);
      const durationMs = Date.now() - startedAt;
      if (isAppError(error) && appError.status < 500) {
        log.info({ code: appError.code, durationMs }, appError.message);
      } else {
        log.error({ err: error, code: appError.code, durationMs }, "action failed");
      }
      const fieldErrors = appError.details?.["fieldErrors"] as Record<string, string> | undefined;
      return {
        ok: false,
        error: {
          code: appError.code,
          message: appError.message,
          ...(fieldErrors ? { fieldErrors } : {}),
          requestId,
        },
      };
    }
  };
}

function formDataToObject(formData: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value !== "string") continue;
    if (key in out) {
      const existing = out[key];
      out[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
    } else {
      out[key] = value;
    }
  }
  return out;
}
