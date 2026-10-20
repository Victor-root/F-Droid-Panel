import { api, apiRaw, ApiError, isApiError } from "../../api/client";
import type { Upload } from "../../api/types";

const FIRST_CHUNK = 4 * 1024 * 1024;
const SMALLEST_CHUNK = 256 * 1024;

/**
 * Sends a file in chunks. A reverse proxy that refuses large request bodies (HTTP 413)
 * makes the chunks smaller until they go through.
 */
export async function sendFile(
  repositoryId: number,
  file: File,
  onProgress: (sent: number) => void,
  signal: AbortSignal,
): Promise<Upload> {
  let upload = await api<Upload>(`/repositories/${repositoryId}/uploads`, {
    method: "POST",
    body: { filename: file.name, size: file.size },
    signal,
  });
  let chunk = FIRST_CHUNK;
  while (upload.status === "receiving") {
    const offset = upload.received;
    const part = file.slice(offset, offset + chunk);
    // Reported when the chunk leaves: the answer to the last one only comes after the server checked the APK.
    onProgress(offset + part.size);
    try {
      upload = await apiRaw<Upload>(`/repositories/${repositoryId}/uploads/${upload.id}?offset=${offset}`, {
        method: "PUT",
        body: part,
        signal,
      });
    } catch (error) {
      if (error instanceof ApiError && error.status === 413 && chunk > SMALLEST_CHUNK) {
        chunk = Math.max(SMALLEST_CHUNK, Math.floor(chunk / 2));
      } else if (isApiError(error, "upload_offset")) {
        upload = { ...upload, received: Number(error.params.received) };
      } else {
        throw error;
      }
    }
  }
  return upload;
}
