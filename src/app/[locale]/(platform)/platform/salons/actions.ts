"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { defineAuthedAction } from "@/modules/auth/action";
import { setSalonStatus } from "@/modules/platform";
import { salonStatusSchema } from "@/modules/salons";
import { platformContext } from "@/modules/tenant";

export const setSalonStatusAction = defineAuthedAction({
  name: "platform.salons.setStatus",
  schema: z.object({ salonId: z.uuid(), status: salonStatusSchema }),
  handler: async ({ principal, input, requestId }) => {
    const ctx = platformContext(principal, { requestId });
    const result = await setSalonStatus(ctx, input.salonId, input.status);
    revalidatePath("/[locale]/platform/salons", "page");
    return result;
  },
});
