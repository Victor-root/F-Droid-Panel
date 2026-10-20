import { useTranslation } from "react-i18next";

import type { AuditEvent } from "../api/types";
import { useFormat } from "../lib/format";
import { AUDIT_ACTION_LABELS, labelKey } from "../lib/labels";
import { Avatar } from "./ui/Avatar";
import { Table, Td, Th, Tr } from "./ui/Table";

export function AuditTable({ events }: { events: AuditEvent[] }) {
  const { t } = useTranslation();
  const format = useFormat();

  return (
    <Table>
      <thead>
        <tr>
          <Th>{t("audit.columns.event")}</Th>
          <Th className="hidden sm:table-cell">{t("audit.columns.by")}</Th>
          <Th className="hidden md:table-cell">{t("audit.columns.address")}</Th>
          <Th>{t("audit.columns.when")}</Th>
        </tr>
      </thead>
      <tbody>
        {events.map((event) => {
          const key = labelKey(AUDIT_ACTION_LABELS, event.action);
          return (
            <Tr key={event.id}>
              <Td>
                <div className="font-medium">{key ? t(key) : event.action}</div>
                {event.target ? <div className="text-xs text-muted">{event.target}</div> : null}
              </Td>
              <Td className="hidden sm:table-cell">
                {event.username ? (
                  <span className="inline-flex items-center gap-2">
                    <Avatar name={event.username} size="sm" className="size-6 rounded-md text-[10px]" />
                    {event.username}
                  </span>
                ) : (
                  <span className="text-muted">{t("audit.anonymous")}</span>
                )}
              </Td>
              <Td className="hidden font-mono text-xs text-muted md:table-cell">{event.ip}</Td>
              <Td className="text-muted" title={format.dateTime(event.at)}>
                {format.relative(event.at)}
              </Td>
            </Tr>
          );
        })}
      </tbody>
    </Table>
  );
}
