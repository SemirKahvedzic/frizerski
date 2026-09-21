"use server";

import { updateTag } from "next/cache";
import { z } from "zod";

import { cacheTags } from "@/lib/cache/tags";
import { defineAuthedAction } from "@/modules/auth/action";
import { updateSalonProfile, updateSalonProfileSchema } from "@/modules/salons";
import { resolveTenantContext } from "@/modules/tenant";

export const updateSalonProfileAction = defineAuthedAction({
  name: "salon.profile.update",
  schema: updateSalonProfileSchema.extend({ salonSlug: z.string().min(1) }),
  handler: async ({ principal, input, requestId }) => {
    const { salonSlug, ...profile } = input;
    const ctx = await resolveTenantContext(principal, { slug: salonSlug }, { requestId });
    const updated = await updateSalonProfile(ctx, profile);
    updateTag(cacheTags.publicSalon(ctx.salonSlug));
    return { name: updated.name, updatedAt: updated.updatedAt.toISOString() };
  },
});
