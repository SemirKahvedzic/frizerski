import { defineRoute } from "@/lib/api/define-route";
import { pingDatabase } from "@/lib/db";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

const startedAt = Date.now();

export const GET = defineRoute({
  name: "health",
  auth: "none",
  handler: async () => {
    const dbOk = await pingDatabase();
    const body = {
      status: dbOk ? "ok" : "degraded",
      db: dbOk ? "ok" : "unreachable",
      version: env.APP_VERSION,
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      timestamp: new Date().toISOString(),
    };
    return { data: body, status: dbOk ? 200 : 503 };
  },
});
