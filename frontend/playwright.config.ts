import { defineConfig, devices } from "@playwright/test";

/** Smoke tests against a running site: the real build, the real API, a seeded
 *  database. Nothing is started from here — CI brings the stack up first, and
 *  locally it is whatever E2E_BASE_URL points at (the review setup by default). */
export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3002",
    locale: "el-GR",
    timezoneId: "Europe/Athens",
  },
  projects: [
    { name: "phone", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
});
