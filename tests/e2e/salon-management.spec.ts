import { expect, test } from "./fixtures";
import { type Page } from "@playwright/test";

const OWNER_PASSWORD = process.env["SEED_OWNER_PASSWORD"] ?? "Owner12345!";

// Each Playwright project edits its own seeded salon so parallel runs never collide.
let SLUG = "barber-bros";
let OWNER_EMAIL = "owner@barber-bros.local";
let SALON_NAME = "Barber Bros";

test.beforeEach(({}, testInfo) => {
  const mobile = testInfo.project.name === "chromium-mobile";
  SLUG = mobile ? "studio-example" : "barber-bros";
  OWNER_EMAIL = mobile ? "owner@studio-example.local" : "owner@barber-bros.local";
  SALON_NAME = mobile ? "Studio Example" : "Barber Bros";
});

async function loginAsOwner(page: Page) {
  await page.goto("/en/login");
  await page.getByLabel("Email").fill(OWNER_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(OWNER_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/account$/);
}

test.describe("salon management", () => {
  test.describe.configure({ mode: "serial" });

  test("owner edits the profile and the public page reflects it immediately", async ({ page }) => {
    await loginAsOwner(page);
    await page.goto(`/en/admin/${SLUG}/salon`);
    await expect(page.getByRole("heading", { level: 1, name: "Salon profile" })).toBeVisible();

    const marker = `E2E ${Date.now().toString(36)}`;
    const description = `Salon description edited by E2E. ${marker}`;
    await page.getByLabel("Description").fill(description);
    await page.getByLabel("Phone").fill("+387 61 999 000");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.locator('[data-slot="alert"]')).toContainText("Saved.");

    const publicPage = await page.context().newPage();
    await publicPage.goto(`/en/salon/${SLUG}`);
    await expect(publicPage.getByTestId("salon-description")).toContainText(marker);
    await expect(publicPage.getByTestId("salon-phone")).toHaveText("+387 61 999 000");
    await expect(publicPage.getByRole("heading", { level: 1 })).toHaveText(SALON_NAME);
    await publicPage.close();
  });

  test("owner closes Wednesday and adds a closure; both appear publicly", async ({ page }) => {
    await loginAsOwner(page);
    await page.goto(`/en/admin/${SLUG}/working-hours`);

    const wednesday = page.getByTestId("hours-wed");
    const checkbox = wednesday.getByRole("checkbox");
    if (await checkbox.isChecked()) {
      await checkbox.uncheck();
    }
    await page.getByRole("button", { name: "Save hours" }).click();
    await expect(page.locator('[data-slot="alert"]').first()).toContainText("Saved.");

    // Add a closure far in the future so it never collides with "today".
    const reason = `E2E holidays ${Date.now().toString(36)}`;
    const start = "2030-12-24";
    const end = "2030-12-26";
    await page.getByLabel("From").fill(start);
    await page.getByLabel("To").fill(end);
    await page.getByLabel("Reason (optional)").fill(reason);
    await page.getByRole("button", { name: "Add closure" }).click();
    await expect(page.getByTestId("closure-row").filter({ hasText: reason })).toBeVisible();

    await page.goto(`/en/salon/${SLUG}`);
    await expect(page.getByTestId("public-hours-wed")).toContainText("Closed");
    await expect(page.getByTestId("closures")).toContainText(reason);

    // Restore: reopen Wednesday and remove the closure.
    await page.goto(`/en/admin/${SLUG}/working-hours`);
    await page.getByTestId("hours-wed").getByRole("checkbox").check();
    await page.getByRole("button", { name: "Save hours" }).click();
    await expect(page.locator('[data-slot="alert"]').first()).toContainText("Saved.");
    const row = page.getByTestId("closure-row").filter({ hasText: reason });
    await row.getByRole("button", { name: "Remove closure" }).click();
    await expect(row).toHaveCount(0);
  });

  test("owner changes booking settings", async ({ page }) => {
    await loginAsOwner(page);
    await page.goto(`/en/admin/${SLUG}/settings`);
    await page.getByLabel("Cancellation cutoff").fill("6");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.locator('[data-slot="alert"]')).toContainText("Saved.");

    await page.goto(`/en/salon/${SLUG}`);
    await expect(page.getByText("Free cancellation up to 6 hours")).toBeVisible();

    await page.goto(`/en/admin/${SLUG}/settings`);
    await page.getByLabel("Cancellation cutoff").fill("12");
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.locator('[data-slot="alert"]')).toContainText("Saved.");
  });

  test("admin navigation is reachable on mobile through the menu sheet", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "mobile only");
    await loginAsOwner(page);
    await page.goto(`/en/admin/${SLUG}`);
    await page.getByRole("button", { name: "Open menu" }).click();
    await page.getByRole("link", { name: "Working hours" }).click();
    await expect(page).toHaveURL(new RegExp(`/en/admin/${SLUG}/working-hours$`));
  });

  test("unknown or inactive salons are not public", async ({ page }) => {
    const response = await page.goto("/en/salon/does-not-exist");
    expect(response?.status()).toBe(404);
  });
});
