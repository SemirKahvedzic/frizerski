import { describe, expect, it } from "vitest";

import {
  compareTimes,
  dateStringToUtc,
  isValidDateString,
  isValidTime,
  localDateString,
  localTimeString,
  minutesToTime,
  timeToMinutes,
  utcToDateString,
  wallClockToUtc,
  weekdayInTimeZone,
} from "@/lib/time";

const TZ = "Europe/Sarajevo";

describe("wall-clock helpers", () => {
  it("validates and converts HH:mm", () => {
    expect(isValidTime("09:00")).toBe(true);
    expect(isValidTime("24:00")).toBe(true);
    expect(isValidTime("24:01")).toBe(false);
    expect(isValidTime("9:00")).toBe(false);
    expect(timeToMinutes("09:30")).toBe(570);
    expect(minutesToTime(570)).toBe("09:30");
    expect(minutesToTime(1440)).toBe("24:00");
    expect(compareTimes("17:00", "09:00")).toBeGreaterThan(0);
    expect(() => timeToMinutes("nope")).toThrow(RangeError);
  });

  it("validates calendar dates including leap years", () => {
    expect(isValidDateString("2026-02-28")).toBe(true);
    expect(isValidDateString("2026-02-29")).toBe(false);
    expect(isValidDateString("2028-02-29")).toBe(true);
    expect(isValidDateString("2026-13-01")).toBe(false);
    expect(utcToDateString(dateStringToUtc("2026-10-10"))).toBe("2026-10-10");
  });
});

describe("time zone helpers", () => {
  it("computes ISO weekday, local date and time in the salon time zone", () => {
    // 2026-10-10 is a Saturday. 23:30Z on Friday is 01:30 Saturday in Sarajevo (CEST).
    const instant = new Date("2026-10-09T23:30:00.000Z");
    expect(weekdayInTimeZone(instant, TZ)).toBe(5);
    expect(localDateString(instant, TZ)).toBe("2026-10-10");
    expect(localTimeString(instant, TZ)).toBe("01:30");
    expect(weekdayInTimeZone(instant, "UTC")).toBe(4);
  });

  it("converts wall-clock times per date, honouring DST", () => {
    // Summer: CEST = UTC+2
    expect(wallClockToUtc("2026-07-01", "09:00", TZ).toISOString()).toBe(
      "2026-07-01T07:00:00.000Z",
    );
    // Winter: CET = UTC+1
    expect(wallClockToUtc("2026-12-01", "09:00", TZ).toISOString()).toBe(
      "2026-12-01T08:00:00.000Z",
    );
    // Spring forward (2026-03-29 02:00 -> 03:00): 02:30 does not exist and resolves after the gap.
    const gap = wallClockToUtc("2026-03-29", "02:30", TZ);
    expect(gap.toISOString()).toBe("2026-03-29T01:30:00.000Z");
    // Fall back (2026-10-25): 09:00 is unambiguous and CET.
    expect(wallClockToUtc("2026-10-25", "09:00", TZ).toISOString()).toBe(
      "2026-10-25T08:00:00.000Z",
    );
  });
});
