import { defineAction, type ActionConfig } from "@/lib/api/define-action";
import { getCurrentPrincipal } from "@/modules/auth/session";
import type { Principal } from "@/modules/auth/types";

/**
 * `defineAction` bound to the session resolver. Use in `"use server"` files:
 *
 *   export const createSalonAction = defineAuthedAction({ name, schema, handler });
 */
export function defineAuthedAction<I, O>(
  config: Omit<ActionConfig<Principal, I, O>, "resolvePrincipal">,
) {
  return defineAction<Principal, I, O>({ ...config, resolvePrincipal: getCurrentPrincipal });
}
