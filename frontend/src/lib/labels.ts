import type { JobStatus, Role } from "../api/types";
import type { BadgeTone } from "../components/ui/Badge";

export const ROLE_LABELS = {
  admin: "roles.admin",
  maintainer: "roles.maintainer",
  viewer: "roles.viewer",
} as const satisfies Record<Role, string>;

export const ROLE_DESCRIPTIONS = {
  admin: "roles.adminDescription",
  maintainer: "roles.maintainerDescription",
  viewer: "roles.viewerDescription",
} as const satisfies Record<Role, string>;

export const JOB_STATUS_LABELS = {
  queued: "jobs.status.queued",
  running: "jobs.status.running",
  succeeded: "jobs.status.succeeded",
  failed: "jobs.status.failed",
  interrupted: "jobs.status.interrupted",
} as const satisfies Record<JobStatus, string>;

export const JOB_STATUS_TONES: Record<JobStatus, BadgeTone> = {
  queued: "neutral",
  running: "info",
  succeeded: "success",
  failed: "danger",
  interrupted: "warning",
};

// Job kinds, extended as features add jobs.
export const JOB_KIND_LABELS = {
  self_test: "jobs.kind.selfTest",
  publish: "jobs.kind.publish",
  create: "jobs.kind.create",
  rollback: "jobs.kind.rollback",
} as const;

// Kinds of changes waiting for a publication.
export const CHANGE_KIND_LABELS = {
  settings: "changes.settings",
  version_added: "changes.versionAdded",
  app_added: "changes.appAdded",
  version_deleted: "changes.versionDeleted",
  app_deleted: "changes.appDeleted",
  app_texts: "changes.appTexts",
  app_metadata: "changes.appMetadata",
  app_graphics: "changes.appGraphics",
  app_screenshots: "changes.appScreenshots",
  categories: "changes.categories",
  icon: "changes.repositoryIcon",
} as const;

// Why fdroidserver left an APK out of the index.
export const LEFT_OUT_LABELS = {
  signer_not_allowed: "publish.reason.signerNotAllowed",
  no_metadata: "publish.reason.noMetadata",
} as const;

// Audit actions, extended as features add actions.
export const AUDIT_ACTION_LABELS = {
  "user.setup": "audit.action.userSetup",
  "auth.login": "audit.action.authLogin",
  "auth.login_failed": "audit.action.authLoginFailed",
  "auth.second_factor_failed": "audit.action.authSecondFactorFailed",
  "user.password_changed": "audit.action.userPasswordChanged",
  "user.second_factor_enabled": "audit.action.userSecondFactorEnabled",
  "user.second_factor_disabled": "audit.action.userSecondFactorDisabled",
  "user.recovery_codes_regenerated": "audit.action.userRecoveryCodesRegenerated",
  "user.created": "audit.action.userCreated",
  "user.updated": "audit.action.userUpdated",
  "user.password_reset": "audit.action.userPasswordReset",
  "user.second_factor_reset": "audit.action.userSecondFactorReset",
  "user.deleted": "audit.action.userDeleted",
  "settings.appearance": "audit.action.settingsAppearance",
  "settings.sessions": "audit.action.settingsSessions",
  "system.self_test": "audit.action.systemSelfTest",
  "system.maintenance": "audit.action.systemMaintenance",
  "repository.imported": "audit.action.repositoryImported",
  "repository.created": "audit.action.repositoryCreated",
  "repository.updated": "audit.action.repositoryUpdated",
  "repository.settings": "audit.action.repositorySettings",
  "repository.publish": "audit.action.repositoryPublish",
  "repository.rollback": "audit.action.repositoryRollback",
  "repository.discarded": "audit.action.repositoryDiscarded",
  "repository.unregistered": "audit.action.repositoryUnregistered",
  "access.created": "audit.action.accessCreated",
  "access.deleted": "audit.action.accessDeleted",
  "access.password_changed": "audit.action.accessPasswordChanged",
  "key.created": "audit.action.keyCreated",
  "key.deleted": "audit.action.keyDeleted",
  "app.version_added": "audit.action.appVersionAdded",
  "app.app_added": "audit.action.appAdded",
  "app.version_deleted": "audit.action.appVersionDeleted",
  "app.app_deleted": "audit.action.appDeleted",
  "app.app_texts": "audit.action.appTexts",
  "app.app_metadata": "audit.action.appMetadata",
  "app.app_graphics": "audit.action.appGraphics",
  "app.app_screenshots": "audit.action.appScreenshots",
  "repository.categories": "audit.action.repositoryCategories",
  "repository.icon": "audit.action.repositoryIcon",
} as const;

/** The translation key of a value found in a label map, or undefined for a value this version does not know. */
export function labelKey<T extends Record<string, string>>(labels: T, value: string): T[keyof T] | undefined {
  return Object.hasOwn(labels, value) ? labels[value as keyof T] : undefined;
}
