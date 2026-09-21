import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { TENANT_MODELS, TENANT_ROOT_MODEL } from "@/modules/tenant/models";

/**
 * Guards the tenant model registry: every Prisma model that carries a
 * `salonId` column must be scoped by the tenant client. Forgetting to
 * register a new model would silently allow cross-tenant queries.
 */
function modelsWithSalonId(): string[] {
  const schema = readFileSync(path.resolve(process.cwd(), "prisma/schema.prisma"), "utf8");
  const models: string[] = [];
  const modelPattern = /model\s+(\w+)\s*\{([\s\S]*?)\n\}/g;
  let match: RegExpExecArray | null;
  while ((match = modelPattern.exec(schema)) !== null) {
    const [, name, body] = match;
    if (name && body && /^\s+salonId\s+String/m.test(body)) {
      models.push(name);
    }
  }
  return models.sort();
}

describe("tenant model registry", () => {
  it("covers every schema model with a salonId column", () => {
    const fromSchema = modelsWithSalonId();
    expect(fromSchema.length).toBeGreaterThan(0);
    expect([...TENANT_MODELS].sort()).toEqual(fromSchema);
  });

  it("does not list the root model as a tenant model", () => {
    expect(TENANT_MODELS).not.toContain(TENANT_ROOT_MODEL);
  });
});
