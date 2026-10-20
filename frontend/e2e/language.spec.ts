import { expect, test } from "@playwright/test";

test.describe("French browser", () => {
  test.use({ locale: "fr-FR" });

  test("uses French", async ({ page }) => {
    await page.goto("./");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Vue d’ensemble");
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
  });
});

test.describe("Unsupported browser language", () => {
  test.use({ locale: "de-DE" });

  test("falls back to English", async ({ page }) => {
    await page.goto("./");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Overview");
  });
});

test("remembers an explicit language choice", async ({ page }) => {
  await page.goto("./settings/appearance");
  await page.getByRole("combobox", { name: "Language" }).click();
  await page.getByRole("option", { name: "Français" }).click();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Paramètres");
});
