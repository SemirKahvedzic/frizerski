import { expect, test } from "./fixtures";
import { type Page } from "@playwright/test";

const OWNER_PASSWORD = process.env["SEED_OWNER_PASSWORD"] ?? "Owner12345!";

let SLUG = "barber-bros";
let OWNER_EMAIL = "owner@barber-bros.local";

test.beforeEach(({}, testInfo) => {
  const mobile = testInfo.project.name === "chromium-mobile";
  SLUG = mobile ? "studio-example" : "barber-bros";
  OWNER_EMAIL = mobile ? "owner@studio-example.local" : "owner@barber-bros.local";
});

async function loginAsOwner(page: Page) {
  await page.goto("/en/login");
  await page.getByLabel("Email").fill(OWNER_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(OWNER_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/account$/);
}

test.describe("services", () => {
  test("owner adds a category and a service with a provider; it shows on the public price list", async ({
    page,
  }) => {
    await loginAsOwner(page);
    await page.goto(`/en/admin/${SLUG}/services`);

    const category = `E2E Cat ${Date.now().toString(36)}`;
    await page.getByLabel("Category name").fill(category);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByText(category)).toBeVisible();

    await page.getByRole("link", { name: "New service" }).first().click();
    const serviceName = `E2E Service ${Date.now().toString(36)}`;
    await page.getByLabel("Service name").fill(serviceName);
    await page.getByLabel("Category").selectOption({ label: category });
    await page.getByLabel(/Price/).fill("33,50");
    await page.getByLabel("Duration").selectOption("45");
    const firstProvider = page.getByRole("checkbox").first();
    await firstProvider.check();
    await page.getByRole("button", { name: "Create service" }).click();

    await expect(page).toHaveURL(new RegExp(`/en/admin/${SLUG}/services$`));
    const row = page.locator('[data-testid^="service-row-"]').filter({ hasText: serviceName });
    await expect(row).toBeVisible();
    await expect(row).toContainText("33.50");
    await expect(row).toContainText("45 min");

    await page.goto(`/en/salon/${SLUG}`);
    const priceList = page.getByTestId("price-list");
    await expect(priceList).toContainText(serviceName);
    await expect(priceList).toContainText(category);
    await expect(priceList).toContainText("33.50");

    // Deactivate: disappears from the public list, stays in admin.
    await page.goto(`/en/admin/${SLUG}/services`);
    await row.getByRole("switch").click();
    await expect(row).toContainText("Inactive");
    await page.goto(`/en/salon/${SLUG}`);
    await expect(page.getByTestId("price-list")).not.toContainText(serviceName);

    // Clean up: delete the service and the category.
    await page.goto(`/en/admin/${SLUG}/services`);
    await row.getByRole("button", { name: `Delete ${serviceName}` }).click();
    await expect(row).toHaveCount(0);
    await page.getByRole("button", { name: `Delete ${category}` }).click();
    await expect(page.getByText(category)).toHaveCount(0);
  });

  test("seeded price list is visible to anonymous visitors", async ({ page }) => {
    await page.goto("/bs/salon/studio-example");
    const list = page.getByTestId("price-list");
    await expect(list).toContainText("Šišanje");
    await expect(list).toContainText("Bojenje");
    await expect(list).toContainText("2 h");
    await expect(page.getByTestId("public-team")).toContainText("Marko");
  });
});
