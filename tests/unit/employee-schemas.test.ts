import { describe, expect, it } from "vitest";

import {
  blockedTimeInputSchema,
  scheduleInputSchema,
  timeOffInputSchema,
} from "@/modules/employees/schemas";

describe("scheduleInputSchema", () => {
  it("accepts split shifts with breaks inside the shift", () => {
    const result = scheduleInputSchema.safeParse([
      { weekday: 0, startTime: "09:00", endTime: "13:00", breaks: [] },
      {
        weekday: 0,
        startTime: "14:00",
        endTime: "18:00",
        breaks: [{ startTime: "16:00", endTime: "16:15", label: "" }],
      },
    ]);
    expect(result.success).toBe(true);
  });

  it("rejects overlapping shifts on the same day", () => {
    const result = scheduleInputSchema.safeParse([
      { weekday: 1, startTime: "09:00", endTime: "13:00", breaks: [] },
      { weekday: 1, startTime: "12:00", endTime: "18:00", breaks: [] },
    ]);
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues[0]?.message).toBe("employees.validation.blocksOverlap");
  });

  it("allows touching shifts and rejects breaks outside the shift", () => {
    expect(
      scheduleInputSchema.safeParse([
        { weekday: 2, startTime: "09:00", endTime: "12:00", breaks: [] },
        { weekday: 2, startTime: "12:00", endTime: "15:00", breaks: [] },
      ]).success,
    ).toBe(true);
    const outside = scheduleInputSchema.safeParse([
      {
        weekday: 2,
        startTime: "09:00",
        endTime: "12:00",
        breaks: [{ startTime: "12:00", endTime: "12:30", label: null }],
      },
    ]);
    expect(outside.success).toBe(false);
    if (!outside.success)
      expect(outside.error.issues[0]?.message).toBe("employees.validation.breakInsideShift");
  });
});

describe("timeOffInputSchema", () => {
  it("requires times for partial days and ordered dates", () => {
    expect(
      timeOffInputSchema.safeParse({
        type: "VACATION",
        startsOn: "2027-01-05",
        endsOn: "2027-01-10",
        allDay: true,
      }).success,
    ).toBe(true);
    expect(
      timeOffInputSchema.safeParse({
        type: "SICK",
        startsOn: "2027-01-10",
        endsOn: "2027-01-05",
        allDay: true,
      }).success,
    ).toBe(false);
    expect(
      timeOffInputSchema.safeParse({
        type: "PERSONAL",
        startsOn: "2027-01-05",
        endsOn: "2027-01-05",
        allDay: false,
      }).success,
    ).toBe(false);
    expect(
      timeOffInputSchema.safeParse({
        type: "PERSONAL",
        startsOn: "2027-01-05",
        endsOn: "2027-01-05",
        allDay: false,
        startTime: "13:00",
        endTime: "15:00",
      }).success,
    ).toBe(true);
  });
});

describe("blockedTimeInputSchema", () => {
  it("accepts salon-wide blocks and validates the time range", () => {
    expect(
      blockedTimeInputSchema.safeParse({
        employeeId: "",
        date: "2026-10-10",
        startTime: "13:00",
        endTime: "15:00",
      }).success,
    ).toBe(true);
    expect(
      blockedTimeInputSchema.safeParse({ date: "2026-10-10", startTime: "15:00", endTime: "13:00" })
        .success,
    ).toBe(false);
  });
});
