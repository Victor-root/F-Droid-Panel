import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { categoriesQuery, officialCategoriesQuery } from "../api/queries";

// Where an app added without a category goes (create_metadata in the backend); F-Droid has no such category.
export const OTHER_CATEGORY = "Other";

export interface CategoryOption {
  id: string;
  label: string;
}

/** Categories of a repository and of F-Droid, named in the interface language. */
export function useCategories(repositoryId: number) {
  const { t, i18n } = useTranslation();
  const { data: defined } = useQuery(categoriesQuery(repositoryId));
  const { data: official } = useQuery(officialCategoriesQuery(repositoryId));
  const language = i18n.resolvedLanguage ?? "en";
  const definedNames = new Map(defined?.map((category) => [category.id, category.names]));
  const officialNames = new Map(official?.map((category) => [category.id, category.names]));
  const localized = (names?: Record<string, string>) => (names ? Object.entries(names).find(([locale]) => locale.split("-")[0] === language)?.[1] : undefined);

  const name = (id: string) =>
    localized(definedNames.get(id)) ?? localized(officialNames.get(id)) ?? (id === OTHER_CATEGORY ? t("categories.other") : (definedNames.get(id)?.["en-US"] ?? id));
  const options: CategoryOption[] = [...new Set([...definedNames.keys(), ...officialNames.keys()])]
    .map((id) => ({ id, label: name(id) }))
    .sort((a, b) => a.label.localeCompare(b.label, language));
  /** The category a typed text designates: an existing one by its name or id, or a new one. */
  const resolve = (text: string) => {
    const wanted = text.trim().toLowerCase();
    return options.find((option) => option.label.toLowerCase() === wanted || option.id.toLowerCase() === wanted)?.id ?? text.trim();
  };

  return { defined, officialNames, name, options, resolve };
}
