import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

import { AUTH_STATE, WORK_DIR } from "../playwright.config";
import { ADMIN } from "./fixtures";



test("the first visit creates the administrator with the setup code", async ({ page }) => {
  await page.goto("./");
  await expect(page).toHaveURL(/\/admin\/setup$/);
  await page.getByLabel("Setup code").fill(readFileSync(join(WORK_DIR, "setup-code"), "utf8").trim());
  await page.getByLabel("Your name").fill("Admin");
  await page.getByLabel("Username").fill(ADMIN.username);
  await page.getByLabel("Password", { exact: true }).fill(ADMIN.password);
  await page.getByLabel("Confirm the password").fill(ADMIN.password);
  await page.getByRole("button", { name: "Create my account" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Overview");
  await page.context().storageState({ path: AUTH_STATE });
});
