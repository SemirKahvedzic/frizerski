import { test as base, expect } from "@playwright/test";

/**
 * `page.goto` additionally waits until the app has hydrated (see
 * `HydrationMarker`) for HTML responses, so tests never click before React
 * attached its handlers.
 */
export const test = base.extend({
  page: async ({ page }, provide) => {
    const originalGoto = page.goto.bind(page);
    page.goto = async (url, options) => {
      const response = await originalGoto(url, options);
      const contentType = response?.headers()["content-type"] ?? "";
      if (contentType.includes("text/html")) {
        await page
          .waitForSelector('html[data-hydrated="true"]', { state: "attached", timeout: 20_000 })
          .catch(() => undefined);
      }
      return response;
    };
    await provide(page);
  },
});

export { expect };
