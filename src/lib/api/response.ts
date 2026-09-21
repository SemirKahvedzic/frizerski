import { NextResponse } from "next/server";

import type { AppError } from "@/lib/errors";

/** Success envelope: `{ data, meta? }` (docs/api.md §1). */
export type ApiSuccess<T, M = undefined> = M extends undefined ? { data: T } : { data: T; meta: M };

/** Error envelope: `{ error: { code, message, details?, requestId } }`. */
export type ApiFailure = {
  error: {
    code: AppError["code"];
    message: string;
    details?: Record<string, unknown>;
    requestId: string;
  };
};

export function ok<T>(data: T, init?: { status?: number; meta?: unknown; headers?: HeadersInit }) {
  const body = init?.meta === undefined ? { data } : { data, meta: init.meta };
  return NextResponse.json(body, { status: init?.status ?? 200, headers: init?.headers });
}

export function fail(error: AppError, requestId: string, headers?: HeadersInit) {
  const body: ApiFailure = {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
      requestId,
    },
  };
  return NextResponse.json(body, { status: error.status, headers });
}

export function noContent(headers?: HeadersInit) {
  return new NextResponse(null, { status: 204, headers });
}
