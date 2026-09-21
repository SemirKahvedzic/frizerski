import { describe, expect, it } from "vitest";

import { defaultWorkingHours } from "@/modules/salons/defaults";
import {
  createClosureSchema,
  updateSalonProfileSchema,
  updateSalonSettingsSchema,
  workingHoursSchema,
} from "@/modules/salons/schemas";

describe("updateSalonProfileSchema", () => {
  const base = { name: "Studio", audience: "UNISEX", defaultLocale: "bs" };

  it("normalizes empty strings to null and validates urls, country and color", () => {
    const parsed = updateSalonProfileSchema.parse({
      ...base,
      description: "",
      website: "",
      country: "ba",
      email: "Info@Studio.BA",
      brandColor: "#0F766E",
    });
    expect(parsed.description).toBeNull();
    expect(parsed.website).toBeNull();
    expect(parsed.country).toBe("BA");
    expect(parsed.email).toBe("info@studio.ba");
    expect(parsed.brandColor).toBe("#0F766E");

    expect(updateSalonProfileSchema.safeParse({ ...base, website: "studio.ba" }).success).toBe(
      false,
    );
    expect(updateSalonProfileSchema.safeParse({ ...base, country: "BIH" }).success).toBe(false);
    expect(updateSalonProfileSchema.safeParse({ ...base, brandColor: "red" }).success).toBe(false);
    expect(updateSalonProfileSchema.safeParse({ ...base, email: "nope" }).success).toBe(false);
  });
});

describe("updateSalonSettingsSchema", () => {
  const valid = {
    slotIntervalMinutes: "30",
    minBookingNoticeMinutes: 60,
    maxBookingAdvanceDays: 60,
    cancellationCutoffHours: 12,
    rescheduleCutoffHours: 12,
    bufferMinutes: 0,
    autoConfirmBookings: "on",
    allowAnyEmployee: true,
    allowGuestBooking: "false",
    requirePhone: undefined,
    emailNotificationsEnabled: true,
    pushNotificationsEnabled: true,
    notifyAdminsOnNewBooking: true,
    notifyEmployeeOnNewBooking: true,
    reminder24hEnabled: true,
    reminder1hEnabled: true,
    timezone: "Europe/Sarajevo",
    currency: "bam",
  };

  it("coerces numbers and checkbox-style booleans", () => {
    const parsed = updateSalonSettingsSchema.parse(valid);
    expect(parsed.slotIntervalMinutes).toBe(30);
    expect(parsed.autoConfirmBookings).toBe(true);
    expect(parsed.allowGuestBooking).toBe(false);
    expect(parsed.requirePhone).toBe(false);
    expect(parsed.currency).toBe("BAM");
  });

  it("rejects out-of-range values and unknown time zones", () => {
    expect(updateSalonSettingsSchema.safeParse({ ...valid, slotIntervalMinutes: 3 }).success).toBe(
      false,
    );
    expect(
      updateSalonSettingsSchema.safeParse({ ...valid, maxBookingAdvanceDays: 0 }).success,
    ).toBe(false);
    expect(
      updateSalonSettingsSchema.safeParse({ ...valid, timezone: "Mars/Olympus" }).success,
    ).toBe(false);
  });
});

describe("workingHoursSchema", () => {
  it("accepts the defaults and requires all seven weekdays", () => {
    expect(workingHoursSchema.safeParse(defaultWorkingHours()).success).toBe(true);
    expect(workingHoursSchema.safeParse(defaultWorkingHours().slice(0, 6)).success).toBe(false);
    const duplicated = [
      ...defaultWorkingHours().slice(0, 6),
      { ...defaultWorkingHours()[0]!, weekday: 0 },
    ];
    expect(workingHoursSchema.safeParse(duplicated).success).toBe(false);
  });

  it("requires closing after opening unless the day is closed", () => {
    const days = defaultWorkingHours();
    days[0] = { weekday: 0, isClosed: false, opensAt: "17:00", closesAt: "09:00" };
    const result = workingHoursSchema.safeParse(days);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path.join(".")).toBe("0.closesAt");
      expect(result.error.issues[0]?.message).toBe("salons.validation.closesAfterOpens");
    }
    days[0] = { weekday: 0, isClosed: true, opensAt: "17:00", closesAt: "09:00" };
    expect(workingHoursSchema.safeParse(days).success).toBe(true);
  });
});

describe("createClosureSchema", () => {
  it("validates dates and ordering", () => {
    expect(
      createClosureSchema.safeParse({ startsOn: "2026-12-24", endsOn: "2026-12-26", reason: "" })
        .success,
    ).toBe(true);
    expect(
      createClosureSchema.safeParse({ startsOn: "2026-12-24", endsOn: "2026-12-24" }).success,
    ).toBe(true);
    expect(
      createClosureSchema.safeParse({ startsOn: "2026-12-26", endsOn: "2026-12-24" }).success,
    ).toBe(false);
    expect(
      createClosureSchema.safeParse({ startsOn: "2026-02-30", endsOn: "2026-03-01" }).success,
    ).toBe(false);
  });
});
