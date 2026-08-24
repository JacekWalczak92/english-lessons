"use client";

import type { LessonExportV1 } from "@/lib/types";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const FOLDER_MIME = "application/vnd.google-apps.folder";

type GoogleTokenResponse = { access_token?: string; error?: string; error_description?: string };
type TokenClient = { requestAccessToken: (options?: { prompt?: string }) => void };

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient(config: {
            client_id: string;
            scope: string;
            callback: (response: GoogleTokenResponse) => void;
          }): TokenClient;
        };
      };
    };
  }
}

async function driveFetch<T>(token: string, url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
  const text = await response.text();
  if (!response.ok) {
    let message = text || `Google Drive: HTTP ${response.status}`;
    try {
      const parsed = JSON.parse(text);
      message = parsed?.error?.message || message;
    } catch {}
    throw new Error(message);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

export async function requestDriveToken(clientId: string): Promise<string> {
  if (!window.google?.accounts?.oauth2) {
    throw new Error("Biblioteka Google Identity Services nie została jeszcze załadowana. Spróbuj ponownie.");
  }
  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      callback: (response) => {
        if (response.access_token) resolve(response.access_token);
        else reject(new Error(response.error_description || response.error || "Nie udało się uzyskać dostępu do Google Drive"));
      },
    });
    client.requestAccessToken({ prompt: "" });
  });
}

function escapeDriveQuery(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

async function findFolder(token: string, name: string, parentId?: string) {
  const q = [
    `name = '${escapeDriveQuery(name)}'`,
    `mimeType = '${FOLDER_MIME}'`,
    "trashed = false",
    parentId ? `'${parentId}' in parents` : undefined,
  ].filter(Boolean).join(" and ");
  const params = new URLSearchParams({ q, spaces: "drive", fields: "files(id,name)" });
  const data = await driveFetch<{ files: Array<{ id: string; name: string }> }>(
    token,
    `https://www.googleapis.com/drive/v3/files?${params}`,
  );
  return data.files?.[0]?.id ?? null;
}

async function createFolder(token: string, name: string, parentId?: string) {
  const data = await driveFetch<{ id: string }>(token, "https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      mimeType: FOLDER_MIME,
      ...(parentId ? { parents: [parentId] } : {}),
    }),
  });
  return data.id;
}

async function ensureFolder(token: string, name: string, parentId?: string) {
  return (await findFolder(token, name, parentId)) ?? createFolder(token, name, parentId);
}

async function findFile(token: string, name: string, folderId: string) {
  const q = [
    `name = '${escapeDriveQuery(name)}'`,
    `'${folderId}' in parents`,
    "trashed = false",
  ].join(" and ");
  const params = new URLSearchParams({ q, spaces: "drive", fields: "files(id,name)" });
  const data = await driveFetch<{ files: Array<{ id: string; name: string }> }>(
    token,
    `https://www.googleapis.com/drive/v3/files?${params}`,
  );
  return data.files?.[0] ?? null;
}

async function createJsonFile(token: string, folderId: string, fileName: string, payload: LessonExportV1) {
  const boundary = `jlearner_${crypto.randomUUID()}`;
  const metadata = JSON.stringify({ name: fileName, parents: [folderId], mimeType: "application/json" });
  const content = JSON.stringify(payload, null, 2);
  const body = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    metadata,
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    content,
    `--${boundary}--`,
    "",
  ].join("\r\n");

  return driveFetch<{ id: string; name: string }>(
    token,
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name",
    {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    },
  );
}

async function updateJsonFile(token: string, fileId: string, fileName: string, payload: LessonExportV1) {
  await driveFetch(token, `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: fileName }),
  });
  await driveFetch(token, `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify(payload, null, 2),
  });
  return { id: fileId, name: fileName };
}

export async function exportLessonToDrive(options: {
  clientId: string;
  fileName: string;
  payload: LessonExportV1;
  existingFileId?: string | null;
}) {
  const token = await requestDriveToken(options.clientId);
  const rootId = await ensureFolder(token, "J-Learner");
  const lessonsId = await ensureFolder(token, "EnglishLessons", rootId);

  if (options.existingFileId) {
    try {
      return await updateJsonFile(token, options.existingFileId, options.fileName, options.payload);
    } catch {
      // File mógł zostać usunięty lub token drive.file nie ma już do niego dostępu.
    }
  }

  const existing = await findFile(token, options.fileName, lessonsId);
  if (existing?.id) return updateJsonFile(token, existing.id, options.fileName, options.payload);
  return createJsonFile(token, lessonsId, options.fileName, options.payload);
}
