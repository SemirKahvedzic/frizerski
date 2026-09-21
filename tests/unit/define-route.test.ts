import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { defineRoute, type Actor } from "@/lib/api/define-route";
import { NotFoundError } from "@/lib/errors";
import { MemoryRateLimiter, setRateLimiter } from "@/lib/rate-limit";

const noParams = { params: Promise.resolve({}) };

function jsonRequest(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("defineRoute", () => {
  beforeEach(() => {
    setRateLimiter(new MemoryRateLimiter());
  });
  afterEach(() => setRateLimiter(undefined));

  it("wraps handler output in the success envelope and echoes the request id", async () => {
    const GET = defineRoute({
      name: "test.ok",
      auth: "none",
      handler: async () => ({ data: { hello: "world" }, meta: { total: 1 } }),
    });

    const response = await GET(
      new NextRequest("http://localhost/api/test", { headers: { "x-request-id": "req-1" } }),
      noParams,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe("req-1");
    expect(await response.json()).toEqual({ data: { hello: "world" }, meta: { total: 1 } });
  });

  it("validates params, query and body with Zod and returns 400 with issues", async () => {
    const POST = defineRoute({
      name: "test.validate",
      auth: "none",
      params: z.object({ id: z.uuid() }),
      query: z.object({ limit: z.coerce.number().int().max(100).default(25) }),
      body: z.object({ name: z.string().min(2) }),
      handler: async ({ params, query, body }) => ({ data: { params, query, body } }),
    });

    const bad = await POST(jsonRequest("http://localhost/api/test?limit=500", { name: "x" }), {
      params: Promise.resolve({ id: "nope" }),
    });
    expect(bad.status).toBe(400);
    const payload = await bad.json();
    expect(payload.error.code).toBe("VALIDATION_ERROR");
    expect(payload.error.details.where).toBe("params");
    expect(payload.error.requestId).toBeTypeOf("string");

    const good = await POST(jsonRequest("http://localhost/api/test?limit=10", { name: "Ana" }), {
      params: Promise.resolve({ id: "6d1c2f1a-3c7e-4b0d-9a1e-0f8a4d2b1c33" }),
    });
    expect(good.status).toBe(200);
    expect(await good.json()).toEqual({
      data: {
        params: { id: "6d1c2f1a-3c7e-4b0d-9a1e-0f8a4d2b1c33" },
        query: { limit: 10 },
        body: { name: "Ana" },
      },
    });
  });

  it("rejects malformed JSON bodies", async () => {
    const POST = defineRoute({
      name: "test.json",
      auth: "none",
      body: z.object({}),
      handler: async () => ({ data: null }),
    });
    const response = await POST(
      new NextRequest("http://localhost/api/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not json",
      }),
      noParams,
    );
    expect(response.status).toBe(400);
  });

  it("maps AppErrors to their status and never leaks unexpected error messages", async () => {
    const notFound = defineRoute({
      name: "test.notfound",
      auth: "none",
      handler: async () => {
        throw new NotFoundError("Salon");
      },
    });
    const crash = defineRoute({
      name: "test.crash",
      auth: "none",
      handler: async () => {
        throw new Error("database password is hunter2");
      },
    });

    const nf = await notFound(new NextRequest("http://localhost/api/x"), noParams);
    expect(nf.status).toBe(404);
    expect((await nf.json()).error).toMatchObject({
      code: "NOT_FOUND",
      message: "Salon not found.",
    });

    const cr = await crash(new NextRequest("http://localhost/api/x"), noParams);
    expect(cr.status).toBe(500);
    const body = await cr.json();
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(body)).not.toContain("hunter2");
  });

  it("applies rate limits per IP and sets Retry-After", async () => {
    const GET = defineRoute({
      name: "test.ratelimit",
      auth: "none",
      rateLimit: { limit: 2, windowSeconds: 60 },
      handler: async () => ({ data: "ok" }),
    });
    const make = (ip: string) =>
      GET(
        new NextRequest("http://localhost/api/x", { headers: { "x-forwarded-for": ip } }),
        noParams,
      );

    expect((await make("1.1.1.1")).status).toBe(200);
    expect((await make("1.1.1.1")).status).toBe(200);
    const limited = await make("1.1.1.1");
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBeTruthy();
    expect((await make("2.2.2.2")).status).toBe(200);
  });

  it("enforces session auth through the injected actor resolver", async () => {
    const actor: Actor = { kind: "user", userId: "u1", platformRole: null };
    const resolveActor = async (request: NextRequest) =>
      request.headers.get("authorization") === "Bearer ok" ? actor : null;

    const GET = defineRoute({
      name: "test.auth",
      auth: "session",
      resolveActor,
      handler: async ({ actor: a }) => ({ data: a.userId }),
    });

    const anonymous = await GET(new NextRequest("http://localhost/api/x"), noParams);
    expect(anonymous.status).toBe(401);

    const authed = await GET(
      new NextRequest("http://localhost/api/x", { headers: { authorization: "Bearer ok" } }),
      noParams,
    );
    expect(authed.status).toBe(200);
    expect(await authed.json()).toEqual({ data: "u1" });
  });
});
