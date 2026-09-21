"use server";

import { updateTag } from "next/cache";
import { z } from "zod";

import { cacheTags } from "@/lib/cache/tags";
import { defineAuthedAction } from "@/modules/auth/action";
import { updateSalonSettings, updateSalonSettingsSchema } from "@/modules/salons";
import { resolveTenantContext } from "@/modules/tenant";

export const updateSalonSettingsAction = defineAuthedAction({
  name: "salon.settings.update",
  schema: updateSalonSettingsSchema.extend({ salonSlug: z.string().min(1) }),
  handler: async ({ principal, input, requestId }) => {
    const { salonSlug, ...settings } = input;
    const ctx = await resolveTenantContext(principal, { slug: salonSlug }, { requestId });
    const updated = await updateSalonSettings(ctx, settings);
    updateTag(cacheTags.publicSalon(ctx.salonSlug));
    return updated;
  },
});
