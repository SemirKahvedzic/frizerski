import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { disconnectPrisma, prisma } from "@/lib/db";
import { getAuth } from "@/modules/auth/auth";
import { can } from "@/modules/auth/permissions";
import { resolveActorFromHeaders, resolveActorFromRequest } from "@/modules/auth/session";
import { FakeEmailProvider, setEmailProvider } from "@/modules/notifications";

const emails = new FakeEmailProvider();
const TEST_DOMAIN = "@auth-test.local";
const PASSWORD = "correct-horse-battery";

function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}${TEST_DOMAIN}`;
}

function cookieHeaderFrom(response: Response): string {
  return response.headers
    .getSetCookie()
    .map((c) => c.split(";")[0] ?? "")
    .filter(Boolean)
    .join("; ");
}

async function cleanup() {
  await prisma.user.deleteMany({ where: { email: { endsWith: TEST_DOMAIN } } });
  await prisma.salon.deleteMany({ where: { slug: { startsWith: "auth-test-" } } });
}

describe("authentication", () => {
  beforeAll(async () => {
    setEmailProvider(emails);
    await cleanup();
  });
  beforeEach(() => emails.reset());
  afterAll(async () => {
    await cleanup();
    setEmailProvider(undefined);
    await disconnectPrisma();
  });

  it("signs up with email/password, sends a localized verification email and creates a session", async () => {
    const auth = getAuth();
    const email = uniqueEmail("signup");

    const response = await auth.api.signUpEmail({
      body: {
        email,
        password: PASSWORD,
        name: "Ana Anić",
        firstName: "Ana",
        lastName: "Anić",
        locale: "bs",
        callbackURL: "/bs/account",
      },
      asResponse: true,
    });
    expect(response.status).toBe(200);

    const verification = emails.lastTo(email);
    expect(verification).toBeDefined();
    expect(verification?.subject).toContain("Potvrdite email");
    expect(verification?.text).toContain("/api/auth/verify-email?token=");
    expect(verification?.tags?.["type"]).toBe("auth.verify-email");

    const actor = await resolveActorFromRequest(
      new NextRequest("http://localhost:3000/api/v1/me", {
        headers: { cookie: cookieHeaderFrom(response) },
      }),
    );
    expect(actor).toMatchObject({
      kind: "user",
      email,
      name: "Ana Anić",
      emailVerified: false,
      platformRole: null,
      memberships: [],
    });

    const stored = await prisma.user.findUnique({ where: { email } });
    expect(stored).toMatchObject({
      firstName: "Ana",
      lastName: "Anić",
      locale: "bs",
      isActive: true,
    });
    const account = await prisma.account.findFirst({ where: { userId: stored!.id } });
    expect(account?.providerId).toBe("credential");
    expect(account?.password).not.toContain(PASSWORD);
  });

  it("rejects wrong passwords and duplicate sign-ups", async () => {
    const auth = getAuth();
    const email = uniqueEmail("dupe");
    await auth.api.signUpEmail({ body: { email, password: PASSWORD, name: "Dupe User" } });

    const wrong = await auth.api.signInEmail({
      body: { email, password: "wrong-password" },
      asResponse: true,
    });
    expect(wrong.status).toBe(401);

    const duplicate = await auth.api.signUpEmail({
      body: { email, password: PASSWORD, name: "Dupe Again" },
      asResponse: true,
    });
    expect(duplicate.status).toBe(422);
  });

  it("resets the password through an emailed token and revokes old sessions", async () => {
    const auth = getAuth();
    const email = uniqueEmail("reset");
    const signUp = await auth.api.signUpEmail({
      body: { email, password: PASSWORD, name: "Reset User", locale: "en" },
      asResponse: true,
    });
    const oldCookie = cookieHeaderFrom(signUp);
    emails.reset();

    await auth.api.requestPasswordReset({ body: { email, redirectTo: "/en/reset-password" } });
    const mail = emails.lastTo(email);
    expect(mail?.subject).toContain("Reset your");
    const token = mail?.text.match(/reset-password\/([^?\s]+)/)?.[1];
    expect(token).toBeTruthy();

    const newPassword = "brand-new-password-1";
    const reset = await auth.api.resetPassword({
      body: { token: token!, newPassword },
      asResponse: true,
    });
    expect(reset.status).toBe(200);

    const oldActor = await resolveActorFromHeaders(new Headers({ cookie: oldCookie }));
    expect(oldActor).toBeNull();

    const signIn = await auth.api.signInEmail({
      body: { email, password: newPassword },
      asResponse: true,
    });
    expect(signIn.status).toBe(200);
  });

  it("treats deactivated users as signed out", async () => {
    const auth = getAuth();
    const email = uniqueEmail("inactive");
    const response = await auth.api.signUpEmail({
      body: { email, password: PASSWORD, name: "Inactive User" },
      asResponse: true,
    });
    const cookie = cookieHeaderFrom(response);

    expect(await resolveActorFromHeaders(new Headers({ cookie }))).not.toBeNull();

    // Deactivation takes effect on the very next request, even with a live session.
    await prisma.user.update({ where: { email }, data: { isActive: false } });
    expect(await resolveActorFromHeaders(new Headers({ cookie }))).toBeNull();
  });

  it("loads salon memberships into the actor and enforces them", async () => {
    const auth = getAuth();
    const email = uniqueEmail("member");
    const response = await auth.api.signUpEmail({
      body: { email, password: PASSWORD, name: "Owner User" },
      asResponse: true,
    });
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const salon = await prisma.salon.create({
      data: { slug: `auth-test-${Date.now()}`, name: "Auth Test Salon" },
    });
    await prisma.salonMembership.create({
      data: { userId: user.id, salonId: salon.id, role: "ADMIN" },
    });

    const actor = await resolveActorFromHeaders(
      new Headers({ cookie: cookieHeaderFrom(response) }),
    );
    expect(actor?.memberships).toEqual([{ salonId: salon.id, role: "ADMIN", employeeId: null }]);
    expect(can(actor!, "employee.manage", { salonId: salon.id })).toBe(true);
    expect(can(actor!, "salon.delete", { salonId: salon.id })).toBe(false);
    expect(can(actor!, "employee.manage", { salonId: "another-salon" })).toBe(false);
  });

  it("returns null for anonymous requests", async () => {
    expect(await resolveActorFromHeaders(new Headers())).toBeNull();
  });
});
