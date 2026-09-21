"use server";

import { updateTag } from "next/cache";
import { z } from "zod";

import { cacheTags } from "@/lib/cache/tags";
import { defineAuthedAction } from "@/modules/auth/action";
import {
  addClosure,
  createClosureSchema,
  removeClosure,
  setWorkingHours,
  workingHoursSchema,
} from "@/modules/salons";
import { resolveTenantContext } from "@/modules/tenant";

export const setWorkingHoursAction = defineAuthedAction({
  name: "salon.workingHours.set",
  schema: z.object({ salonSlug: z.string().min(1), days: workingHoursSchema }),
  handler: async ({ principal, input, requestId }) => {
    const ctx = await resolveTenantContext(principal, { slug: input.salonSlug }, { requestId });
    const days = await setWorkingHours(ctx, input.days);
    updateTag(cacheTags.publicSalon(ctx.salonSlug));
    return { days };
  },
});

export const addClosureAction = defineAuthedAction({
  name: "salon.closures.add",
  schema: createClosureSchema.safeExtend({ salonSlug: z.string().min(1) }),
  handler: async ({ principal, input, requestId }) => {
    const { salonSlug, ...closure } = input;
    const ctx = await resolveTenantContext(principal, { slug: salonSlug }, { requestId });
    const created = await addClosure(ctx, closure);
    updateTag(cacheTags.publicSalon(ctx.salonSlug));
    return created;
  },
});

export const removeClosureAction = defineAuthedAction({
  name: "salon.closures.remove",
  schema: z.object({ salonSlug: z.string().min(1), closureId: z.uuid() }),
  handler: async ({ principal, input, requestId }) => {
    const ctx = await resolveTenantContext(principal, { slug: input.salonSlug }, { requestId });
    await removeClosure(ctx, input.closureId);
    updateTag(cacheTags.publicSalon(ctx.salonSlug));
    return { id: input.closureId };
  },
});
