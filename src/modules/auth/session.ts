import { headers } from "next/headers";
import type { NextRequest } from "next/server";

import type { PlatformRole } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { getAuth } from "@/modules/auth/auth";
import { ANONYMOUS, type Actor, type Principal } from "@/modules/auth/types";

type SessionUser = {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  locale?: string | null;
  platformRole?: string | null;
  isActive?: boolean | null;
};

async function loadMemberships(userId: string) {
  return prisma.salonMembership.findMany({
    where: { userId },
    select: { salonId: true, role: true, employeeId: true },
  });
}

export async function toActor(user: SessionUser): Promise<Actor> {
  return {
    kind: "user",
    userId: user.id,
    email: user.email,
    name: user.name,
    emailVerified: user.emailVerified,
    isActive: user.isActive ?? true,
    locale: user.locale ?? null,
    platformRole: (user.platformRole as PlatformRole | null | undefined) ?? null,
    memberships: await loadMemberships(user.id),
  };
}

/**
 * Resolves the actor from request headers (cookie or bearer). Deactivated
 * users resolve to `null` so every guard treats them as signed out.
 */
export async function resolveActorFromHeaders(requestHeaders: Headers): Promise<Actor | null> {
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  if (!session) return null;
  const user = session.user as SessionUser;
  if (user.isActive === false) return null;
  return toActor(user);
}

/** Adapter for `defineRoute({ resolveActor })`. */
export function resolveActorFromRequest(request: NextRequest): Promise<Actor | null> {
  return resolveActorFromHeaders(request.headers);
}

/** For React Server Components and Server Actions. */
export async function getCurrentActor(): Promise<Actor | null> {
  return resolveActorFromHeaders(await headers());
}

export async function getCurrentPrincipal(): Promise<Principal> {
  return (await getCurrentActor()) ?? ANONYMOUS;
}
