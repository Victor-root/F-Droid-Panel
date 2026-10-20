import { IconPhotoPlus, IconReplace, IconTrash } from "@tabler/icons-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { api, apiRaw } from "../../api/client";
import { type AppDetail, type AppLocale, GRAPHIC_KINDS, type GraphicKind } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { Spinner } from "../../components/ui/Spinner";
import { toast } from "../../components/ui/Toast";
import { cn } from "../../lib/cn";
import { useErrorText } from "../../lib/errors";
import { useAppCache } from "./useAppCache";

export const IMAGE_TYPES = "image/png,image/jpeg";

const GRAPHIC_LABELS = {
  icon: "app.graphics.icon",
  featureGraphic: "app.graphics.featureGraphic",
  promoGraphic: "app.graphics.promoGraphic",
  tvBanner: "app.graphics.tvBanner",
} as const satisfies Record<GraphicKind, string>;

// The sizes F-Droid clients are designed for.
const GRAPHIC_SIZES: Record<GraphicKind, string> = {
  icon: "512 × 512",
  featureGraphic: "1024 × 500",
  promoGraphic: "180 × 120",
  tvBanner: "1280 × 720",
};

const GRAPHIC_SHAPES: Record<GraphicKind, string> = {
  icon: "aspect-square w-28",
  featureGraphic: "aspect-[1024/500] w-full",
  promoGraphic: "aspect-[3/2] w-full",
  tvBanner: "aspect-video w-full",
};

interface Props {
  app: AppDetail;
  locale: AppLocale;
  repositoryId: number;
  canWrite: boolean;
  version: number;
}

function GraphicSlot({ kind, url, canWrite, busy, onFile, onRemove }: { kind: GraphicKind; url: string | null; canWrite: boolean; busy: boolean; onFile: (file: File) => void; onRemove: () => void }) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-text">{t(GRAPHIC_LABELS[kind])}</span>
        <span className="text-xs text-muted tabular-nums">{GRAPHIC_SIZES[kind]}</span>
      </div>
      <button
        type="button"
        disabled={!canWrite || busy}
        aria-label={url ? t("app.graphics.replace", { kind: t(GRAPHIC_LABELS[kind]) }) : t("app.graphics.add", { kind: t(GRAPHIC_LABELS[kind]) })}
        onClick={() => input.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files[0];
          if (canWrite && file) onFile(file);
        }}
        className={cn(
          "group relative flex items-center justify-center overflow-hidden rounded-xl border border-border bg-surface-2 transition-all",
          GRAPHIC_SHAPES[kind],
          !url && "border-2 border-dashed border-border-strong",
          canWrite && "hover:border-accent-strong",
          dragging && "border-accent-strong bg-accent-soft",
          "disabled:cursor-default",
        )}
      >
        {url ? <img src={url} alt="" className="size-full object-cover" /> : <IconPhotoPlus className="size-7 text-subtle transition-colors group-hover:text-accent-text" />}
        {busy ? (
          <span className="absolute inset-0 flex items-center justify-center bg-surface/70">
            <Spinner />
          </span>
        ) : null}
      </button>
      {canWrite && url ? (
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => input.current?.click()}>
            <IconReplace />
            {t("app.graphics.change")}
          </Button>
          <Button variant="ghost" size="sm" disabled={busy} className="text-danger-text" onClick={onRemove}>
            <IconTrash />
            {t("action.delete")}
          </Button>
        </div>
      ) : null}
      <input
        ref={input}
        type="file"
        accept={IMAGE_TYPES}
        className="hidden"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
          event.target.value = "";
        }}
      />
    </div>
  );
}

export function AppGraphics({ app, locale, repositoryId, canWrite, version }: Props) {
  const { t } = useTranslation();
  const errors = useErrorText();
  const { store } = useAppCache(repositoryId, app.packageName);
  const [busy, setBusy] = useState<GraphicKind | null>(null);
  const [removing, setRemoving] = useState<GraphicKind | null>(null);
  const path = `/repositories/${repositoryId}/apps/${app.packageName}/graphics/${locale.locale}`;

  const upload = async (kind: GraphicKind, file: File) => {
    setBusy(kind);
    try {
      store(await apiRaw<AppDetail>(`${path}/${kind}`, { method: "PUT", body: file }));
    } catch (error) {
      toast.error(errors.fromError(error));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader title={t("app.graphics.title")} description={t("app.graphics.description")} />
      <CardBody className="grid gap-6 sm:grid-cols-2 xl:grid-cols-[auto_1fr_1fr_1fr]">
        {GRAPHIC_KINDS.map((kind) => {
          const url = locale.graphics[kind];
          return (
            <GraphicSlot
              key={kind}
              kind={kind}
              url={url ? `${url}?v=${version}` : null}
              canWrite={canWrite}
              busy={busy === kind}
              onFile={(file) => void upload(kind, file)}
              onRemove={() => setRemoving(kind)}
            />
          );
        })}
      </CardBody>
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        danger
        title={removing ? t("app.graphics.removeTitle", { kind: t(GRAPHIC_LABELS[removing]) }) : ""}
        description={t("app.graphics.removeDescription")}
        confirmLabel={t("action.delete")}
        onConfirm={async () => {
          if (!removing) return;
          try {
            store(await api<AppDetail>(`${path}/${removing}`, { method: "DELETE" }));
          } catch (error) {
            toast.error(errors.fromError(error));
          }
        }}
      />
    </Card>
  );
}
