import { expect, test } from "@playwright/test";

const accentOf = (page: import("@playwright/test").Page) =>
  page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim());

test("follows the system theme live in automatic mode", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("./");
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveClass(/dark/);
});

test("applies the stored theme and palette before the application loads", async ({ page }) => {
  await page.goto("./settings/appearance");
  await page.getByRole("radio", { name: "Dark" }).click();
  await page.getByRole("radio", { name: "#8b5cf6" }).click();
  const accent = await accentOf(page);

  // Without the application scripts, only the inline bootstrap can apply the theme.
  await page.route(/\/assets\/.*\.js$/, (route) => route.abort());
  await page.emulateMedia({ colorScheme: "light" });
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  expect(await accentOf(page)).toBe(accent);
});

test("changes the accent color everywhere", async ({ page }) => {
  await page.goto("./settings/appearance");
  const before = await accentOf(page);
  await page.getByRole("textbox", { name: "Hexadecimal color" }).fill("#4285f4");
  await expect.poll(() => accentOf(page)).not.toBe(before);
});
