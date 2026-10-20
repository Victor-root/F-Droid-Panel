import { useTranslation } from "react-i18next";

import { ApiError } from "../api/client";

// Every code the backend can return, mapped to its translation key.
const ERROR_KEYS = {
  network_error: "errors.networkError",
  unexpected_error: "errors.unexpectedError",
  internal_error: "errors.unexpectedError",
  not_authenticated: "errors.notAuthenticated",
  forbidden: "errors.forbidden",
  csrf: "errors.csrf",
  not_found: "errors.notFound",
  invalid_request: "errors.invalidRequest",
  invalid_credentials: "errors.invalidCredentials",
  invalid_second_factor: "errors.invalidSecondFactor",
  invalid_setup_code: "errors.invalidSetupCode",
  too_many_attempts: "errors.tooManyAttempts",
  reauthentication_required: "errors.reauthenticationRequired",
  username_taken: "errors.usernameTaken",
  last_admin: "errors.lastAdmin",
  cannot_disable_self: "errors.cannotDisableSelf",
  cannot_delete_self: "errors.cannotDeleteSelf",
  user_not_found: "errors.userNotFound",
  second_factor_already_enabled: "errors.secondFactorAlreadyEnabled",
  second_factor_not_started: "errors.secondFactorNotStarted",
  second_factor_not_enabled: "errors.secondFactorNotEnabled",
  unsupported_language: "errors.unsupportedLanguage",
  repository_not_found: "errors.repositoryNotFound",
  job_not_found: "errors.jobNotFound",
  invalid_username: "errors.invalidUsername",
  password_too_short: "errors.passwordTooShort",
  missing: "errors.missing",
  string_too_short: "errors.missing",
  invalid_color: "errors.invalidColor",
  interrupted: "errors.interrupted",
  command_failed: "errors.commandFailed",
  command_timeout: "errors.commandTimeout",
  fdroid_not_found: "errors.fdroidNotFound",
  fdroid_not_runnable: "errors.fdroidNotRunnable",
  self_test_not_published: "errors.selfTestNotPublished",
  invalid_slug: "errors.invalidSlug",
  invalid_url_prefix: "errors.invalidUrlPrefix",
  slug_taken: "errors.slugTaken",
  url_prefix_taken: "errors.urlPrefixTaken",
  repository_already_registered: "errors.repositoryAlreadyRegistered",
  directory_not_empty: "errors.directoryNotEmpty",
  path_not_absolute: "errors.pathNotAbsolute",
  path_not_found: "errors.pathNotFound",
  not_a_repository: "errors.notARepository",
  not_writable: "errors.notWritable",
  config_unreadable: "errors.configUnreadable",
  repo_url_missing: "errors.repoUrlMissing",
  repo_url_invalid: "errors.repoUrlInvalid",
  keystore_missing: "errors.keystoreMissing",
  keystore_readable_by_others: "errors.keystoreReadableByOthers",
  index_not_written: "errors.indexNotWritten",
  index_not_signed: "errors.indexNotSigned",
  signing_key_changed: "errors.signingKeyChanged",
  nothing_to_roll_back: "errors.nothingToRollBack",
  access_account_not_found: "errors.accessAccountNotFound",
  app_not_found: "errors.appNotFound",
  version_not_found: "errors.versionNotFound",
  upload_not_found: "errors.uploadNotFound",
  upload_complete: "errors.uploadComplete",
  upload_not_ready: "errors.uploadNotReady",
  upload_offset: "errors.uploadOffset",
  upload_too_large: "errors.uploadTooLarge",
  upload_failed: "errors.uploadFailed",
  bundle_not_supported: "errors.bundleNotSupported",
  not_an_apk: "errors.notAnApk",
  no_version_code: "errors.noVersionCode",
  not_signed: "errors.notSigned",
  signer_mismatch: "errors.signerMismatch",
  version_exists: "errors.versionExists",
  older_version: "errors.olderVersion",
  new_permissions: "errors.newPermissions",
  invalid_package: "errors.invalidPackage",
  invalid_locale: "errors.invalidLocale",
  invalid_field: "errors.invalidField",
  invalid_anti_feature: "errors.invalidAntiFeature",
  invalid_graphic: "errors.invalidGraphic",
  invalid_screenshot_type: "errors.invalidScreenshotType",
  screenshot_not_found: "errors.screenshotNotFound",
  screenshots_changed: "errors.screenshotsChanged",
  image_too_large: "errors.imageTooLarge",
  unsupported_image: "errors.unsupportedImage",
  name_too_long: "errors.nameTooLong",
  summary_too_long: "errors.summaryTooLong",
  description_too_long: "errors.descriptionTooLong",
  maintenance_unavailable: "errors.maintenanceUnavailable",
  download_failed: "errors.downloadFailed",
  install_failed: "errors.installFailed",
  rolled_back: "errors.rolledBack",
  rollback_failed: "errors.rollbackFailed",
  not_installed: "errors.notInstalled",
  path_not_allowed: "errors.pathNotAllowed",
  failed: "errors.failed",
  icon_not_png: "errors.iconNotPng",
  access_password_unknown: "access.passwordUnknown",
} as const;

type ErrorCode = keyof typeof ERROR_KEYS;

function keyFor(code: string) {
  return code in ERROR_KEYS ? ERROR_KEYS[code as ErrorCode] : ERROR_KEYS.unexpected_error;
}

export interface FieldError {
  field: string;
  code: string;
}

/** Translates API errors, job errors and validation codes into sentences. */
export function useErrorText() {
  const { t } = useTranslation();

  // Parameters come from the server, so they cannot be checked against each message's placeholders.
  const translate = t as unknown as (key: string, options: Record<string, unknown>) => string;
  const message = (code: string, params: Record<string, unknown> = {}) => translate(keyFor(code), params);

  const fromError = (error: unknown): string => {
    if (error instanceof ApiError) {
      const fields = (error.params.fields as FieldError[] | undefined) ?? [];
      const first = fields[0];
      return first && error.code === "invalid_request" ? message(first.code) : message(error.code, error.params);
    }
    return message("unexpected_error");
  };

  /** Validation messages per field, for forms. */
  const fieldErrors = (error: unknown): Record<string, string> => {
    if (!(error instanceof ApiError) || error.code !== "invalid_request") return {};
    const fields = (error.params.fields as FieldError[] | undefined) ?? [];
    return Object.fromEntries(fields.map((item) => [item.field, message(item.code)]));
  };

  return { message, fromError, fieldErrors };
}
