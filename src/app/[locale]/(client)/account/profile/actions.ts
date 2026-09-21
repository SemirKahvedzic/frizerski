"use server";

import { updateProfile, updateProfileSchema } from "@/modules/account";
import { requireUser } from "@/modules/auth";
import { defineAuthedAction } from "@/modules/auth/action";

export const updateProfileAction = defineAuthedAction({
  name: "account.profile.update",
  schema: updateProfileSchema,
  handler: async ({ principal, input }) => updateProfile(requireUser(principal).userId, input),
});
