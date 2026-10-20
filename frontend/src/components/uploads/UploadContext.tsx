import { useQueryClient } from "@tanstack/react-query";
import { createContext, type ReactNode, use, useCallback, useMemo, useState } from "react";

import { api } from "../../api/client";
import type { Upload } from "../../api/types";
import { sendFile } from "./sendFile";

export type UploadPhase = "uploading" | "checking" | "ready" | "rejected" | "adding" | "added" | "failed";

export interface UploadItem {
  key: string;
  file: File;
  sent: number;
  phase: UploadPhase;
  upload: Upload | null;
  error: unknown;
  controller: AbortController;
}

interface UploadContextValue {
  items: UploadItem[];
  addFiles: (files: File[]) => void;
  confirm: (key: string, details: { name: string; summary: string; categories: string[] }) => Promise<string | null>;
  discard: (key: string) => void;
  clearFinished: () => void;
}

const UploadContext = createContext<UploadContextValue | null>(null);

let counter = 0;

/** The uploads of one repository; they keep going while the user moves between its pages. */
export function UploadProvider({ repositoryId, children }: { repositoryId: number; children: ReactNode }) {
  const queryClient = useQueryClient();
  const [items, setItems] = useState<UploadItem[]>([]);

  const update = useCallback((key: string, change: Partial<UploadItem>) => {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...change } : item)));
  }, []);

  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ["repositories"] }),
    [queryClient],
  );

  const addFiles = useCallback(
    (files: File[]) => {
      const added = files.map((file) => ({
        key: `upload-${(counter += 1)}`,
        file,
        sent: 0,
        phase: "uploading" as const,
        upload: null,
        error: null,
        controller: new AbortController(),
      }));
      setItems((current) => [...added, ...current]);
      for (const item of added) {
        sendFile(
          repositoryId,
          item.file,
          (sent) => update(item.key, { sent, phase: sent >= item.file.size ? "checking" : "uploading" }),
          item.controller.signal,
        )
          .then((upload) => update(item.key, { upload, phase: upload.status === "ready" ? "ready" : "rejected" }))
          .catch((error: unknown) => {
            if (!item.controller.signal.aborted) update(item.key, { error, phase: "failed" });
          });
      }
    },
    [repositoryId, update],
  );

  const confirm = useCallback<UploadContextValue["confirm"]>(
    async (key, details) => {
      const item = items.find((candidate) => candidate.key === key);
      if (!item?.upload) return null;
      update(key, { phase: "adding", error: null });
      try {
        const result = await api<{ packageName: string }>(`/repositories/${repositoryId}/uploads/${item.upload.id}/add`, {
          method: "POST",
          body: details,
        });
        update(key, { phase: "added" });
        // The other files were checked before this one was added: a second version is not a new app anymore.
        for (const other of items) {
          if (other.key === key || !other.upload || (other.phase !== "ready" && other.phase !== "rejected")) continue;
          const upload = await api<Upload>(`/repositories/${repositoryId}/uploads/${other.upload.id}`);
          update(other.key, { upload, phase: upload.status === "ready" ? "ready" : "rejected" });
        }
        await refresh();
        return result.packageName;
      } catch (error) {
        update(key, { phase: "ready", error });
        return null;
      }
    },
    [items, repositoryId, refresh, update],
  );

  const discard = useCallback(
    (key: string) => {
      const item = items.find((candidate) => candidate.key === key);
      item?.controller.abort();
      if (item?.upload && item.phase !== "added") {
        void api(`/repositories/${repositoryId}/uploads/${item.upload.id}`, { method: "DELETE" });
      }
      setItems((current) => current.filter((candidate) => candidate.key !== key));
    },
    [items, repositoryId],
  );

  const clearFinished = useCallback(() => {
    setItems((current) => current.filter((item) => item.phase !== "added"));
  }, []);

  const value = useMemo(() => ({ items, addFiles, confirm, discard, clearFinished }), [items, addFiles, confirm, discard, clearFinished]);
  return <UploadContext value={value}>{children}</UploadContext>;
}

export function useUploads(): UploadContextValue {
  const context = use(UploadContext);
  if (!context) throw new Error("useUploads must be used inside UploadProvider");
  return context;
}
