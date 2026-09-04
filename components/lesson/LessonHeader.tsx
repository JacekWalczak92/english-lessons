"use client";

import { Field } from "@/components/Field";
import type { SyncState } from "@/lib/use-lesson";
import { FIELD_LIMITS, type Lesson, type LessonPatch } from "@/lib/types";

const SYNC_LABELS: Record<SyncState, string> = {
  saved: "✓ zapisano",
  saving: "● zapisuję…",
  error: "● błąd zapisu",
  offline: "● brak połączenia",
};

export function LessonHeader({
  lesson,
  locked,
  lockNote,
  syncState,
  pendingCount,
  onChange,
  onRetry,
}: {
  lesson: Lesson;
  locked: boolean;
  /** Dlaczego pola są zablokowane — inny powód dla ucznia, inny po zakończeniu lekcji. */
  lockNote?: string;
  syncState: SyncState;
  pendingCount: number;
  onChange: (patch: LessonPatch) => void;
  onRetry: () => void;
}) {
  const showRetry = syncState === "error" || syncState === "offline";

  return (
    <section className="panel editor-header">
      <div className="editor-header-grid">
        <Field label="Nazwa lekcji">
          {(props) => (
            <input
              {...props}
              className="input"
              value={lesson.title}
              maxLength={FIELD_LIMITS.title}
              disabled={locked}
              onChange={(event) => onChange({ title: event.target.value })}
            />
          )}
        </Field>
        <Field label="Data">
          {(props) => (
            <input
              {...props}
              className="input"
              type="date"
              value={lesson.lesson_date}
              disabled={locked}
              onChange={(event) => {
                if (event.target.value) onChange({ lesson_date: event.target.value });
              }}
            />
          )}
        </Field>
        <Field label="Nauczyciel">
          {(props) => (
            <input
              {...props}
              className="input"
              value={lesson.teacher_name ?? ""}
              maxLength={FIELD_LIMITS.teacher_name}
              placeholder="np. Mark"
              disabled={locked}
              onChange={(event) => onChange({ teacher_name: event.target.value || null })}
            />
          )}
        </Field>
      </div>

      <div className="editor-status-line">
        <span className={`sync-pill ${syncState}`} role="status" aria-live="polite">
          {SYNC_LABELS[syncState]}
          {pendingCount > 0 && syncState !== "saving" && ` (${pendingCount} w kolejce)`}
        </span>
        {showRetry && (
          <button className="btn secondary small-btn" onClick={onRetry}>
            Ponów zapis
          </button>
        )}
        {locked && lockNote && <span className="warning small">{lockNote}</span>}
      </div>
    </section>
  );
}
