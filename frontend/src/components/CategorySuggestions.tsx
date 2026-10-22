import type { CategoryOption } from "../lib/categories";

/** The categories offered while typing in an input whose list attribute is this id. */
export function CategorySuggestions({ id, options }: { id: string; options: CategoryOption[] }) {
  return (
    <datalist id={id}>
      {options.map((option) => (
        <option key={option.id} value={option.label} />
      ))}
    </datalist>
  );
}
