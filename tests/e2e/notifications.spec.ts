import { expect, test } from "./fixtures";

const OWNER_PASSWORD = process.env["SEED_OWNER_PASSWORD"] ?? "Owner12345!";

test.describe("notification log", () => {
  test("owner sees the salon notification log with status filters", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "chromium-mobile", "desktop only");
    await page.goto("/en/login");
    await page.getByLabel("Email").fill("owner@studio-example.local");
    await page.getByLabel("Password", { exact: true }).fill(OWNER_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/en\/account$/);

    await page.goto("/en/admin/studio-example/notifications");
    await expect(page.getByRole("heading", { level: 1, name: "Notifications" })).toBeVisible();
    await page.getByRole("tab", { name: "Sent" }).click();
    await expect(page).toHaveURL(/status=SENT/);
    await expect(page.getByRole("tab", { name: "Sent" })).toHaveAttribute("aria-selected", "true");
  });
});
