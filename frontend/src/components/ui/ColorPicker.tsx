import { IconCheck } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "../../lib/cn";
import { isHexColor, normalizeHex } from "../../theme/color";
import { Input } from "./Field";

export const ACCENT_PRESETS = [
  "#3ddc84",
  "#14b8a6",
  "#06b6d4",
  "#4285f4",
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#64748b",
];

interface ColorPickerProps {
  value: string;
  onChange: (value: string) => void;
}

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  const { t } = useTranslation();
  // What is being typed in the hex field; null shows the current value.
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? value;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("appearance.presets")}>
        {ACCENT_PRESETS.map((preset) => {
          const selected = preset === value;
          return (
            <button
              key={preset}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={preset}
              onClick={() => {
                setDraft(null);
                onChange(preset);
              }}
              className={cn(
                "flex size-9 items-center justify-center rounded-full text-white ring-offset-2 ring-offset-surface transition-transform hover:scale-110",
                selected && "ring-2 ring-text",
              )}
              style={{ background: preset }}
            >
              {selected ? <IconCheck className="size-4 drop-shadow" stroke={3} /> : null}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-3">
        <label className="relative size-10 shrink-0 cursor-pointer overflow-hidden rounded-xl border border-border shadow-soft">
          <span className="sr-only">{t("appearance.customColor")}</span>
          <input
            type="color"
            value={value}
            onChange={(event) => {
              setDraft(null);
              onChange(event.target.value);
            }}
            className="absolute -inset-2 size-14 cursor-pointer border-0 bg-transparent p-0"
          />
        </label>
        <Input
          aria-label={t("appearance.hexValue")}
          value={shown}
          spellCheck={false}
          maxLength={7}
          className="w-32 font-mono uppercase"
          aria-invalid={!isHexColor(shown) || undefined}
          onChange={(event) => {
            setDraft(event.target.value);
            if (isHexColor(event.target.value)) onChange(normalizeHex(event.target.value));
          }}
          onBlur={() => setDraft(null)}
        />
      </div>
    </div>
  );
}
