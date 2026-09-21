import { describe, expect, it } from "vitest";

import { isValidSlug, slugify, uniqueSlug } from "@/lib/slug";

describe("slugify", () => {
  it("handles Bosnian diacritics and punctuation", () => {
    expect(slugify("Frizerski salon Đurđević")).toBe("frizerski-salon-djurdjevic");
    expect(slugify("  Čačak & Šiš   Žur!  ")).toBe("cacak-sis-zur");
    expect(slugify("Studio Example")).toBe("studio-example");
  });

  it("truncates to the maximum length without a trailing dash", () => {
    const long = slugify("a".repeat(30) + " " + "b".repeat(40));
    expect(long.length).toBeLessThanOrEqual(60);
    expect(long.endsWith("-")).toBe(false);
  });

  it("validates slugs", () => {
    expect(isValidSlug("studio-example")).toBe(true);
    expect(isValidSlug("Studio")).toBe(false);
    expect(isValidSlug("-bad")).toBe(false);
    expect(isValidSlug("a")).toBe(true);
  });
});

describe("uniqueSlug", () => {
  it("appends a counter until the slug is free", async () => {
    const taken = new Set(["studio", "studio-2"]);
    expect(await uniqueSlug("studio", async (s) => taken.has(s))).toBe("studio-3");
    expect(await uniqueSlug("fresh", async () => false)).toBe("fresh");
    expect(await uniqueSlug("", async () => false)).toBe("salon");
  });
});
