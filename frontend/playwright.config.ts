import { tmpdir } from "node:os";
import { join } from "node:path";

import { defineConfig, devices } from "@playwright/test";

const PORT = 4174;
export const WORK_DIR = join(tmpdir(), "fdroid-panel-e2e");
export const AUTH_STATE = join(WORK_DIR, "auth.json");

export default defineConfig({
  testDir: "e2e",
  // Tests share one administrator whose preferences they change, so they run one at a time.
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}/admin/`,
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  projects: [
    { name: "setup", testMatch: /setup\.e2e\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: AUTH_STATE },
      dependencies: ["setup"],
      testIgnore: /setup\.e2e\.ts/,
    },
  ],
  webServer: {
    command: "bash e2e/server.sh",
    url: `http://127.0.0.1:${PORT}/admin/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: { E2E_WORK_DIR: WORK_DIR, E2E_PORT: String(PORT) },
  },
});
