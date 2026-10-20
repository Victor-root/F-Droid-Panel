import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { appQuery, appsQuery, repositoryQuery } from "../../api/queries";
import type { AppDetail } from "../../api/types";

/** Keeps the app returned by a change, and refreshes what the change affects: the list and the pending count. */
export function useAppCache(repositoryId: number, packageName: string) {
  const queryClient = useQueryClient();
  const refreshRepository = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: repositoryQuery(repositoryId).queryKey, exact: true }),
        queryClient.invalidateQueries({ queryKey: appsQuery(repositoryId).queryKey, exact: true }),
      ]),
    [queryClient, repositoryId],
  );
  const store = useCallback(
    (detail: AppDetail) => {
      queryClient.setQueryData(appQuery(repositoryId, packageName).queryKey, detail);
      void refreshRepository();
    },
    [queryClient, repositoryId, packageName, refreshRepository],
  );
  const refresh = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: appQuery(repositoryId, packageName).queryKey, exact: true }),
        refreshRepository(),
      ]),
    [queryClient, repositoryId, packageName, refreshRepository],
  );
  return { store, refresh, refreshRepository };
}
