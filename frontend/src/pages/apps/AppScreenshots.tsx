import { closestCenter, DndContext, type DragEndEvent, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, rectSortingStrategy, SortableContext, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { IconGripVertical, IconPhotoPlus, IconTrash } from "@tabler/icons-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { api, apiRaw } from "../../api/client";
import { type AppDetail, type AppLocale, SCREENSHOT_KINDS, type ScreenshotKind } from "../../api/types";
import { Button } from "../../components/ui/Button";
import { Card, CardBody, CardHeader } from "../../components/ui/Card";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { Spinner } from "../../components/ui/Spinner";
import { toast } from "../../components/ui/Toast";
import { cn } from "../../lib/cn";
import { useErrorText } from "../../lib/errors";
import { IMAGE_TYPES } from "./AppGraphics";
import { useAppCache } from "./useAppCache";

const SCREENSHOT_LABELS = {
  phoneScreenshots: "app.screenshots.phone",
  sevenInchScreenshots: "app.screenshots.sevenInch",
  tenInchScreenshots: "app.screenshots.tenInch",
  tvScreenshots: "app.screenshots.tv",
  wearScreenshots: "app.screenshots.wear",
} as const satisfies Record<ScreenshotKind, string>;

interface Props {
  app: AppDetail;
  locale: AppLocale;
  repositoryId: number;
  canWrite: boolean;
  version: number;
}

function fileName(url: string): string {
  return url.slice(url.lastIndexOf("/") + 1);
}

function Screenshot({ url, index, canWrite, version, onRemove }: { url: string; index: number; canWrite: boolean; version: number; onRemove: () => void }) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: url, disabled: !canWrite });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("group relative overflow-hidden rounded-xl border border-border bg-surface-2 shadow-soft", isDragging && "z-10 shadow-raised ring-2 ring-accent-strong")}
    >
      <img src={`${url}?v=${version}`} alt={t("app.screenshots.alt", { number: index + 1 })} className="aspect-[9/16] w-full object-cover" />
      {canWrite ? (
        <div className="absolute inset-x-0 top-0 flex justify-between p-1.5 opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
          <button
            type="button"
            className="flex size-8 cursor-grab touch-none items-center justify-center rounded-lg bg-surface/90 text-text shadow-soft active:cursor-grabbing"
            aria-label={t("app.screenshots.move", { number: index + 1 })}
            {...attributes}
            {...listeners}
          >
            <IconGripVertical className="size-4" />
          </button>
          <button
            type="button"
            className="flex size-8 items-center justify-center rounded-lg bg-surface/90 text-danger-text shadow-soft"
            aria-label={t("app.screenshots.remove", { number: index + 1 })}
            onClick={onRemove}
          >
            <IconTrash className="size-4" />
          </button>
        </div>
      ) : null}
      <span className="absolute bottom-1.5 left-1.5 rounded-md bg-surface/90 px-1.5 text-xs font-medium text-text tabular-nums">{index + 1}</span>
    </li>
  );
}

function ScreenshotGrid({ app, locale, kind, repositoryId, canWrite, version }: Props & { kind: ScreenshotKind }) {
  const { t } = useTranslation();
  const errors = useErrorText();
  const { store } = useAppCache(repositoryId, app.packageName);
  const input = useRef<HTMLInputElement>(null);
  const [order, setOrder] = useState(locale.screenshots[kind]);
  const [adding, setAdding] = useState(0);
  const [removing, setRemoving] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const path = `/repositories/${repositoryId}/apps/${app.packageName}/screenshots/${locale.locale}/${kind}`;

  const add = async (files: File[]) => {
    let latest: AppDetail | null = null;
    for (const [index, file] of files.entries()) {
      setAdding(files.length - index);
      try {
        latest = await apiRaw<AppDetail>(path, { method: "POST", body: file });
      } catch (error) {
        toast.error(errors.fromError(error), file.name);
      }
    }
    setAdding(0);
    if (latest) store(latest);
  };

  const move = async ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const previous = order;
    const next = arrayMove(order, order.indexOf(String(active.id)), order.indexOf(String(over.id)));
    setOrder(next);
    try {
      store(await api<AppDetail>(path, { method: "PUT", body: { order: next.map(fileName) } }));
    } catch (error) {
      setOrder(previous);
      toast.error(errors.fromError(error));
    }
  };

  return (
    <>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(event) => void move(event)}>
        <SortableContext items={order} strategy={rectSortingStrategy}>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {order.map((url, index) => (
              <Screenshot key={url} url={url} index={index} canWrite={canWrite} version={version} onRemove={() => setRemoving(url)} />
            ))}
            {canWrite ? (
              <li>
                <button
                  type="button"
                  disabled={adding > 0}
                  onClick={() => input.current?.click()}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (event.dataTransfer.files.length > 0) void add(Array.from(event.dataTransfer.files));
                  }}
                  className="flex aspect-[9/16] w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border-strong bg-surface p-3 text-center text-xs text-muted transition-colors hover:border-accent-strong hover:bg-accent-soft hover:text-accent-soft-text"
                >
                  {adding > 0 ? <Spinner /> : <IconPhotoPlus className="size-7" />}
                  {adding > 0 ? t("app.screenshots.adding", { count: adding }) : t("app.screenshots.add")}
                </button>
              </li>
            ) : null}
          </ul>
        </SortableContext>
      </DndContext>
      {order.length === 0 && !canWrite ? <p className="text-sm text-muted">{t("app.screenshots.none")}</p> : null}
      <input
        ref={input}
        type="file"
        accept={IMAGE_TYPES}
        multiple
        className="hidden"
        tabIndex={-1}
        onChange={(event) => {
          if (event.target.files?.length) void add(Array.from(event.target.files));
          event.target.value = "";
        }}
      />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        danger
        title={t("app.screenshots.removeTitle")}
        description={t("app.graphics.removeDescription")}
        confirmLabel={t("action.delete")}
        onConfirm={async () => {
          if (!removing) return;
          try {
            store(await api<AppDetail>(`${path}/${fileName(removing)}`, { method: "DELETE" }));
          } catch (error) {
            toast.error(errors.fromError(error));
          }
        }}
      />
    </>
  );
}

export function AppScreenshots(props: Props) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<ScreenshotKind>("phoneScreenshots");
  const { locale, version } = props;

  return (
    <Card>
      <CardHeader title={t("app.screenshots.title")} description={t("app.screenshots.description")} />
      <CardBody className="flex flex-col gap-5">
        <div className="flex flex-wrap gap-2" role="group" aria-label={t("app.screenshots.device")}>
          {SCREENSHOT_KINDS.map((item) => (
            <Button key={item} size="sm" variant={item === kind ? "soft" : "ghost"} aria-pressed={item === kind} onClick={() => setKind(item)}>
              {t(SCREENSHOT_LABELS[item])}
              <span className="rounded-full bg-surface-3 px-1.5 text-[0.7rem] text-muted tabular-nums">{locale.screenshots[item].length}</span>
            </Button>
          ))}
        </div>
        <ScreenshotGrid key={`${locale.locale}-${kind}-${version}`} {...props} kind={kind} />
      </CardBody>
    </Card>
  );
}
