import { queryOptions } from "@tanstack/react-query";

import { api, setCsrfToken } from "./client";
import type { Appearance, AuditEvent, AuthStatus, Job, Me, Page, SessionInfo, SystemInfo, User } from "./types";

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
