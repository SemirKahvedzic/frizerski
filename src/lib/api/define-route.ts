import { NextResponse, type NextRequest } from "next/server";
import type { ZodType } from "zod";

import { fail } from "@/lib/api/response";
import {
  RateLimitedError,
  ValidationError,
  isAppError,
  toAppError,
  type AppError,
} from "@/lib/errors";
import { logger, type Logger } from "@/lib/logger";
import { getRateLimiter } from "@/lib/rate-limit";

/**
 * Route Handler wrapper (docs/architecture.md §5).
 *
 * Every API route is declared through `defineRoute` so that request id,
 * logging, rate limiting, actor resolution, input validation and error
 * mapping are uniform and impossible to forget.
 *
 * Authentication is pluggable: `resolveActor` is injected by the auth module
 * (Phase 2). Until then only `auth: "none"` routes exist.
 */

export type Actor = {
  kind: "user";
  userId: string;
  platformRole: "SUPER_ADMIN" | null;
} & Record<string, unknown>;

export type AnonymousActor = { kind: "anonymous" };

export type ActorResolver = (request: NextRequest) => Promise<Actor | null>;

export type RouteContext<P, Q, B, A extends Actor | AnonymousActor> = {
  request: NextRequest;
  requestId: string;
  ip: string;
  log: Logger;
  params: P;
  query: Q;
  body: B;
  actor: A;
};

export type RateLimitConfig = {
  limit: number;
  windowSeconds: number;
  /** Key scope; `user` falls back to `ip` for anonymous callers. */
  keyBy?: "ip" | "user";
};

type HandlerResult = Response | { data: unknown; meta?: unknown; status?: number };

export type RouteConfig<P, Q, B, Auth extends "none" | "optional" | "session"> = {
  /** `none`: public. `optional`: actor when present. `session`: 401 without a valid session. */
  auth: Auth;
  /** Injected by the auth module; required for `optional` and `session`. */
  resolveActor?: ActorResolver;
  params?: ZodType<P>;
  query?: ZodType<Q>;
  body?: ZodType<B>;
  rateLimit?: RateLimitConfig;
  /** Stable name used in logs and rate-limit keys, e.g. `"health"`. */
  name: string;
  handler: (
    ctx: RouteContext<
      P,
      Q,
      B,
      Auth extends "session"
        ? Actor
        : Auth extends "optional"
          ? Actor | AnonymousActor
          : AnonymousActor
    >,
  ) => Promise<HandlerResult>;
};

type NextRouteHandler = (
  request: NextRequest,
  context: { params: Promise<Record<string, string | string[]>> },
) => Promise<Response>;

export function getRequestId(request: NextRequest): string {
  return request.headers.get("x-request-id") ?? crypto.randomUUID();
}

export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() ?? "unknown";
  return request.headers.get("x-real-ip") ?? "unknown";
}

function parseWith<T>(schema: ZodType<T> | undefined, value: unknown, where: string): T {
  if (!schema) return undefined as T;
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new ValidationError(`Invalid ${where}.`, {
      where,
      issues: result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
        code: issue.code,
      })),
    });
  }
  return result.data;
}

function queryToObject(searchParams: URLSearchParams): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [key, value] of searchParams) {
    const name = key.endsWith("[]") ? key.slice(0, -2) : key;
    const existing = out[name];
    if (existing === undefined) {
      out[name] = key.endsWith("[]") ? [value] : value;
    } else if (Array.isArray(existing)) {
      existing.push(value);
    } else {
      out[name] = [existing, value];
    }
  }
  return out;
}

async function readBody(request: NextRequest): Promise<unknown> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    const text = await request.text();
    if (text.length === 0) return undefined;
    throw new ValidationError("Expected application/json body.", { where: "body" });
  }
  try {
    return await request.json();
  } catch {
    throw new ValidationError("Malformed JSON body.", { where: "body" });
  }
}

export function defineRoute<
  P = undefined,
  Q = undefined,
  B = undefined,
  Auth extends "none" | "optional" | "session" = "none",
>(config: RouteConfig<P, Q, B, Auth>): NextRouteHandler {
  return async (request, context) => {
    const requestId = getRequestId(request);
    const ip = getClientIp(request);
    const startedAt = Date.now();
    const log = logger.child({ requestId, route: config.name, method: request.method });
    let actorForLog: string | undefined;

    try {
      // 1. Actor
      let actor: Actor | AnonymousActor = { kind: "anonymous" };
      if (config.auth !== "none") {
        if (!config.resolveActor) {
          throw new Error(`Route "${config.name}" requires auth but no resolveActor was provided.`);
        }
        const resolved = await config.resolveActor(request);
        if (resolved) {
          actor = resolved;
          actorForLog = resolved.userId;
        } else if (config.auth === "session") {
          throw toAppError(new (await import("@/lib/errors")).UnauthenticatedError());
        }
      }

      // 2. Rate limit
      if (config.rateLimit) {
        const scope =
          config.rateLimit.keyBy === "user" && actor.kind === "user"
            ? `user:${actor.userId}`
            : `ip:${ip}`;
        const result = await getRateLimiter().hit(
          `${config.name}:${scope}`,
          config.rateLimit.limit,
          config.rateLimit.windowSeconds,
        );
        if (!result.allowed) {
          throw new RateLimitedError(result.retryAfterSeconds);
        }
      }

      // 3. Input
      const rawParams = await context.params;
      const params = parseWith(config.params, rawParams, "params");
      const query = parseWith(config.query, queryToObject(request.nextUrl.searchParams), "query");
      const body = config.body
        ? parseWith(config.body, await readBody(request), "body")
        : (undefined as B);

      // 4. Handler
      const result = await config.handler({
        request,
        requestId,
        ip,
        log,
        params,
        query,
        body,
        actor: actor as never,
      });

      const response =
        result instanceof Response
          ? result
          : NextResponse.json(
              result.meta === undefined
                ? { data: result.data }
                : { data: result.data, meta: result.meta },
              { status: result.status ?? 200 },
            );

      response.headers.set("x-request-id", requestId);
      log.info(
        { status: response.status, durationMs: Date.now() - startedAt, userId: actorForLog },
        "request completed",
      );
      return response;
    } catch (error) {
      return handleError(error, { requestId, log, startedAt, userId: actorForLog });
    }
  };
}

function handleError(
  error: unknown,
  meta: { requestId: string; log: Logger; startedAt: number; userId?: string },
): Response {
  const appError: AppError = toAppError(error);
  const durationMs = Date.now() - meta.startedAt;

  if (isAppError(error) && appError.status < 500) {
    meta.log.info(
      { status: appError.status, code: appError.code, durationMs, userId: meta.userId },
      appError.message,
    );
  } else {
    meta.log.error(
      { err: error, status: appError.status, code: appError.code, durationMs, userId: meta.userId },
      "request failed",
    );
  }

  const headers = new Headers({ "x-request-id": meta.requestId });
  if (appError instanceof RateLimitedError) {
    headers.set("Retry-After", String(appError.retryAfterSeconds));
  }
  return fail(appError, meta.requestId, headers);
}
