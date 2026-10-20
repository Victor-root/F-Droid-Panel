import { queryOptions } from "@tanstack/react-query";

import { api, setCsrfToken } from "./client";
import type {
  AccessAccount,
  AppDetail,
  AppSummary,
  Category,
  Appearance,
  AuditEvent,
  AuthStatus,
  Job,
  MaintenanceInfo,
  MaintenanceState,
  Me,
  Page,
  Repository,
  RepositoryDetail,
  SessionInfo,
  SystemInfo,
  User,
} from "./types";

export const authStatusQuery = queryOptions({
  queryKey: ["auth", "status"],
  queryFn: () => api<AuthStatus>("/auth/status"),
  staleTime: 30_000,
});

export const meQuery = queryOptions({
  queryKey: ["me"],
  queryFn: async () => {
    const me = await api<Me>("/me");
    setCsrfToken(me.csrfToken);
    return me;
  },
  staleTime: 60_000,
});

export const appearanceQuery = queryOptions({
  queryKey: ["appearance"],
  queryFn: () => api<Appearance>("/appearance"),
  staleTime: 5 * 60_000,
});

export const usersQuery = queryOptions({
  queryKey: ["users"],
  queryFn: () => api<User[]>("/users"),
});

export const sessionsQuery = queryOptions({
  queryKey: ["me", "sessions"],
  queryFn: () => api<SessionInfo[]>("/me/sessions"),
});

export const systemQuery = queryOptions({
  queryKey: ["system"],
  queryFn: () => api<SystemInfo>("/system"),
});

export const maintenanceQuery = queryOptions({
  queryKey: ["system", "maintenance"],
  queryFn: () => api<MaintenanceInfo>("/system/maintenance"),
});

export function maintenanceRequestQuery(id: string) {
  return queryOptions({
    queryKey: ["system", "maintenance", id],
    queryFn: () => api<MaintenanceState>(`/system/maintenance/${id}`),
  });
}

export function jobsQuery(repositoryId?: number, limit = 50) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (repositoryId !== undefined) params.set("repositoryId", String(repositoryId));
  return queryOptions({
    queryKey: ["jobs", repositoryId ?? "all", limit],
    queryFn: () => api<Page<Job>>(`/jobs?${params}`),
  });
}

export function jobQuery(jobId: number) {
  return queryOptions({ queryKey: ["jobs", "detail", jobId], queryFn: () => api<Job>(`/jobs/${jobId}`) });
}

export function auditQuery(repositoryId?: number, limit = 50) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (repositoryId !== undefined) params.set("repositoryId", String(repositoryId));
  return queryOptions({
    queryKey: ["audit", repositoryId ?? "all", limit],
    queryFn: () => api<Page<AuditEvent>>(`/audit?${params}`),
  });
}

export const repositoriesQuery = queryOptions({
  queryKey: ["repositories"],
  queryFn: () => api<Repository[]>("/repositories"),
});

export function repositoryQuery(repositoryId: number) {
  return queryOptions({
    queryKey: ["repositories", repositoryId],
    queryFn: () => api<RepositoryDetail>(`/repositories/${repositoryId}`),
  });
}

export function accessAccountsQuery(repositoryId: number) {
  return queryOptions({
    queryKey: ["repositories", repositoryId, "access"],
    queryFn: () => api<AccessAccount[]>(`/repositories/${repositoryId}/access`),
  });
}

/** The repository icon through the API, so private repositories show theirs too. */
export function repositoryIconUrl(repository: { id: number; publishedAt: string | null }): string {
  return `/admin/api/repositories/${repository.id}/icon?v=${encodeURIComponent(repository.publishedAt ?? "")}`;
}

export function appsQuery(repositoryId: number) {
  return queryOptions({
    queryKey: ["repositories", repositoryId, "apps"],
    queryFn: () => api<AppSummary[]>(`/repositories/${repositoryId}/apps`),
  });
}

export function appQuery(repositoryId: number, packageName: string) {
  return queryOptions({
    queryKey: ["repositories", repositoryId, "apps", packageName],
    queryFn: () => api<AppDetail>(`/repositories/${repositoryId}/apps/${packageName}`),
  });
}

export function categoriesQuery(repositoryId: number) {
  return queryOptions({
    queryKey: ["repositories", repositoryId, "categories"],
    queryFn: () => api<Category[]>(`/repositories/${repositoryId}/categories`),
  });
}
