import { cn } from "../../lib/cn";
import { hexToOklch, oklchToHex } from "../../theme/color";
import { useTheme } from "../../theme/ThemeProvider";

function hash(text: string): number {
  let value = 0;
  for (const char of text) {
    value = (value * 31 + char.charCodeAt(0)) >>> 0;
  }
  return value;
}

interface AvatarProps {
  name: string;
  src?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const SIZES = { sm: "size-8 text-xs rounded-lg", md: "size-10 text-sm rounded-xl", lg: "size-12 text-base rounded-xl", xl: "size-16 text-xl rounded-2xl" };

/** An image, or initials on a color derived from the name and harmonized with the accent. */
export function Avatar({ name, src, size = "md", className }: AvatarProps) {
  const { accent, resolved } = useTheme();
  const initials =
    name
      .split(/[\s._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?";

  if (src) {
    return <img src={src} alt="" className={cn(SIZES[size], "shrink-0 bg-surface-2 object-cover", className)} />;
  }

  const hue = (hexToOklch(accent).h + (hash(name) % 12) * 30) % 360;
  const background = oklchToHex({ l: resolved === "dark" ? 0.38 : 0.9, c: 0.08, h: hue });
  const color = oklchToHex({ l: resolved === "dark" ? 0.92 : 0.36, c: 0.1, h: hue });

  return (
    <span
      aria-hidden="true"
      className={cn(SIZES[size], "inline-flex shrink-0 items-center justify-center font-semibold", className)}
      style={{ background, color }}
    >
      {initials}
    </span>
  );
}
