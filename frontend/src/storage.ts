// Browser storage only holds per-browser conveniences; it can be unavailable (private mode,
// blocked site data), so every access is guarded and failures are ignored.

const PREFIX = "fdroid-panel:";

export const STORAGE_KEYS = {
  theme: `${PREFIX}theme`,
  palette: `${PREFIX}palette`,
  accent: `${PREFIX}accent`,
  language: `${PREFIX}language`,
} as const;

export function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, value);
    }
  } catch {
    // Not persisting is acceptable: the value is only a cache.
  }
}
