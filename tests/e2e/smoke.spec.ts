import { expect, test } from "./fixtures";

test.describe("smoke", () => {
  test("health endpoint reports ok", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.data.status).toBe("ok");
    expect(body.data.db).toBe("ok");
    expect(response.headers()["x-request-id"]).toBeTruthy();
  });

  test("root redirects to the browser locale when supported", async ({ browser }) => {
    const context = await browser.newContext({ locale: "bs" });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page).toHaveURL(/\/bs$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Vaš salon");
    await context.close();
  });

  test("root falls back to the default locale for unsupported languages", async ({ browser }) => {
    const context = await browser.newContext({ locale: "de-DE" });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page).toHaveURL(/\/bs$/);
    await context.close();
  });

  test("english locale renders translated landing page", async ({ page }) => {
    await page.goto("/en");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Your salon");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });

  test("language switcher changes locale", async ({ page }) => {
    await page.goto("/bs");
    await page.getByLabel("Jezik").selectOption("en");
    await expect(page).toHaveURL(/\/en$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Your salon");
  });

  test("unknown page shows localized 404", async ({ page }) => {
    const response = await page.goto("/en/this-does-not-exist");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Page not found");
  });

  test("sends baseline security headers", async ({ request }) => {
    const response = await request.get("/en");
    const headers = response.headers();
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  });
});
