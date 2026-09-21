import { afterAll, describe, expect, it } from "vitest";

import { disconnectPrisma, pingDatabase, prisma } from "@/lib/db";

describe("database connectivity", () => {
  afterAll(async () => {
    await disconnectPrisma();
  });

  it("connects to the test database", async () => {
    expect(await pingDatabase()).toBe(true);
  });

  it("has the required extensions installed by the initial migration", async () => {
    const rows = await prisma.$queryRaw<{ extname: string }[]>`
      SELECT extname FROM pg_extension WHERE extname IN ('btree_gist', 'pgcrypto') ORDER BY extname
    `;
    expect(rows.map((r) => r.extname)).toEqual(["btree_gist", "pgcrypto"]);
  });

  it("can read and write platform settings", async () => {
    await prisma.platformSetting.upsert({
      where: { key: "test.key" },
      update: { value: { ok: true } },
      create: { key: "test.key", value: { ok: true } },
    });
    const row = await prisma.platformSetting.findUnique({ where: { key: "test.key" } });
    expect(row?.value).toEqual({ ok: true });
    await prisma.platformSetting.delete({ where: { key: "test.key" } });
  });
});
