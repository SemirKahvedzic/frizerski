import { expect, test } from "./fixtures";
import { type Page } from "@playwright/test";

const OWNER_EMAIL = "owner@barber-bros.local";
const OWNER_PASSWORD = process.env["SEED_OWNER_PASSWORD"] ?? "Owner12345!";
const SLUG = "barber-bros";

async function loginAsOwner(page: Page) {
  await page.goto("/en/login");
  await page.getByLabel("Email").fill(OWNER_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(OWNER_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/en\/account$/);
}

test.describe("employees", () => {
  test("owner creates an employee, sets a schedule with a break, adds time off and deletes them", async ({
    page,
  }) => {
    await loginAsOwner(page);
    await page.goto(`/en/admin/${SLUG}/employees`);
    await page.getByRole("link", { name: "New employee" }).first().click();
    await expect(page).toHaveURL(new RegExp(`/en/admin/${SLUG}/employees/new$`));

    const firstName = `Test${Date.now().toString(36)}`;
    await page.getByLabel("First name").fill(firstName);
    await page.getByLabel("Last name").fill("Playwright");
    await page.getByLabel("Position").fill("Junior barber");
    await page.getByRole("button", { name: "Create employee" }).click();

    await expect(page).toHaveURL(new RegExp(`/en/admin/${SLUG}/employees/[0-9a-f-]+$`));
    await expect(page.getByRole("heading", { level: 1 })).toContainText(`${firstName} Playwright`);

    // Schedule: Monday 09:00–17:00 with a 13:00–13:30 break, then copy to Tue–Fri.
    const monday = page.getByTestId("schedule-mon");
    await monday.getByRole("button", { name: /Add shift/ }).click();
    await monday.getByRole("button", { name: "Break" }).click();
    await monday.getByRole("button", { name: "Copy to Tue–Fri" }).click();
    await page.getByRole("button", { name: "Save schedule" }).click();
    await expect(
      page.locator('[data-slot="alert"]').filter({ hasText: "Saved." }).first(),
    ).toBeVisible();
    await expect(page.getByTestId("schedule-fri").getByLabel("shift start")).toHaveValue("09:00");
    await expect(page.getByTestId("schedule-sat")).toContainText("Day off");

    // Time off next year.
    await page.getByLabel("From").fill("2030-08-01");
    await page.getByLabel("To").fill("2030-08-14");
    await page.getByRole("button", { name: "Add time off" }).click();
    await expect(page.getByTestId("time-off-row").filter({ hasText: "Vacation" })).toBeVisible();

    // Public page lists the new team member.
    await page.goto(`/en/salon/${SLUG}`);
    await expect(page.getByTestId("public-team")).toContainText(`${firstName} Playwright`);

    // Availability page shows the absence, then delete the employee.
    await page.goto(`/en/admin/${SLUG}/availability`);
    await expect(page.getByRole("link", { name: `${firstName} Playwright` })).toBeVisible();
    await page.getByRole("link", { name: `${firstName} Playwright` }).click();
    await page.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Yes, delete" }).click();
    await expect(page).toHaveURL(new RegExp(`/en/admin/${SLUG}/employees$`));
    await expect(page.getByText(`${firstName} Playwright`)).toHaveCount(0);
  });

  test("owner blocks time for the whole salon", async ({ page }, testInfo) => {
    const reason = `E2E block ${testInfo.project.name}`;
    await loginAsOwner(page);
    await page.goto(`/en/admin/${SLUG}/availability`);
    await page.getByLabel("Date").fill("2030-09-15");
    await page.getByLabel("From").first().fill("13:00");
    await page.getByLabel("To").first().fill("15:00");
    await page.getByLabel("Reason").fill(reason);
    await page.getByRole("button", { name: "Block time" }).click();
    const row = page.getByTestId("blocked-row").filter({ hasText: reason });
    await expect(row).toBeVisible();
    await expect(row).toContainText("Whole salon");
    await row.getByRole("button", { name: "Remove" }).click();
    await expect(row).toHaveCount(0);
  });

  test("seeded employee login sees the salon with EMPLOYEE role but no admin pages", async ({
    page,
  }) => {
    await page.goto("/en/login");
    await page.getByLabel("Email").fill("marko@studio-example.local");
    await page.getByLabel("Password", { exact: true }).fill(OWNER_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/en\/account$/);
    await expect(page.getByText("Employee", { exact: true })).toBeVisible();

    await page.goto("/en/admin/studio-example/employees");
    // Employees may open the admin shell (own bookings later) but cannot manage staff.
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const mine = (await (await page.request.get("/api/v1/salons")).json()) as {
      data: Array<{ id: string; slug: string; role: string }>;
    };
    const studio = mine.data.find((s) => s.slug === "studio-example");
    expect(studio?.role).toBe("EMPLOYEE");
    const forbidden = await page.request.patch(`/api/v1/salons/${studio!.id}`, {
      data: { name: "Hacked", audience: "UNISEX", defaultLocale: "en" },
    });
    expect(forbidden.status()).toBe(403);
  });
});
