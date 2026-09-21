import { expect, test } from "./fixtures";
import { type APIRequestContext } from "@playwright/test";

const MAILPIT_URL = process.env["MAILPIT_URL"] ?? "http://localhost:8025";
const PASSWORD = "playwright-pass-1";

function uniqueEmail() {
  return `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@e2e.local`;
}

async function findMailpitMessage(request: APIRequestContext, to: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await request.get(`${MAILPIT_URL}/api/v1/search`, {
      params: { query: `to:${to}` },
    });
    if (response.ok()) {
      const body = (await response.json()) as { messages: Array<{ Subject: string; ID: string }> };
      if (body.messages.length > 0) return body.messages[0];
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

test.describe("authentication", () => {
  test("register, receive verification email, sign out and sign back in", async ({
    page,
    request,
  }) => {
    const email = uniqueEmail();

    await page.goto("/bs/register");
    await page.getByLabel("Ime", { exact: true }).fill("Ana");
    await page.getByLabel("Prezime").fill("Testić");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Lozinka", { exact: true }).fill(PASSWORD);
    await page.getByLabel("Potvrdi lozinku").fill(PASSWORD);
    await page.getByRole("button", { name: "Napravi nalog" }).click();

    await expect(page).toHaveURL(/\/bs\/verify-email\?email=/);
    await expect(page.getByRole("heading", { level: 1, name: "Provjerite inbox" })).toBeVisible();

    const message = await findMailpitMessage(request, email);
    expect(message, "verification email should reach Mailpit").not.toBeNull();
    expect(message?.Subject).toContain("Potvrdite email");

    await page.getByRole("link", { name: "Nastavi na moj nalog" }).click();
    await expect(page).toHaveURL(/\/bs\/account$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Zdravo, Ana Testić");
    await expect(page.getByText("Nije potvrđen", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Odjava" }).click();
    await expect(page).toHaveURL(/\/bs$/);
    await expect(page.getByRole("link", { name: "Prijava" })).toBeVisible();

    await page.goto("/bs/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Lozinka").fill("wrong-password");
    await page.getByRole("button", { name: "Prijavi se" }).click();
    await expect(page.locator('[data-slot="alert"]')).toContainText("Neispravan email ili lozinka");

    await page.getByLabel("Lozinka").fill(PASSWORD);
    await page.getByRole("button", { name: "Prijavi se" }).click();
    await expect(page).toHaveURL(/\/bs\/account$/);
  });

  test("protected pages redirect anonymous visitors to login and back after signing in", async ({
    page,
  }) => {
    await page.goto("/en/account");
    await expect(page).toHaveURL(/\/en\/login\?next=%2Fen%2Faccount$/);
    await expect(page.getByRole("heading", { level: 1, name: "Welcome back" })).toBeVisible();
  });

  test("password reset link from the email sets a new password", async ({ page, request }) => {
    const email = uniqueEmail();
    const signUp = await request.post("/api/auth/sign-up/email", {
      data: { email, password: PASSWORD, name: "Reset Person", locale: "en" },
      headers: { origin: "http://localhost:3000" },
    });
    expect(signUp.ok()).toBeTruthy();

    await page.goto("/en/forgot-password");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.locator('[data-slot="alert"]')).toContainText("a reset link is on its way");

    const message = await findMailpitMessage(request, email);
    const reset = (await (
      await request.get(`${MAILPIT_URL}/api/v1/message/${message!.ID}`)
    ).json()) as {
      Text: string;
    };
    const link = reset.Text.match(/https?:\/\/\S*reset-password\/\S+/)?.[0];
    expect(link).toBeTruthy();

    await page.goto(link!);
    await expect(page).toHaveURL(/\/en\/reset-password\?token=/);
    await page.getByLabel("New password").fill("another-strong-pass-2");
    await page.getByLabel("Confirm password").fill("another-strong-pass-2");
    await page.getByRole("button", { name: "Set new password" }).click();
    await expect(page.locator('[data-slot="alert"]')).toContainText(
      "Your password has been updated",
    );

    await page.getByRole("link", { name: "Go to sign in" }).click();
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("another-strong-pass-2");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/en\/account$/);
  });

  test("/api/v1/me returns 401 without a session", async ({ request }) => {
    const response = await request.get("/api/v1/me");
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error.code).toBe("UNAUTHENTICATED");
  });
});
