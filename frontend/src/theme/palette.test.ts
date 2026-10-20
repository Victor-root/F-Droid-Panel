import { describe, expect, it } from "vitest";

import { contrastRatio, hexToOklch, oklchToHex } from "./color";
import { buildPalette, DEFAULT_ACCENT } from "./palette";

const SAMPLES = [
  DEFAULT_ACCENT,
  "#000000",
  "#ffffff",
  "#777777",
  "#4285f4",
  "#ffeb3b",
  "#e53935",
  "#8e24aa",
  "#00bcd4",
  "#ff9800",
  "#f8bbd0",
  "#1b5e20",
  "#0d47a1",
];

describe("color conversions", () => {
  it.each(SAMPLES)("round trips %s through OKLCH", (hex) => {
    expect(oklchToHex(hexToOklch(hex))).toBe(hex);
  });

  it("maps out of gamut colors back into sRGB", () => {
    expect(oklchToHex({ l: 0.7, c: 0.5, h: 145 })).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe.each(SAMPLES)("palette for %s", (accent) => {
  const palette = buildPalette(accent);

  it.each(["light", "dark"] as const)("keeps %s theme readable", (mode) => {
    const v = palette[mode];
    const ratio = (a: string, b: string) => contrastRatio(v[a] as string, v[b] as string);
    expect(ratio("--text", "--surface")).toBeGreaterThanOrEqual(4.5);
    expect(ratio("--text", "--bg")).toBeGreaterThanOrEqual(4.5);
    expect(ratio("--text-muted", "--surface")).toBeGreaterThanOrEqual(4.5);
    expect(ratio("--accent-contrast", "--accent")).toBeGreaterThanOrEqual(4.5);
    expect(ratio("--accent-text", "--surface")).toBeGreaterThanOrEqual(4.5);
    expect(ratio("--accent-soft-text", "--accent-soft")).toBeGreaterThanOrEqual(4.5);
    expect(ratio("--accent-strong", "--surface")).toBeGreaterThanOrEqual(3);
  });
});

it("keeps the chosen accent as is when it is already readable", () => {
  expect(buildPalette(DEFAULT_ACCENT).light["--accent"]).toBe(DEFAULT_ACCENT);
});
