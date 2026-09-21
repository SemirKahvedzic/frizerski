import { toNextJsHandler } from "better-auth/next-js";

import { getAuth } from "@/modules/auth";

export const dynamic = "force-dynamic";

export const { GET, POST } = toNextJsHandler((request) => getAuth().handler(request));
