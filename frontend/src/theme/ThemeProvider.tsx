import { createContext, type ReactNode, use, useLayoutEffect, useMemo, useState, useSyncExternalStore } from "react";

import { readStorage, STORAGE_KEYS, writeStorage } from "../storage";
import { isHexColor, normalizeHex } from "./color";
import { buildPalette, DEFAULT_ACCENT, type Palette } from "./palette";

export const THEME_MODES = ["light", "dark", "system"] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

interface ThemeContextValue {
  mode: ThemeMode;
  resolved: "light" | "dark";
  accent: string;
  palette: Palette;
  setMode: (mode: ThemeMode) => void;
  setAccent: (accent: string) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const DARK_QUERY = "(prefers-color-scheme: dark)";

function subscribeToSystemTheme(onChange: () => void): () => void {
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function systemPrefersDark(): boolean {
  return window.matchMedia(DARK_QUERY).matches;
}

function storedMode(): ThemeMode {
  const value = readStorage(STORAGE_KEYS.theme);
  return THEME_MODES.find((mode) => mode === value) ?? "system";
}

function storedAccent(): string {
  const value = readStorage(STORAGE_KEYS.accent);
  return value && isHexColor(value) ? normalizeHex(value) : DEFAULT_ACCENT;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(storedMode);
  const [accent, setAccentState] = useState<string>(storedAccent);
  const systemDark = useSyncExternalStore(subscribeToSystemTheme, systemPrefersDark);
  const resolved = mode === "dark" || (mode === "system" && systemDark) ? "dark" : "light";
  const palette = useMemo(() => buildPalette(accent), [accent]);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", resolved === "dark");
    for (const [name, value] of Object.entries(palette[resolved])) {
      root.style.setProperty(name, value);
    }
  }, [palette, resolved]);

  useLayoutEffect(() => {
    writeStorage(STORAGE_KEYS.palette, JSON.stringify({ light: palette.light, dark: palette.dark }));
  }, [palette]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      resolved,
      accent,
      palette,
      setMode: (next) => {
        writeStorage(STORAGE_KEYS.theme, next);
        setModeState(next);
      },
      setAccent: (next) => {
        const normalized = normalizeHex(next);
        writeStorage(STORAGE_KEYS.accent, normalized);
        setAccentState(normalized);
      },
    }),
    [mode, resolved, accent, palette],
  );

  return <ThemeContext value={value}>{children}</ThemeContext>;
}

export function useTheme(): ThemeContextValue {
  const context = use(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used inside ThemeProvider");
  }
  return context;
}
