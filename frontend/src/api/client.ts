const API_BASE = "/admin/api";

let csrfToken = "";

/** Every state changing request of a session carries this token (see backend auth.py). */
export function setCsrfToken(token: string): void {
  csrfToken = token;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly params: Record<string, unknown>;

  constructor(status: number, code: string, params: Record<string, unknown> = {}) {
    super(code);
    this.status = status;
    this.code = code;
    this.params = params;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
}

interface RawRequestOptions {
  method: "POST" | "PUT";
  body: Blob;
  signal?: AbortSignal;
}

/** Sends a file or a part of a file as the request body. */
export function apiRaw<T>(path: string, { method, body, signal }: RawRequestOptions): Promise<T> {
  return send<T>(path, method, body, "application/octet-stream", signal);
}

export function api<T>(path: string, { method = "GET", body, signal }: RequestOptions = {}): Promise<T> {
  return send<T>(path, method, body === undefined ? undefined : JSON.stringify(body), "application/json", signal);
}

async function send<T>(
  path: string,
  method: string,
  body: BodyInit | undefined,
  contentType: string,
  signal: AbortSignal | undefined,
): Promise<T> {
  const headers: Record<string, string> = { "X-Requested-With": "fdroid-panel" };
  if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
  if (body !== undefined) headers["Content-Type"] = contentType;

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { method, headers, body, credentials: "same-origin", signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(0, "network_error");
  }

  if (response.status === 204) return undefined as T;
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (payload as { error?: { code?: string; params?: Record<string, unknown> } } | null)?.error;
    throw new ApiError(response.status, error?.code ?? "unexpected_error", error?.params ?? {});
  }
  return payload as T;
}

export function isApiError(error: unknown, code?: string): error is ApiError {
  return error instanceof ApiError && (code === undefined || error.code === code);
}
