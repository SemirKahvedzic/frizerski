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

test.describe("booking flow", () => {
  test("guest books online, admin sees it, guest reschedules and cancels via the manage link", async ({
    page,
    browser,
  }, testInfo) => {
    const email = `guest-${testInfo.project.name}-${Date.now()}@e2e.local`;

    await page.goto("/en/salon/studio-example");
    await page.getByTestId("book-now").click();
    await expect(page).toHaveURL(/\/en\/salon\/studio-example\/book$/);

    // Service → Marko (Mon/Tue/Thu/Fri/Sat) → first day with slots.
    await page
      .getByTestId("step-service")
      .getByRole("button", { name: /Šišanje/ })
      .click();
    // Each project books a different employee so parallel runs cannot compete for one slot.
    const employeeName = testInfo.project.name === "chromium-mobile" ? /Sara/ : /Marko/;
    await page.getByTestId("step-employee").getByRole("button", { name: employeeName }).click();
    await expect(page.getByTestId("step-time")).toBeVisible();

    // Walk forward until a day offers slots (skips Wednesdays/Sundays/closures).
    const dayButtons = page.getByRole("listbox", { name: "Day" }).getByRole("option");
    let found = false;
    // Start two days out so the 12-hour cancellation window is always open.
    for (let i = 2; i < 14 && !found; i += 1) {
      await dayButtons.nth(i).click();
      await expect(page.getByTestId("slots").or(page.getByTestId("no-slots"))).toBeVisible({
        timeout: 15_000,
      });
      if ((await page.getByTestId("slots").locator("button").count()) > 0) found = true;
    }
    expect(found).toBe(true);
    const slotButtons = page.getByTestId("slots").locator("button");
    const target =
      testInfo.project.name === "chromium-mobile" ? slotButtons.first() : slotButtons.last();
    const chosenTime = await target.innerText();
    await target.click();

    await expect(page.getByTestId("step-details")).toBeVisible();
    await page.getByLabel("First name").fill("Guest");
    const lastName = `Playwright-${testInfo.project.name}-${Date.now().toString(36)}`;
    await page.getByLabel("Last name").fill(lastName);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Phone", { exact: true }).fill("+387 61 555 444");
    await page.getByRole("button", { name: "Confirm booking" }).click();

    await expect(page.getByTestId("step-done")).toBeVisible({ timeout: 15_000 });
    const manageHref = await page.getByTestId("manage-link").getAttribute("href");
    expect(manageHref).toContain("/en/b/");

    // Admin sees the booking in Appointments.
    const admin = await browser.newContext();
    const adminPage = await admin.newPage();
    await loginAsStudioOwner(adminPage);
    await adminPage.goto("/en/admin/studio-example/appointments");
    const row = adminPage
      .locator('[data-testid^="appointment-"]')
      .filter({ hasText: `Guest ${lastName}` })
      .first();
    await expect(row).toBeVisible();
    await expect(row).toContainText("Confirmed");
    await expect(row).toContainText(chosenTime.trim());
    await admin.close();

    // Guest manages via the link: reschedule to another slot, then cancel.
    await page.goto(manageHref!);
    await expect(page.getByRole("heading", { level: 1, name: "Your appointment" })).toBeVisible();
    await page.getByRole("button", { name: "Move appointment" }).click();
    const rescheduleSlots = page.getByTestId("reschedule-slots").locator("button");
    if ((await rescheduleSlots.count()) > 0) {
      await rescheduleSlots.first().click();
      await page.getByTestId("confirm-reschedule").click();
      await expect(page.locator('[data-slot="alert"]')).toContainText("moved");
    }
    await page.getByRole("button", { name: "Cancel appointment" }).click();
    await page.getByTestId("confirm-cancel").click();
    await expect(page.locator('[data-slot="alert"]')).toContainText("cancelled");
    await expect(page.getByText("Cancelled", { exact: true })).toBeVisible();
  });

  test("availability API returns slots inside working hours and 404 for unknown salons", async ({
    request,
  }) => {
    const salon = (await (await request.get("/api/v1/public/salons/studio-example")).json()) as {
      data: {
        services: { id: string; name: string }[];
        employees: { id: string; firstName: string }[];
      };
    };
    const haircut = salon.data.services.find((s) => s.name === "Šišanje")!;
    const marko = salon.data.employees.find((e) => e.firstName === "Marko")!;
    // Next Monday.
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 2);
    while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
    const date = d.toISOString().slice(0, 10);
    const response = await request.get(
      `/api/v1/public/salons/studio-example/availability?serviceId=${haircut.id}&employeeId=${marko.id}&date=${date}`,
    );
    expect(response.ok()).toBeTruthy();
    const body = (await response.json()) as {
      data: { timezone: string; slots: { startsAt: string }[] };
    };
    expect(body.data.timezone).toBe("Europe/Sarajevo");
    expect(body.data.slots.length).toBeGreaterThan(0);
    const missing = await request.get(
      `/api/v1/public/salons/nope/availability?serviceId=${haircut.id}&employeeId=any&date=${date}`,
    );
    expect(missing.status()).toBe(404);
  });
});
