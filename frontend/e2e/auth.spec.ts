import { expect, test } from "@playwright/test";

import { ADMIN } from "./fixtures";

test.describe("signed out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("redirects to the login page and back after signing in", async ({ page }) => {
    await page.goto("./settings/about");
    await expect(page).toHaveURL(/\/admin\/login/);
    await page.getByLabel("Username").fill(ADMIN.username);
    await page.getByLabel("Password").fill("wrong password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert")).toHaveText("Wrong username or password.");
    await page.getByLabel("Password").fill(ADMIN.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/admin\/settings\/about$/);
    await expect(page.getByText("not affiliated with, endorsed by or supported by the F-Droid project").first()).toBeVisible();
  });
});
