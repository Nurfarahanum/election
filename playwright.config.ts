import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  workers: 1,
  fullyParallel: false,
  timeout: 120_000,
  use: {
    baseURL: process.env.APP_ORIGIN ?? "https://localhost",
    browserName: "chromium",
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE },
    ignoreHTTPSErrors: true,
    viewport: { width: 360, height: 800 },
    isMobile: true,
    hasTouch: true,
    colorScheme: "dark",
  },
});
