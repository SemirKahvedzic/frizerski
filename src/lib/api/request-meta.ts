import type { NextRequest } from "next/server";

import { getClientIp } from "@/lib/api/define-route";

export type RequestMetaLike = { requestId?: string; ip?: string; userAgent?: string };

/** Request facts worth recording in audit rows. */
export function requestMeta(request: NextRequest, requestId: string): RequestMetaLike {
  return {
    requestId,
    ip: getClientIp(request),
    userAgent: request.headers.get("user-agent") ?? undefined,
  };
}
