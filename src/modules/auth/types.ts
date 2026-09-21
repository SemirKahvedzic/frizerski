import type { PlatformRole, SalonRole } from "@/generated/prisma/enums";

export type Membership = {
  salonId: string;
  role: SalonRole;
  employeeId: string | null;
};

/** Authenticated principal carried through every request (docs/architecture.md §7). */
export type Actor = {
  kind: "user";
  userId: string;
  email: string;
  name: string;
  emailVerified: boolean;
  isActive: boolean;
  locale: string | null;
  platformRole: PlatformRole | null;
  memberships: Membership[];
};

export type AnonymousActor = { kind: "anonymous" };

export type Principal = Actor | AnonymousActor;

export const ANONYMOUS: AnonymousActor = { kind: "anonymous" };
