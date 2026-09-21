import { describe, expect, it } from "vitest";

import { notificationPreferencesSchema, updateProfileSchema } from "@/modules/account/schemas";

describe("account schemas", () => {
  it("trims names, normalises an empty phone to null and restricts locale", () => {
    const parsed = updateProfileSchema.parse({
      firstName: "  Amina ",
      lastName: "Hodžić",
      phone: "",
      locale: "en",
    });
    expect(parsed).toEqual({ firstName: "Amina", lastName: "Hodžić", phone: null, locale: "en" });
    expect(
      updateProfileSchema.safeParse({ firstName: "", lastName: "X", locale: "bs" }).success,
    ).toBe(false);
    expect(
      updateProfileSchema.safeParse({ firstName: "A", lastName: "B", locale: "de" }).success,
    ).toBe(false);
    expect(
      updateProfileSchema.safeParse({ firstName: "A", lastName: "B", phone: "abc", locale: "bs" })
        .success,
    ).toBe(false);
  });

  it("requires every preference flag to be boolean", () => {
    expect(
      notificationPreferencesSchema.safeParse({
        emailEnabled: true,
        pushEnabled: false,
        reminder24h: true,
        reminder1h: false,
        marketingEmails: false,
      }).success,
    ).toBe(true);
    expect(notificationPreferencesSchema.safeParse({ emailEnabled: "yes" }).success).toBe(false);
  });
});
