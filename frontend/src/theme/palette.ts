import { contrastRatio, hexToOklch, type Oklch, oklchToHex } from "./color";

export const DEFAULT_ACCENT = "#3ddc84";

export const ACCENT_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
type Step = (typeof ACCENT_STEPS)[number];

const STEP_LIGHTNESS: Record<Step, number> = {
  50: 0.975,
  100: 0.945,
  200: 0.895,
  300: 0.83,
  400: 0.755,
  500: 0.675,
  600: 0.585,
  700: 0.5,
  800: 0.42,
  900: 0.35,
  950: 0.27,
};

// Very light and very dark steps carry less chroma, like hand made palettes.
const STEP_CHROMA: Record<Step, number> = {
  50: 0.18,
  100: 0.35,
  200: 0.6,
  300: 0.85,
  400: 1,
  500: 1,
  600: 1,
  700: 0.95,
  800: 0.85,
  900: 0.75,
  950: 0.6,
};

export type ThemeVariables = Record<string, string>;

export interface Palette {
  scale: Record<Step, string>;
  light: ThemeVariables;
  dark: ThemeVariables;
}

const TEXT_CONTRAST = 4.5;
const UI_CONTRAST = 3;
const LIGHTNESS_STEP = 0.01;

/** Moves lightness towards black or white until the color reaches the contrast ratio against a background. */
function withContrast(color: Oklch, background: string, ratio: number): string {
  const towardsDark = contrastRatio("#000000", background) > contrastRatio("#ffffff", background);
  let candidate = { ...color };
  let hex = oklchToHex(candidate);
  while (contrastRatio(hex, background) < ratio && candidate.l > 0 && candidate.l < 1) {
    candidate = { ...candidate, l: candidate.l + (towardsDark ? -LIGHTNESS_STEP : LIGHTNESS_STEP) };
    hex = oklchToHex(candidate);
  }
  return hex;
}

function shade(color: Oklch, delta: number): string {
  return oklchToHex({ ...color, l: color.l + delta });
}

function neutral(hue: number, l: number, c = 0.008): string {
  return oklchToHex({ l, c, h: hue });
}

interface Fill {
  fill: string;
  text: string;
}

/**
 * Picks dark or white text for a filled surface (button, badge). Mid tones reach about 4.1:1 at best
 * with either, so the fill itself is nudged away from the text until the text is readable.
 */
function readableFill(color: Oklch, hue: number): Fill {
  const dark = neutral(hue, 0.18, 0.02);
  const fill = oklchToHex(color);
  const text = contrastRatio(dark, fill) >= contrastRatio("#ffffff", fill) ? dark : "#ffffff";
  return { fill: withContrast(color, text, TEXT_CONTRAST), text };
}

export function buildPalette(accentHex: string): Palette {
  const base = hexToOklch(accentHex);
  const hue = base.c < 0.02 ? 250 : base.h;
  const lightFill = readableFill(base, hue);

  const scale = Object.fromEntries(
    ACCENT_STEPS.map((step) => [
      step,
      oklchToHex({ l: STEP_LIGHTNESS[step], c: base.c * STEP_CHROMA[step], h: base.h }),
    ]),
  ) as Record<Step, string>;

  const lightSurface = "#ffffff";
  const lightSoft = oklchToHex({ l: 0.955, c: Math.min(base.c, 0.06), h: base.h });
  const light: ThemeVariables = {
    "--bg": neutral(hue, 0.975),
    "--surface": lightSurface,
    "--surface-2": neutral(hue, 0.962),
    "--surface-3": neutral(hue, 0.93),
    "--border": neutral(hue, 0.91),
    "--border-strong": neutral(hue, 0.83),
    "--text": neutral(hue, 0.21, 0.015),
    "--text-muted": withContrast({ l: 0.5, c: 0.015, h: hue }, lightSurface, TEXT_CONTRAST),
    "--text-subtle": neutral(hue, 0.66, 0.012),
    "--accent": lightFill.fill,
    "--accent-hover": shade(hexToOklch(lightFill.fill), -0.04),
    "--accent-active": shade(hexToOklch(lightFill.fill), -0.08),
    "--accent-contrast": lightFill.text,
    "--accent-strong": withContrast(base, lightSurface, UI_CONTRAST),
    "--accent-text": withContrast({ ...base, l: Math.min(base.l, 0.55) }, lightSurface, TEXT_CONTRAST),
    "--accent-soft": lightSoft,
    "--accent-soft-hover": oklchToHex({ l: 0.925, c: Math.min(base.c, 0.08), h: base.h }),
    "--accent-soft-text": withContrast({ ...base, l: Math.min(base.l, 0.5) }, lightSoft, TEXT_CONTRAST),
  };

  const darkSurface = neutral(hue, 0.205, 0.012);
  const darkAccent = withContrast({ ...base, l: Math.max(base.l, 0.62) }, darkSurface, UI_CONTRAST);
  const darkFill = readableFill(hexToOklch(darkAccent), hue);
  const darkAccentOklch = hexToOklch(darkFill.fill);
  const darkSoft = oklchToHex({ l: 0.28, c: Math.min(base.c, 0.06), h: base.h });
  const dark: ThemeVariables = {
    "--bg": neutral(hue, 0.16, 0.01),
    "--surface": darkSurface,
    "--surface-2": neutral(hue, 0.24, 0.013),
    "--surface-3": neutral(hue, 0.28, 0.015),
    "--border": neutral(hue, 0.29, 0.014),
    "--border-strong": neutral(hue, 0.37, 0.016),
    "--text": neutral(hue, 0.95, 0.006),
    "--text-muted": withContrast({ l: 0.72, c: 0.012, h: hue }, darkSurface, TEXT_CONTRAST),
    "--text-subtle": neutral(hue, 0.55, 0.012),
    "--accent": darkFill.fill,
    "--accent-hover": shade(darkAccentOklch, 0.04),
    "--accent-active": shade(darkAccentOklch, 0.08),
    "--accent-contrast": darkFill.text,
    "--accent-strong": darkAccent,
    "--accent-text": withContrast({ ...base, l: Math.max(base.l, 0.78) }, darkSurface, TEXT_CONTRAST),
    "--accent-soft": darkSoft,
    "--accent-soft-hover": oklchToHex({ l: 0.32, c: Math.min(base.c, 0.07), h: base.h }),
    "--accent-soft-text": withContrast({ ...base, l: Math.max(base.l, 0.82) }, darkSoft, TEXT_CONTRAST),
  };

  for (const step of ACCENT_STEPS) {
    light[`--accent-${step}`] = scale[step];
    dark[`--accent-${step}`] = scale[step];
  }

  return { scale, light, dark };
}

function block(selector: string, variables: ThemeVariables): string {
  const body = Object.entries(variables)
    .map(([name, value]) => `${name}:${value};`)
    .join("");
  return `${selector}{${body}}`;
}

export function paletteCss(palette: Palette): string {
  return block(":root", palette.light) + block(":root.dark", palette.dark);
}
