"use server";

import { z } from "zod";

import { defineAuthedAction } from "@/modules/auth/action";
import { addBlockedTime, blockedTimeInputSchema, removeBlockedTime } from "@/modules/employees";
import { resolveTenantContext } from "@/modules/tenant";

export const addBlockedTimeAction = defineAuthedAction({
  name: "blockedTimes.add",
  schema: blockedTimeInputSchema.safeExtend({ salonSlug: z.string().min(1) }),
  handler: async ({ principal, input, requestId }) => {
    const { salonSlug, ...data } = input;
    const ctx = await resolveTenantContext(principal, { slug: salonSlug }, { requestId });
    const row = await addBlockedTime(ctx, data);
    return { id: row.id };
  },
});

export const removeBlockedTimeAction = defineAuthedAction({
  name: "blockedTimes.remove",
  schema: z.object({ salonSlug: z.string().min(1), blockedTimeId: z.uuid() }),
  handler: async ({ principal, input, requestId }) => {
    const ctx = await resolveTenantContext(principal, { slug: input.salonSlug }, { requestId });
    await removeBlockedTime(ctx, input.blockedTimeId);
    return { id: input.blockedTimeId };
  },
});
