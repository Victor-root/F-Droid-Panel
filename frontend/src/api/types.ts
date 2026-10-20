export type Role = "admin" | "maintainer" | "viewer";
export type ThemePreference = "light" | "dark" | "system";

export interface AuthStatus {
  setupRequired: boolean;
  authenticated: boolean;
  secondFactorRequired: boolean;
}

export interface User {
  id: number;
  username: string;
  displayName: string;
  role: Role;
  disabled: boolean;
  totpEnabled: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  repositoryIds: number[];
}

export interface Me extends User {
  theme: ThemePreference;
  language: string | null;
  csrfToken: string;
}

export interface SessionInfo {
  id: number;
  createdAt: string;
  lastSeenAt: string;
  ip: string;
  userAgent: string;
  current: boolean;
}

export interface Appearance {
  accent: string;
}

export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "interrupted";

export interface ErrorInfo {
  code: string;
  params: Record<string, unknown>;
}

export interface Job {
  id: number;
  repositoryId: number | null;
  kind: string;
  status: JobStatus;
  createdBy: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  error: ErrorInfo | null;
  result: Record<string, unknown> | null;
}

export interface AuditEvent {
  id: number;
  at: string;
  username: string | null;
  ip: string | null;
  action: string;
  repositoryId: number | null;
  target: string | null;
  details: Record<string, unknown> | null;
}

export interface Page<T> {
  items: T[];
  total: number;
}

export interface SystemInfo {
  version: string;
  publicUrl: string;
  python: string;
  fdroid: {
    command: string;
    version: string | null;
    error: string | null;
    supported: boolean;
    minimumVersion: string;
  };
  selfTest: Job | null;
  disk: { total: number; free: number };
}

export interface Repository {
  id: number;
  slug: string;
  name: string;
  path: string;
  urlPrefix: string;
  repoUrl: string;
  private: boolean;
  servedByPanel: boolean;
  autoPublish: boolean;
  createdByPanel: boolean;
  fingerprint: string | null;
  publishedAt: string | null;
  pendingChanges: number;
  apps: number;
  apks: number;
  lastJob: Job | null;
}

export interface PendingChange {
  at: string;
  username: string | null;
  kind: string;
  target: string | null;
}

export interface RepositoryDetail extends Repository {
  description: string;
  archiveOlder: number;
  changes: PendingChange[];
  canWrite: boolean;
}

export interface Inspection {
  path: string;
  exists: boolean;
  isRepository: boolean;
  writable: boolean;
  repoUrl: string | null;
  repoName: string | null;
  repoDescription: string | null;
  archiveOlder: number | null;
  keystoreFound: boolean;
  passwordsInConfig: boolean;
  apps: number;
  apks: number;
  publishedAt: string | null;
  fingerprint: string | null;
  problems: string[];
  urlPrefix: string | null;
  alreadyRegistered: boolean;
}

export interface AccessAccount {
  id: number;
  username: string;
  label: string;
  disabled: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface Backup {
  name: string;
  reason: string;
  createdAt: string;
  files: number;
}

export interface PublishResult {
  apps: number;
  versions: number;
  archived: number;
  leftOut: { file: string; reason: string }[];
  fingerprint: string;
  backup: string;
}
