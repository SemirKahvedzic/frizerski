import { describe, expect, it } from "vitest";

import { TenantScopeError, scopeArgs } from "@/modules/tenant/scope";

const A = "salon-a";
const B = "salon-b";

describe("scopeArgs (tenant model)", () => {
  it("adds salonId to every where-based operation", () => {
    for (const op of [
      "findMany",
      "findFirst",
      "findUnique",
      "count",
      "aggregate",
      "groupBy",
      "deleteMany",
      "delete",
    ]) {
      const out = scopeArgs("SalonMembership", op, { where: { role: "OWNER" } }, A);
      expect(out["where"]).toEqual({ role: "OWNER", salonId: A });
    }
    expect(scopeArgs("SalonMembership", "findMany", undefined, A)).toEqual({
      where: { salonId: A },
    });
  });

  it("injects salonId into create data and rejects relation-style salon connects", () => {
    expect(scopeArgs("SalonMembership", "create", { data: { userId: "u" } }, A)).toEqual({
      data: { userId: "u", salonId: A },
    });
    expect(() =>
      scopeArgs("SalonMembership", "create", { data: { salon: { connect: { id: B } } } }, A),
    ).toThrow(TenantScopeError);
  });

  it("scopes createMany rows and upsert branches", () => {
    const many = scopeArgs(
      "SalonMembership",
      "createMany",
      { data: [{ userId: "u1" }, { userId: "u2" }] },
      A,
    );
    expect(many["data"]).toEqual([
      { userId: "u1", salonId: A },
      { userId: "u2", salonId: A },
    ]);

    const upsert = scopeArgs(
      "SalonMembership",
      "upsert",
      { where: { id: "m1" }, create: { userId: "u" }, update: { role: "ADMIN" } },
      A,
    );
    expect(upsert).toEqual({
      where: { id: "m1", salonId: A },
      create: { userId: "u", salonId: A },
      update: { role: "ADMIN" },
    });
  });

  it("keeps update data untouched but scopes its where", () => {
    const out = scopeArgs(
      "SalonMembership",
      "update",
      { where: { id: "m1" }, data: { role: "ADMIN" } },
      A,
    );
    expect(out).toEqual({ where: { id: "m1", salonId: A }, data: { role: "ADMIN" } });
  });

  it("rejects any explicit reference to another tenant", () => {
    expect(() => scopeArgs("SalonMembership", "findMany", { where: { salonId: B } }, A)).toThrow(
      TenantScopeError,
    );
    expect(() => scopeArgs("SalonMembership", "create", { data: { salonId: B } }, A)).toThrow(
      TenantScopeError,
    );
    expect(() =>
      scopeArgs("SalonMembership", "update", { where: { id: "x" }, data: { salonId: B } }, A),
    ).toThrow(TenantScopeError);
    expect(() =>
      scopeArgs("SalonMembership", "upsert", { where: {}, create: {}, update: { salonId: B } }, A),
    ).toThrow(TenantScopeError);
  });

  it("allows the same tenant to be stated explicitly", () => {
    expect(scopeArgs("SalonMembership", "findMany", { where: { salonId: A } }, A)).toEqual({
      where: { salonId: A },
    });
  });

  it("refuses non-tenant models entirely", () => {
    expect(() => scopeArgs("User", "findMany", {}, A)).toThrow(TenantScopeError);
    expect(() => scopeArgs("Session", "deleteMany", {}, A)).toThrow(TenantScopeError);
  });
});

describe("scopeArgs (Salon root)", () => {
  it("pins reads and updates to the tenant's own salon", () => {
    expect(scopeArgs("Salon", "findUnique", { where: { id: A } }, A)).toEqual({ where: { id: A } });
    expect(scopeArgs("Salon", "findFirst", { where: { status: "ACTIVE" } }, A)).toEqual({
      where: { status: "ACTIVE", id: A },
    });
    expect(
      scopeArgs("Salon", "update", { where: { id: A }, data: { name: "x" } }, A)["where"],
    ).toEqual({ id: A });
    expect(() => scopeArgs("Salon", "findUnique", { where: { id: B } }, A)).toThrow(
      TenantScopeError,
    );
  });

  it("forbids creating or deleting salons through a tenant client", () => {
    for (const op of ["create", "delete", "deleteMany", "updateMany", "upsert", "createMany"]) {
      expect(() => scopeArgs("Salon", op, {}, A)).toThrow(TenantScopeError);
    }
  });
});
