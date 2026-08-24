"use client";

import type { LessonExportV1 } from "@/lib/types";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const GSI_SRC = "https://accounts.google.com/gsi/client";
const ROOT_FOLDER = "J-Learner";
const LESSONS_FOLDER = "EnglishLessons";

export const DRIVE_FOLDER_PATH = `${ROOT_FOLDER}/${LESSONS_FOLDER}`;

type GoogleTokenResponse = { access_token?: string; error?: string; error_description?: string };
type GoogleTokenError = { type?: string; message?: string };
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
            error_callback?: (error: GoogleTokenError) => void;
          }): TokenClient;
        };
      };
    };
  }
}

let gsiPromise: Promise<void> | null = null;

/**
 * Ładuje Google Identity Services dopiero przy pierwszym eksporcie.
 *
 * W v1.2.0 skrypt Google był wstrzykiwany na każdym otwarciu lekcji — także
 * u nauczyciela, który nigdy nie eksportuje na Drive. To zbędne żądanie do
 * Google przy każdym wejściu w tajny link.
 */
function loadGoogleIdentity(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("Brak przeglądarki"));
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gsiPromise) return gsiPromise;

  gsiPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GSI_SRC}"]`);
    const script = existing ?? document.createElement("script");
    const timeout = window.setTimeout(() => {
      gsiPromise = null;
      reject(new Error("Nie udało się załadować Google Identity Services (limit czasu)."));
    }, 15000);

    script.addEventListener("load", () => {
      window.clearTimeout(timeout);
      resolve();
    });
    script.addEventListener("error", () => {
      window.clearTimeout(timeout);
      gsiPromise = null;
      reject(new Error("Nie udało się załadować Google Identity Services."));
    });

    if (!existing) {
      script.src = GSI_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
  });

  return gsiPromise;
}

async function driveFetch<T>(token: string, url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
  });
  const text = await response.text();
  if (!response.ok) {
    let message = `Google Drive: HTTP ${response.status}`;
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string } };
      if (parsed?.error?.message) message = `Google Drive: ${parsed.error.message}`;
    } catch {
      if (text) message = `Google Drive: ${text.slice(0, 200)}`;
    }
    throw new Error(message);
  }
  return text ? (JSON.parse(text) as T) : ({} as T);
}

/**
 * Prosi o token dostępu do Drive.
 *
 * Poprawka względem v1.2.0: obsługujemy `error_callback`. Wcześniej zamknięcie
 * okienka Google zostawiało wiszącą obietnicę — przycisk eksportu zostawał
 * na zawsze w stanie „Eksportuję…”.
 */
export async function requestDriveToken(clientId: string): Promise<string> {
  await loadGoogleIdentity();
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) throw new Error("Google Identity Services jest niedostępne.");

  return new Promise<string>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      callback: (response) => {
        if (response.access_token) finish(() => resolve(response.access_token as string));
        else
          finish(() =>
            reject(
              new Error(
                response.error_description || response.error || "Google nie zwróciło tokenu.",
              ),
            ),
          );
      },
      error_callback: (error) => {
        const message =
          error?.type === "popup_closed"
            ? "Okno logowania Google zostało zamknięte."
            : error?.type === "popup_failed_to_open"
              ? "Przeglądarka zablokowała okno Google. Zezwól na wyskakujące okienka i spróbuj ponownie."
              : (error?.message ?? "Nie udało się uzyskać dostępu do Google Drive.");
        finish(() => reject(new Error(message)));
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
  ]
    .filter(Boolean)
    .join(" and ");
  const params = new URLSearchParams({ q, spaces: "drive", fields: "files(id,name)" });
  const data = await driveFetch<{ files?: Array<{ id: string; name: string }> }>(
    token,
    `https://www.googleapis.com/drive/v3/files?${params}`,
  );
  return data.files?.[0]?.id ?? null;
}

async function createFolder(token: string, name: string, parentId?: string) {
  const data = await driveFetch<{ id: string }>(
    token,
    "https://www.googleapis.com/drive/v3/files?fields=id",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        mimeType: FOLDER_MIME,
        ...(parentId ? { parents: [parentId] } : {}),
      }),
    },
  );
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
  const data = await driveFetch<{ files?: Array<{ id: string; name: string }> }>(
    token,
    `https://www.googleapis.com/drive/v3/files?${params}`,
  );
  return data.files?.[0] ?? null;
}

async function createJsonFile(
  token: string,
  folderId: string,
  fileName: string,
  payload: LessonExportV1,
) {
  const boundary = `jlearner_${crypto.randomUUID()}`;
  const metadata = JSON.stringify({
    name: fileName,
    parents: [folderId],
    mimeType: "application/json",
  });
  const body = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    metadata,
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(payload, null, 2),
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

async function updateJsonFile(
  token: string,
  fileId: string,
  fileName: string,
  payload: LessonExportV1,
) {
  await driveFetch(
    token,
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: fileName }),
    },
  );
  await driveFetch(
    token,
    `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify(payload, null, 2),
    },
  );
  return { id: fileId, name: fileName };
}

export async function exportLessonToDrive(options: {
  clientId: string;
  fileName: string;
  payload: LessonExportV1;
  existingFileId?: string | null;
}) {
  const token = await requestDriveToken(options.clientId);
  const rootId = await ensureFolder(token, ROOT_FOLDER);
  const lessonsId = await ensureFolder(token, LESSONS_FOLDER, rootId);

  if (options.existingFileId) {
    try {
      return await updateJsonFile(token, options.existingFileId, options.fileName, options.payload);
    } catch {
      // Plik mógł zostać usunięty albo token drive.file stracił do niego dostęp —
      // spadamy do wyszukania po nazwie i ewentualnego utworzenia od nowa.
    }
  }

  const existing = await findFile(token, options.fileName, lessonsId);
  if (existing?.id) return updateJsonFile(token, existing.id, options.fileName, options.payload);
  return createJsonFile(token, lessonsId, options.fileName, options.payload);
}
