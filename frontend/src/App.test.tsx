import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import i18n from "./i18n";
import App from "./App";

describe("App", () => {
  afterEach(async () => {
    cleanup();
    await i18n.changeLanguage("en");
  });

  it("renders in English", async () => {
    await i18n.changeLanguage("en");
    render(<App />);
    expect(screen.getByText("Manage your F-Droid repositories from your browser.")).toBeTruthy();
  });

  it("renders in French and sets the document language", async () => {
    await i18n.changeLanguage("fr");
    render(<App />);
    expect(screen.getByText("Gérez vos dépôts F-Droid depuis votre navigateur.")).toBeTruthy();
    expect(document.documentElement.lang).toBe("fr");
  });

  it("falls back to English for an unsupported language", async () => {
    await i18n.changeLanguage("de-DE");
    render(<App />);
    expect(screen.getByText("Manage your F-Droid repositories from your browser.")).toBeTruthy();
  });
});
