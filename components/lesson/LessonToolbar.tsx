"use client";

import type { DriveState, Lesson } from "@/lib/types";

export function LessonToolbar({
  lesson,
  isOwner,
  canFinish,
  driveBusy,
  driveConfigured,
  driveState,
  onDownload,
  onExport,
  onStatusChange,
}: {
  lesson: Lesson;
  isOwner: boolean;
  /** Zakończyć lekcję może właściciel i nauczyciel z tajnego linku, nie uczeń. */
  canFinish: boolean;
  driveBusy: boolean;
  driveConfigured: boolean;
  /** Stan eksportu bieżącego konta — uczeń ma własny plik na swoim Drive. */
  driveState: DriveState;
  onDownload: () => void;
  onExport: () => void;
  onStatusChange: (status: Lesson["status"]) => void;
}) {
  return (
    <section className="panel toolbar" data-tour="toolbar">
      <div className="toolbar-left">
        <button className="btn ghost" onClick={onDownload}>
          Pobierz JSON
        </button>
        <button
            className="btn secondary"
            disabled={driveBusy || !driveConfigured}
            title={
              driveConfigured
                ? undefined
                : "Brak NEXT_PUBLIC_GOOGLE_CLIENT_ID — dostępne jest pobranie pliku lokalnie."
            }
            onClick={onExport}
          >
            {driveBusy ? "Eksportuję…" : "Eksportuj na mój Google Drive"}
          </button>
        {driveState.last_exported_at && (
          <span className="small muted">
            Ostatni eksport: {new Date(driveState.last_exported_at).toLocaleString("pl-PL")}
          </span>
        )}
      </div>

      <div className="toolbar-right">
        {lesson.status === "draft"
          ? canFinish && (
              <button className="btn success" onClick={() => onStatusChange("finished")}>
                Zakończ lekcję
              </button>
            )
          : isOwner && (
              <button className="btn secondary" onClick={() => onStatusChange("draft")}>
                Otwórz ponownie
              </button>
            )}
      </div>
    </section>
  );
}
