import { expect, test } from "@playwright/test";

test("the import wizard explains why a folder cannot be imported", async ({ page }) => {
  await page.goto("./repositories/new");
  await page.getByRole("button", { name: /Import an existing repository/ }).click();
  await page.getByLabel("Folder").fill("/nonexistent/fdroid");
  await page.getByRole("button", { name: "Check" }).click();
  await expect(page.getByText("This folder does not exist on the server.")).toBeVisible();
  await expect(page.getByText("Cannot be imported")).toBeVisible();
});

test("an empty panel invites to add a repository", async ({ page }) => {
  await page.goto("./");
  await expect(page.getByText("No repository yet")).toBeVisible();
  await page.getByRole("main").getByRole("link", { name: "Add a repository" }).click();
  await expect(page).toHaveURL(/\/admin\/repositories\/new$/);
});
