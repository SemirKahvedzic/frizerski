import { expect, test } from "./fixtures";
import { type Page } from "@playwright/test";

const PASSWORD = process.env["SEED_OWNER_PASSWORD"] ?? "Owner12345!";

async function loginAsAmina(page: Page) {
  await page.goto("/en/login");
  await page.getByLabel("Email").fill("amina@example.com");
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/account$/);
}

test.describe("client dashboard", () => {
  test("shows the next appointment, lists upcoming bookings and lets the client manage them", async ({
    page,
  }) => {
    await loginAsAmina(page);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Amina");
    const next = page.getByTestId("next-booking");
    await expect(next).toContainText("Šišanje");
    await expect(next).toContainText("Studio Example");

    await page.getByTestId("account-nav-bookings").click();
    await expect(page).toHaveURL(/\/en\/account\/bookings/);
    const upcoming = page.getByTestId("bookings-upcoming");
    await expect(upcoming.locator('[data-testid^="booking-card-"]').first()).toBeVisible();
    await expect(upcoming).toContainText("Confirmed");
    await expect(upcoming.getByRole("button", { name: "Move appointment" }).first()).toBeVisible();

    await page.getByTestId("bookings-tab-cancelled").click();
    await expect(page.getByTestId("bookings-cancelled")).toBeVisible();
  });

  test("client updates profile phone", async ({ page }, testInfo) => {
    await loginAsAmina(page);
    await page.getByTestId("account-nav-profile").click();
    await expect(page).toHaveURL(/\/en\/account\/profile$/);
    const phone =
      testInfo.project.name === "chromium-mobile" ? "+387 61 111 333" : "+387 61 111 222";
    await page.getByLabel("Phone").fill(phone);
    await page.getByTestId("profile-save").click();
    await expect(page.locator('[data-slot="alert"]')).toContainText("Saved.");
    await page.reload();
    await expect(page.getByLabel("Phone")).toHaveValue(/\+387 61 111/);
  });

  test("client saves notification preferences", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "chromium-mobile", "single writer for shared seed user");
    await loginAsAmina(page);
    await page.goto("/en/account/notifications");
    const reminder1h = page.getByTestId("pref-reminder1h");
    const before = (await reminder1h.getAttribute("aria-checked")) === "true";
    await reminder1h.click();
    await page.getByTestId("preferences-save").click();
    await expect(page.locator('[data-slot="alert"]')).toContainText("Saved.");
    await page.reload();
    await expect(page.getByTestId("pref-reminder1h")).toHaveAttribute(
      "aria-checked",
      before ? "false" : "true",
    );
    // Restore so repeated runs stay deterministic.
    await page.getByTestId("pref-reminder1h").click();
    await page.getByTestId("preferences-save").click();
    await expect(page.locator('[data-slot="alert"]')).toContainText("Saved.");
  });
});
