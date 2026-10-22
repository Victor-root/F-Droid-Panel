import { IconPlus, IconTrash } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";

import { api } from "../../api/client";
import { categoriesQuery, repositoryQuery } from "../../api/queries";
import type { Category } from "../../api/types";
import { CategorySuggestions } from "../../components/CategorySuggestions";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import { Input } from "../../components/ui/Field";
import { Skeleton } from "../../components/ui/Skeleton";
import { toast } from "../../components/ui/Toast";
import { useCategories } from "../../lib/categories";
import { useErrorText } from "../../lib/errors";

const DEFAULT_LOCALE = "en-US";

function CategoriesForm({ repositoryId, initial, canWrite }: { repositoryId: number; initial: Category[]; canWrite: boolean }) {
  const { t } = useTranslation();
  const errors = useErrorText();
  const queryClient = useQueryClient();
  const categories = useCategories(repositoryId);
  const [rows, setRows] = useState(initial);
  const [added, setAdded] = useState("");
  const save = useMutation({
    mutationFn: () =>
      api<Category[]>(`/repositories/${repositoryId}/categories`, {
        method: "PUT",
        body: { categories: rows.map(({ id, names }) => ({ id, names })) },
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(categoriesQuery(repositoryId).queryKey, updated);
      void queryClient.invalidateQueries({ queryKey: repositoryQuery(repositoryId).queryKey, exact: true });
      toast.success(t("categories.saved"), t("app.savedDescription"));
    },
    onError: (error) => toast.error(errors.fromError(error)),
  });

  const add = () => {
    const id = categories.resolve(added);
    if (!id || rows.some((row) => row.id === id)) return;
    // A category of F-Droid comes with its translated names.
    setRows([...rows, { id, names: categories.officialNames.get(id) ?? { [DEFAULT_LOCALE]: id }, apps: 0 }]);
    setAdded("");
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <ul className="flex flex-col divide-y divide-border">
        {rows.map((row, index) => (
          <li key={row.id} className="flex flex-wrap items-center gap-3 py-2.5">
            <code className="w-40 truncate font-mono text-xs text-muted">{row.id}</code>
            <Input
              aria-label={t("categories.name", { id: row.id })}
              className="min-w-40 flex-1"
              disabled={!canWrite}
              maxLength={64}
              value={row.names[DEFAULT_LOCALE] ?? ""}
              placeholder={row.id}
              onChange={(event) => {
                const next = [...rows];
                next[index] = { ...row, names: { ...row.names, [DEFAULT_LOCALE]: event.target.value } };
                setRows(next);
              }}
            />
            <Badge>{t("categories.apps", { count: row.apps })}</Badge>
            {canWrite ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-danger-text"
                disabled={row.apps > 0}
                title={row.apps > 0 ? t("categories.inUse") : undefined}
                aria-label={t("categories.remove", { id: row.id })}
                onClick={() => setRows(rows.filter((candidate) => candidate.id !== row.id))}
              >
                <IconTrash />
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {rows.length === 0 ? <p className="text-sm text-muted">{t("categories.none")}</p> : null}
      {canWrite ? (
        <>
          <div className="flex max-w-md gap-2">
            <Input
              aria-label={t("categories.newId")}
              placeholder={t("categories.newId")}
              list="new-category-suggestions"
              maxLength={64}
              value={added}
              onChange={(event) => setAdded(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  add();
                }
              }}
            />
            <CategorySuggestions id="new-category-suggestions" options={categories.options} />
            <Button type="button" variant="secondary" disabled={!added.trim()} onClick={add}>
              <IconPlus />
              {t("action.add")}
            </Button>
          </div>
          <div>
            <Button type="submit" loading={save.isPending}>
              {t("action.save")}
            </Button>
          </div>
        </>
      ) : null}
    </form>
  );
}

export function CategoriesCard({ repositoryId, canWrite }: { repositoryId: number; canWrite: boolean }) {
  const { t } = useTranslation();
  const { data: categories, dataUpdatedAt } = useQuery(categoriesQuery(repositoryId));
  return (
    <Card>
      <CardHeader title={t("categories.title")} description={t("categories.description")} />
      <CardBody>
        {categories ? (
          <CategoriesForm key={dataUpdatedAt} repositoryId={repositoryId} initial={categories} canWrite={canWrite} />
        ) : (
          <Skeleton className="h-24" />
        )}
      </CardBody>
    </Card>
  );
}
