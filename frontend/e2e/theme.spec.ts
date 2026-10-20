import { expect, type Page, test } from "@playwright/test";

const accentOf = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim());

test("follows the system theme live in automatic mode", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("./");
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveClass(/dark/);
});

test("applies the saved theme and palette before the application loads", async ({ page }) => {
  await page.goto("./settings/appearance");
  await page.getByRole("radio", { name: "Dark" }).click();
  await page.getByRole("radio", { name: "#8b5cf6" }).click();
  const accent = await accentOf(page);

  try {
    // Without the application scripts, only the inline bootstrap can apply the theme.
    await page.route(/\/assets\/.*\.js$/, (route) => route.abort());
    await page.emulateMedia({ colorScheme: "light" });
    await page.reload();
    await expect(page.locator("html")).toHaveClass(/dark/);
    expect(await accentOf(page)).toBe(accent);
  } finally {
    await page.unroute(/\/assets\/.*\.js$/);
    await page.reload();
    await page.getByRole("radio", { name: "Automatic" }).click();
    await page.getByRole("button", { name: "Back to Android green" }).click();
  }
});

test("saves the theme to the account", async ({ page }) => {
  await page.goto("./settings/appearance");
  await page.getByRole("radio", { name: "Dark" }).click();
  await expect.poll(async () => (await page.request.get("api/me")).json().then((me) => me.theme)).toBe("dark");
  await page.getByRole("radio", { name: "Automatic" }).click();
  await expect.poll(async () => (await page.request.get("api/me")).json().then((me) => me.theme)).toBe("system");
});
