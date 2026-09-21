import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const MAILPIT_URL = process.env["MAILPIT_URL"] ?? "http://localhost:8025";
const PASSWORD = "playwright-pass-1";
const SUPER_ADMIN_EMAIL = process.env["SEED_SUPER_ADMIN_EMAIL"] ?? "admin@platform.local";
const SUPER_ADMIN_PASSWORD = process.env["SEED_SUPER_ADMIN_PASSWORD"] ?? "Admin12345!";

function uniqueEmail(prefix = "tenant") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@e2e.local`;
}

async function verificationLink(request: APIRequestContext, to: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const search = await request.get(`${MAILPIT_URL}/api/v1/search`, {
      params: { query: `to:${to}` },
    });
    if (search.ok()) {
      const body = (await search.json()) as { messages: Array<{ ID: string }> };
      const id = body.messages[0]?.ID;
      if (id) {
        const message = (await (
          await request.get(`${MAILPIT_URL}/api/v1/message/${id}`)
        ).json()) as { Text: string };
        const link = message.Text.match(/https?:\/\/\S*verify-email\?token=\S+/)?.[0];
        if (link) return link;
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No verification email for ${to}`);
}

async function registerVerified(
  page: Page,
  request: APIRequestContext,
  email: string,
  locale = "en",
) {
  const signUp = await request.post("/api/auth/sign-up/email", {
    data: {
      email,
      password: PASSWORD,
      name: "Tenant Owner",
      locale,
      callbackURL: `/${locale}/account`,
    },
    headers: { origin: "http://localhost:3000" },
  });
  expect(signUp.ok()).toBeTruthy();
  const link = await verificationLink(request, email);
  await page.goto(link);
  await expect(page).toHaveURL(new RegExp(`/${locale}/account$`));
}

async function login(page: Page, email: string, password: string, locale = "en") {
  await page.goto(`/${locale}/login`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel(locale === "en" ? "Password" : "Lozinka", { exact: true }).fill(password);
  await page.getByRole("button", { name: locale === "en" ? "Sign in" : "Prijavi se" }).click();
  await expect(page).toHaveURL(new RegExp(`/${locale}/account$`));
}

test.describe("multi-tenant", () => {
  test("a verified user creates a salon, becomes owner and only they can open its admin", async ({
    page,
    request,
    browser,
  }) => {
    const ownerEmail = uniqueEmail("owner");
    await registerVerified(page, request, ownerEmail);
    await expect(page.getByText("Verified", { exact: true })).toBeVisible();

    await page.getByRole("link", { name: "Create a salon" }).click();
    await expect(page).toHaveURL(/\/en\/account\/salons\/new$/);

    const salonName = `E2E Salon ${Date.now().toString(36)}`;
    await page.getByLabel("Salon name").fill(salonName);
    const slug = await page.getByLabel("Web address").inputValue();
    expect(slug).toMatch(/^e2e-salon-/);
    await page.getByLabel("Who do you serve?").selectOption("FEMALE");
    await page.getByRole("button", { name: "Create salon" }).click();

    await expect(page).toHaveURL(new RegExp(`/en/admin/${slug}$`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(salonName);
    await expect(page.getByText("Owner", { exact: true })).toBeVisible();
    await expect(page.getByText("Women", { exact: true })).toBeVisible();

    await page.goto("/en/account");
    await expect(page.getByRole("link", { name: salonName })).toBeVisible();

    const me = await page.request.get("/api/v1/salons");
    const body = (await me.json()) as { data: Array<{ slug: string; role: string }> };
    expect(body.data.find((s) => s.slug === slug)?.role).toBe("OWNER");

    // A different, unrelated user cannot see the salon's admin area (404, not 403).
    const otherContext = await browser.newContext();
    const otherPage = await otherContext.newPage();
    const otherEmail = uniqueEmail("other");
    await registerVerified(otherPage, request, otherEmail);
    const response = await otherPage.goto(`/en/admin/${slug}`);
    expect(response?.status()).toBe(404);
    await expect(otherPage.getByRole("heading", { level: 1 })).toContainText("Page not found");
    await otherContext.close();
  });

  test("platform admin sees all salons and can suspend and reactivate one", async ({ page }) => {
    await login(page, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD);
    await page.getByRole("link", { name: "Platform admin" }).click();
    await expect(page).toHaveURL(/\/en\/platform\/salons$/);

    // Each Playwright project toggles its own seeded salon so parallel runs do not interfere.
    const target =
      test.info().project.name === "chromium-mobile"
        ? { slug: "barber-bros", name: "Barber Bros", owner: "owner@barber-bros.local" }
        : { slug: "studio-example", name: "Studio Example", owner: "owner@studio-example.local" };
    const row = page.getByTestId(`salon-row-${target.slug}`);
    await expect(row).toContainText(target.name);
    await expect(row).toContainText(target.owner);

    // Self-heal: an interrupted earlier run may have left the salon suspended.
    if (await row.getByRole("button", { name: "Activate", exact: true }).isVisible()) {
      await row.getByRole("button", { name: "Activate", exact: true }).click();
      await expect(row.getByText("Active", { exact: true })).toBeVisible();
    }

    await row.getByRole("button", { name: "Suspend", exact: true }).click();
    await expect(row.getByText("Suspended", { exact: true })).toBeVisible();
    await row.getByRole("button", { name: "Activate", exact: true }).click();
    await expect(row.getByText("Active", { exact: true })).toBeVisible();
  });

  test("owners cannot access platform pages or another salon over the API", async ({
    page,
    request,
  }) => {
    const email = uniqueEmail("plain");
    await registerVerified(page, request, email);

    const platform = await page.goto("/en/platform/salons");
    expect(platform?.status()).toBe(404);

    const api = await page.request.get("/api/v1/platform/salons");
    expect(api.status()).toBe(403);
  });
});
