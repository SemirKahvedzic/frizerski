import { inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import type { Auth } from "@/modules/auth/auth";

/** Browser-side auth client. Import only from client components. */
export const authClient = createAuthClient({
  basePath: "/api/auth",
  plugins: [inferAdditionalFields<Auth>()],
});

export type AuthClient = typeof authClient;
