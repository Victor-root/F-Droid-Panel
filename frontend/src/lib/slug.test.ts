import { expect, it } from "vitest";

import { slugify } from "./slug";

it("builds identifiers from names", () => {
  expect(slugify("Family apps (2024)")).toBe("family-apps-2024");
  expect(slugify("  Applis de l’équipe  ")).toBe("applis-de-l-equipe");
  expect(slugify("***")).toBe("");
});
