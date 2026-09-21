"use server";

import { defineAuthedAction } from "@/modules/auth/action";
import { createSalon, createSalonSchema } from "@/modules/salons";

export const createSalonAction = defineAuthedAction({
  name: "salons.create",
  schema: createSalonSchema,
  handler: async ({ principal, input, requestId }) => {
    const salon = await createSalon(principal, input, { requestId });
    return { id: salon.id, slug: salon.slug, name: salon.name };
  },
});
