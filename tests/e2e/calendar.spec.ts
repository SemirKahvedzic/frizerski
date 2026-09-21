import { expect, test } from "./fixtures";
import { type Page } from "@playwright/test";

const OWNER_PASSWORD = process.env["SEED_OWNER_PASSWORD"] ?? "Owner12345!";

async function loginAsStudioOwner(page: Page) {
  await page.goto("/en/login");
  await page.getByLabel("Email").fill("owner@studio-example.local");
  await page.getByLabel("Password", { exact: true }).fill(OWNER_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/account$/);
}

function nextMonday(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 2);
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

test.describe("calendar", () => {
  test("shows seeded bookings in week and day views, opens the drawer and switches to month", async ({
    page,
  }) => {
    await loginAsStudioOwner(page);
    const monday = nextMonday();
    await page.goto(`/en/admin/studio-example/calendar?view=week&date=${monday}`);
    await expect(page.getByTestId("calendar-week")).toBeVisible();
    const amina = page
      .locator('[data-testid^="calendar-booking-"]')
      .filter({ hasText: "Amina Hodžić" })
      .first();
    await expect(amina).toBeVisible();

    await amina.click();
    const drawer = page.getByTestId("booking-drawer");
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText("Šišanje");
    await expect(drawer).toContainText("amina@example.com");
    await page.keyboard.press("Escape");

    await page.getByRole("tab", { name: "Day" }).click();
    await expect(page).toHaveURL(/view=day/);
    await expect(page.getByTestId("calendar-day")).toBeVisible();
    await expect(page.getByTestId("calendar-day")).toContainText("Marko Marić");

    await page.getByRole("tab", { name: "Month" }).click();
    await expect(page.getByTestId("calendar-month")).toBeVisible();
    await expect(page.getByTestId("calendar-month")).toContainText("Amina");
  });

  test("owner creates a walk-in booking from the calendar and completes it later", async ({
    page,
  }, testInfo) => {
    await loginAsStudioOwner(page);
    const monday = nextMonday();
    await page.goto(`/en/admin/studio-example/calendar?view=day&date=${monday}`);
    await page.getByTestId("new-booking").click();
    const sheet = page.getByTestId("new-booking-sheet");
    await expect(sheet).toBeVisible();

    await sheet.getByLabel("Employee").selectOption({
      label: testInfo.project.name === "chromium-mobile" ? "Sara Sarić" : "Marko Marić",
    });
    const slots = page.getByTestId("new-booking-slots").locator("button");
    await expect(slots.first()).toBeVisible();
    // Pick a late slot to avoid colliding with seeded bookings.
    await slots.last().click();
    const lastName = `Walkin-${testInfo.project.name}-${Date.now().toString(36)}`;
    await sheet.getByLabel("First name").fill("Test");
    await sheet.getByLabel("Last name").fill(lastName);
    await sheet.getByLabel("Email").fill(`${lastName.toLowerCase()}@e2e.local`);
    await sheet.getByLabel("Source").selectOption("WALK_IN");
    await page.getByTestId("new-booking-submit").click();

    const created = page
      .locator('[data-testid^="calendar-booking-"]')
      .filter({ hasText: lastName });
    await expect(created).toBeVisible({ timeout: 15_000 });

    await created.click();
    const drawer = page.getByTestId("booking-drawer");
    await expect(drawer).toContainText("Walk-in");
    await drawer.getByTestId("drawer-action-CANCELLED").click();
    await expect(drawer).toContainText("Status updated.");
  });
});
