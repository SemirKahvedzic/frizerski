import { describe, expect, it } from "vitest";

import { ForbiddenError, UnauthenticatedError } from "@/lib/errors";
import { authorize, requireVerifiedEmail } from "@/modules/auth/authorize";
import {
  PERMISSIONS,
  SALON_ROLE_PERMISSIONS,
  can,
  isPlatformAdmin,
  roleFor,
} from "@/modules/auth/permissions";
import { ANONYMOUS, type Actor } from "@/modules/auth/types";

const SALON_A = "salon-a";
const SALON_B = "salon-b";

function actor(overrides: Partial<Actor> = {}): Actor {
  return {
    kind: "user",
    userId: "u1",
    email: "u1@test.local",
    name: "User One",
    emailVerified: true,
    isActive: true,
    locale: "bs",
    platformRole: null,
    memberships: [],
    ...overrides,
  };
}

describe("permission map", () => {
  it("anonymous visitors may only read public salon data", () => {
    for (const permission of PERMISSIONS) {
      expect(can(ANONYMOUS, permission, { salonId: SALON_A })).toBe(permission === "salon.read");
    }
  });

  it("owners have every salon permission, admins all but delete/manageAdmins, employees only their own bookings", () => {
    expect(SALON_ROLE_PERMISSIONS.OWNER.has("salon.delete")).toBe(true);
    expect(SALON_ROLE_PERMISSIONS.OWNER.has("membership.manageAdmins")).toBe(true);
    expect(SALON_ROLE_PERMISSIONS.ADMIN.has("salon.delete")).toBe(false);
    expect(SALON_ROLE_PERMISSIONS.ADMIN.has("membership.manageAdmins")).toBe(false);
    expect(SALON_ROLE_PERMISSIONS.ADMIN.has("employee.manage")).toBe(true);
    expect([...SALON_ROLE_PERMISSIONS.EMPLOYEE].sort()).toEqual(
      ["booking.completeOwn", "booking.readOwn", "salon.read"].sort(),
    );
    for (const role of ["OWNER", "ADMIN", "EMPLOYEE"] as const) {
      expect(SALON_ROLE_PERMISSIONS[role].has("platform.manage")).toBe(false);
    }
  });

  it("scopes salon permissions to the membership's salon", () => {
    const owner = actor({ memberships: [{ salonId: SALON_A, role: "OWNER", employeeId: null }] });
    expect(can(owner, "employee.manage", { salonId: SALON_A })).toBe(true);
    expect(can(owner, "employee.manage", { salonId: SALON_B })).toBe(false);
    expect(can(owner, "employee.manage")).toBe(false);
    expect(roleFor(owner, SALON_A)).toBe("OWNER");
    expect(roleFor(owner, SALON_B)).toBeNull();
  });

  it("employees cannot access admin functions", () => {
    const employee = actor({
      memberships: [{ salonId: SALON_A, role: "EMPLOYEE", employeeId: "e1" }],
    });
    expect(can(employee, "booking.readOwn", { salonId: SALON_A })).toBe(true);
    expect(can(employee, "booking.readAll", { salonId: SALON_A })).toBe(false);
    expect(can(employee, "service.manage", { salonId: SALON_A })).toBe(false);
    expect(can(employee, "settings.update", { salonId: SALON_A })).toBe(false);
  });

  it("super admins can do everything, in every salon", () => {
    const admin = actor({ platformRole: "SUPER_ADMIN" });
    expect(isPlatformAdmin(admin)).toBe(true);
    for (const permission of PERMISSIONS) {
      expect(can(admin, permission, { salonId: SALON_B })).toBe(true);
    }
    expect(can(actor(), "platform.manage")).toBe(false);
  });

  it("deactivated users lose every permission except public reads", () => {
    const inactive = actor({
      isActive: false,
      platformRole: "SUPER_ADMIN",
      memberships: [{ salonId: SALON_A, role: "OWNER", employeeId: null }],
    });
    expect(can(inactive, "salon.read")).toBe(true);
    expect(can(inactive, "salon.update", { salonId: SALON_A })).toBe(false);
    expect(can(inactive, "platform.manage")).toBe(false);
    expect(isPlatformAdmin(inactive)).toBe(false);
  });
});

describe("authorize", () => {
  it("throws 401 for anonymous and 403 for missing permission", () => {
    expect(() => authorize(ANONYMOUS, "booking.create", { salonId: SALON_A })).toThrow(
      UnauthenticatedError,
    );
    expect(() => authorize(actor(), "booking.create", { salonId: SALON_A })).toThrow(
      ForbiddenError,
    );
  });

  it("returns the narrowed actor on success", () => {
    const owner = actor({ memberships: [{ salonId: SALON_A, role: "OWNER", employeeId: null }] });
    expect(authorize(owner, "booking.create", { salonId: SALON_A })).toBe(owner);
  });

  it("requires a verified email for staff features", () => {
    expect(() => requireVerifiedEmail(actor({ emailVerified: false }))).toThrow(ForbiddenError);
    expect(requireVerifiedEmail(actor()).emailVerified).toBe(true);
  });
});
