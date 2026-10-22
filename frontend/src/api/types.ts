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

export type MaintenanceAction = "check" | "update" | "update-fdroidserver" | "grant";

export interface MaintenanceInfo {
  available: boolean;
  installed: { version: string; commit: string; fdroidserver: string } | null;
  latest: { checkedAt: string; version: string; commit: string; newer: boolean } | null;
}

export interface MaintenanceState {
  state: "waiting" | "running" | "succeeded" | "failed";
  code: string | null;
  params: Record<string, unknown>;
  log: string[];
}

export interface SessionPolicy {
  // null: never.
  idleDays: number | null;
  confirmMinutes: number | null;
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
  iconVersion: string | null;
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

export interface AppVersion {
  versionCode: number;
  versionName: string | null;
  file: string;
  section: "repo" | "archive";
  size: number;
  added: string | null;
  minSdk: number | null;
  targetSdk: number | null;
  signer: string | null;
  permissions: string[];
  published: boolean;
}

export interface AppSummary {
  packageName: string;
  name: string;
  summary: string | null;
  latestVersionName: string | null;
  latestVersionCode: number | null;
  versions: number;
  unpublished: number;
  hasMetadata: boolean;
  categories: string[];
  iconUrl: string | null;
}

export const GRAPHIC_KINDS = ["icon", "featureGraphic", "promoGraphic", "tvBanner"] as const;
export type GraphicKind = (typeof GRAPHIC_KINDS)[number];

export const SCREENSHOT_KINDS = [
  "phoneScreenshots",
  "sevenInchScreenshots",
  "tenInchScreenshots",
  "tvScreenshots",
  "wearScreenshots",
] as const;
export type ScreenshotKind = (typeof SCREENSHOT_KINDS)[number];

export interface AppLocale {
  locale: string;
  name: string;
  summary: string;
  description: string;
  graphics: Record<GraphicKind, string | null>;
  screenshots: Record<ScreenshotKind, string[]>;
}

export interface AppDetail extends AppSummary {
  metadata: Record<string, string | string[]>;
  legacyTexts: Partial<Record<"name" | "summary" | "description", string>>;
  locales: AppLocale[];
  versionList: AppVersion[];
  allowedSigners: string[];
}

export interface CheckItem {
  code: string;
  params: Record<string, unknown>;
}

export interface UploadChecks {
  newApp: boolean;
  blocking: CheckItem[];
  warnings: CheckItem[];
}

export interface UploadInfo {
  package: string;
  versionCode: number;
  versionName: string | null;
  minSdk: number | null;
  targetSdk: number | null;
  permissions: string[];
  label: string | null;
  signer: string | null;
  size: number;
  hasIcon: boolean;
}

export interface Upload {
  id: number;
  filename: string;
  size: number;
  received: number;
  status: "receiving" | "ready" | "rejected" | "added";
  info: UploadInfo | null;
  checks: UploadChecks | null;
}

export interface Category {
  id: string;
  names: Record<string, string>;
  apps: number;
}

export interface OfficialCategory {
  id: string;
  names: Record<string, string>;
}
