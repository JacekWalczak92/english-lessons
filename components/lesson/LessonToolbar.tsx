"use client";

import type { Lesson } from "@/lib/types";

export function LessonToolbar({
  lesson,
  isOwner,
  driveBusy,
  driveConfigured,
  onDownload,
  onExport,
  onStatusChange,
}: {
  lesson: Lesson;
  isOwner: boolean;
  driveBusy: boolean;
  driveConfigured: boolean;
  onDownload: () => void;
  onExport: () => void;
  onStatusChange: (status: Lesson["status"]) => void;
}) {
  return (
    <section className="panel toolbar">
      <div className="toolbar-left">
        <button className="btn ghost" onClick={onDownload}>
          Pobierz JSON
        </button>
        {isOwner && (
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
            {driveBusy ? "Eksportuję…" : "Eksportuj na Google Drive"}
          </button>
        )}
        {lesson.last_exported_at && (
          <span className="small muted">
            Ostatni eksport: {new Date(lesson.last_exported_at).toLocaleString("pl-PL")}
          </span>
        )}
      </div>

      <div className="toolbar-right">
        {lesson.status === "draft" ? (
          <button className="btn success" onClick={() => onStatusChange("finished")}>
            Zakończ lekcję
          </button>
        ) : (
          isOwner && (
            <button className="btn secondary" onClick={() => onStatusChange("draft")}>
              Otwórz ponownie
            </button>
          )
        )}
      </div>
    </section>
  );
}
