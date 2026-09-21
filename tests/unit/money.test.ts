import { describe, expect, it } from "vitest";

import { centsToDecimalString, formatDuration, formatMoney, parseMoneyToCents } from "@/lib/money";
import { priceSchema, serviceInputSchema } from "@/modules/services/schemas";

describe("money helpers", () => {
  it("parses user input into cents", () => {
    expect(parseMoneyToCents("20")).toBe(2000);
    expect(parseMoneyToCents("20.5")).toBe(2050);
    expect(parseMoneyToCents("20,50")).toBe(2050);
    expect(parseMoneyToCents(" 1 200,05 ")).toBe(120005);
    expect(parseMoneyToCents("abc")).toBeNull();
    expect(parseMoneyToCents("1.234")).toBeNull();
    expect(parseMoneyToCents(-1)).toBeNull();
    expect(parseMoneyToCents(19.99)).toBe(1999);
  });

  it("formats cents", () => {
    expect(centsToDecimalString(2050)).toBe("20.50");
    expect(centsToDecimalString(5)).toBe("0.05");
    expect(formatMoney(2000, "BAM", "en")).toContain("20.00");
    expect(formatMoney(2000, "EUR", "bs")).toMatch(/20,00/);
    expect(formatDuration(45, { h: "h", min: "min" })).toBe("45 min");
    expect(formatDuration(120, { h: "h", min: "min" })).toBe("2 h");
    expect(formatDuration(90, { h: "h", min: "min" })).toBe("1 h 30 min");
  });
});

describe("service schemas", () => {
  it("coerces price strings and validates duration", () => {
    expect(priceSchema.parse("20,50")).toBe(2050);
    expect(priceSchema.safeParse("nope").success).toBe(false);
    const parsed = serviceInputSchema.parse({
      name: "Haircut",
      priceCents: "20",
      durationMinutes: "30",
      employeeIds: [],
      categoryId: "",
    });
    expect(parsed).toMatchObject({
      priceCents: 2000,
      durationMinutes: 30,
      categoryId: null,
      audience: "UNISEX",
      isActive: true,
      bufferAfterMinutes: 0,
    });
    expect(
      serviceInputSchema.safeParse({ name: "X", priceCents: "1", durationMinutes: 3 }).success,
    ).toBe(false);
  });
});
