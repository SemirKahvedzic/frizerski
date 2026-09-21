import sharp from "sharp";

import { expect, test } from "./fixtures";

const OWNER_PASSWORD = process.env["SEED_OWNER_PASSWORD"] ?? "Owner12345!";

test.describe("gallery", () => {
  test("owner uploads a photo, it shows on the public page, then removes it", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === "chromium-mobile", "desktop only");
    await page.goto("/en/login");
    await page.getByLabel("Email").fill("owner@barber-bros.local");
    await page.getByLabel("Password", { exact: true }).fill(OWNER_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/en\/account$/);

    await page.goto("/en/admin/barber-bros/gallery");
    await expect(page.getByRole("heading", { level: 1, name: "Gallery" })).toBeVisible();
    const before = await page.locator('[data-testid^="gallery-item-"]').count();

    const buffer = await sharp({
      create: { width: 900, height: 600, channels: 3, background: "#8b5cf6" },
    })
      .jpeg()
      .toBuffer();
    await page.getByTestId("gallery-file-input").setInputFiles({
      name: `e2e-${Date.now()}.jpg`,
      mimeType: "image/jpeg",
      buffer,
    });
    await expect(page.locator('[data-testid^="gallery-item-"]')).toHaveCount(before + 1, {
      timeout: 30_000,
    });
    const item = page.locator('[data-testid^="gallery-item-"]').last();
    const src = await item.locator("img").getAttribute("src");
    expect(src).toMatch(/\/api\/v1\/media\/salons\//);
    const image = await page.request.get(src!);
    expect(image.ok()).toBeTruthy();
    expect(image.headers()["content-type"]).toContain("image/webp");

    await page.goto("/en/salon/barber-bros");
    await expect(page.getByTestId("public-gallery")).toBeVisible();
    await expect(page.getByTestId("public-gallery").locator("img").first()).toBeVisible();

    await page.goto("/en/admin/barber-bros/gallery");
    page.once("dialog", (d) => void d.accept());
    await page.locator('[data-testid^="gallery-remove-"]').last().click();
    await expect(page.locator('[data-testid^="gallery-item-"]')).toHaveCount(before, {
      timeout: 15_000,
    });
  });
});
