"use server";

import { notificationPreferencesSchema, updateNotificationPreferences } from "@/modules/account";
import { requireUser } from "@/modules/auth";
import { defineAuthedAction } from "@/modules/auth/action";

export const updateNotificationPreferencesAction = defineAuthedAction({
  name: "account.notificationPreferences.update",
  schema: notificationPreferencesSchema,
  handler: async ({ principal, input }) =>
    updateNotificationPreferences(requireUser(principal).userId, input),
});
