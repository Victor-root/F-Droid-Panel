import { IconActivity, IconHistory, IconListCheck } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { auditQuery, jobsQuery } from "../api/queries";
import { AuditTable } from "../components/AuditTable";
import { JobDialog } from "../components/jobs/JobDialog";
import { JobTable } from "../components/jobs/JobTable";
import { PageHeader } from "../components/PageHeader";
import { Card } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { Skeleton } from "../components/ui/Skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/Tabs";

function Loading() {
  return (
    <div className="space-y-2 p-5">
      <Skeleton className="h-11" />
      <Skeleton className="h-11" />
      <Skeleton className="h-11" />
    </div>
  );
}

export function ActivityPage({ repositoryId }: { repositoryId?: number }) {
  const { t } = useTranslation();
  const jobs = useQuery({ ...jobsQuery(repositoryId), refetchInterval: 5000 });
  const audit = useQuery(auditQuery(repositoryId));
  const [openJob, setOpenJob] = useState<number | null>(null);

  const content = (
    <Tabs defaultValue="operations">
      <TabsList>
        <TabsTrigger value="operations">
          <IconListCheck />
          {t("activity.operations")}
        </TabsTrigger>
        <TabsTrigger value="history">
          <IconHistory />
          {t("activity.history")}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="operations">
        <Card>
          {jobs.data ? (
            jobs.data.items.length ? (
              <JobTable jobs={jobs.data.items} onOpen={setOpenJob} />
            ) : (
              <EmptyState icon={<IconActivity />} title={t("activity.empty.title")} description={t("activity.empty.description")} />
            )
          ) : (
            <Loading />
          )}
        </Card>
      </TabsContent>
      <TabsContent value="history">
        <Card>{audit.data ? <AuditTable events={audit.data.items} /> : <Loading />}</Card>
      </TabsContent>
    </Tabs>
  );

  return (
    <>
      {repositoryId === undefined ? <PageHeader title={t("activity.title")} description={t("activity.description")} /> : null}
      {content}
      <JobDialog jobId={openJob} onClose={() => setOpenJob(null)} />
    </>
  );
}
