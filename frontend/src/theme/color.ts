// OKLCH conversions (Björn Ottosson's OKLab) and WCAG contrast, enough to derive a
// whole interface palette from a single accent color.

export interface Oklch {
  l: number;
  c: number;
  h: number;
}

type Rgb = [number, number, number];

const HEX = /^#?([0-9a-f]{6})$/i;

export function isHexColor(value: string): boolean {
  return HEX.test(value.trim());
}

export function normalizeHex(value: string): string {
  const match = HEX.exec(value.trim());
  if (!match?.[1]) {
    throw new Error(`Invalid color: ${value}`);
  }
  return `#${match[1].toLowerCase()}`;
}

function hexToRgb(hex: string): Rgb {
  const value = normalizeHex(hex);
  return [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16) / 255) as Rgb;
}

function rgbToHex(rgb: Rgb): string {
  return `#${rgb
    .map((channel) =>
      Math.round(Math.min(1, Math.max(0, channel)) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function linearRgbToOklch([r, g, b]: Rgb): Oklch {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const h = (Math.atan2(bb, a) * 180) / Math.PI;
  return { l: L, c: Math.hypot(a, bb), h: h < 0 ? h + 360 : h };
}

function oklchToLinearRgb({ l: L, c, h }: Oklch): Rgb {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = (rgb: Rgb) => rgb.every((channel) => channel >= -1e-4 && channel <= 1 + 1e-4);

export function hexToOklch(hex: string): Oklch {
  return linearRgbToOklch(hexToRgb(hex).map(toLinear) as Rgb);
}

/** Converts to sRGB, reducing chroma (keeping lightness and hue) when the color is out of gamut. */
export function oklchToHex(color: Oklch): string {
  const l = Math.min(1, Math.max(0, color.l));
  let rgb = oklchToLinearRgb({ ...color, l });
  if (!inGamut(rgb)) {
    let low = 0;
    let high = color.c;
    for (let i = 0; i < 24; i++) {
      const mid = (low + high) / 2;
      if (inGamut(oklchToLinearRgb({ l, c: mid, h: color.h }))) {
        low = mid;
      } else {
        high = mid;
      }
    }
    rgb = oklchToLinearRgb({ l, c: low, h: color.h });
  }
  return rgbToHex(rgb.map((channel) => toGamma(Math.min(1, Math.max(0, channel)))) as Rgb);
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map(toLinear) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(first: string, second: string): number {
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (lighter + 0.05) / (darker + 0.05);
}
