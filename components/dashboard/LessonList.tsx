"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { Lesson } from "@/lib/types";

/**
 * Jedna sekcja listy lekcji. Ta sama lista obsługuje lekcje ucznia, lekcje
 * przypisane nauczycielowi i gotowe zestawy — różnią się tylko akcjami
 * i tym, czyje imię pokazujemy obok.
 */
export function LessonList({
  title,
  emptyText,
  lessons,
  names,
  counterpartField,
  onDelete,
  footer,
}: {
  title: string;
  emptyText: string;
  lessons: Lesson[];
  /** Mapa `user_id -> imię` dla drugiej strony lekcji. */
  names?: Record<string, string>;
  counterpartField?: "assigned_teacher_id" | "owner_id";
  onDelete?: (lesson: Lesson) => void;
  footer?: ReactNode;
}) {
  function counterpart(lesson: Lesson): string | null {
    if (!counterpartField || !names) return null;
    const id = counterpartField === "assigned_teacher_id" ? lesson.assigned_teacher_id : lesson.owner_id;
    if (!id) return null;
    return names[id] ?? null;
  }

  return (
    <section className="dashboard-section">
      <div className="section-head">
        <h2>{title}</h2>
        {footer}
      </div>

      {lessons.length === 0 ? (
        emptyText ? (
          <div className="panel empty">
            <p>{emptyText}</p>
          </div>
        ) : null
      ) : (
        <div className="dashboard-grid">
          {lessons.map((lesson, index) => (
            <article
              className="panel lesson-row"
              key={lesson.id}
              data-tour={index === 0 ? "lesson-row" : undefined}
            >
              <div>
                <div className="lesson-title">{lesson.title}</div>
                <div className="lesson-meta">
                  <span>{lesson.lesson_date}</span>
                  {counterpart(lesson) && <span>• {counterpart(lesson)}</span>}
                  <span>• {lesson.card_count} fiszek</span>
                  <span className={`badge ${lesson.status === "finished" ? "finished" : ""}`}>
                    {lesson.status === "finished" ? "zakończona" : "w toku"}
                  </span>
                  {lesson.is_published && <span className="badge">opublikowany</span>}
                  {lesson.card_count === 0 && lesson.assigned_teacher_id && (
                    <span className="badge muted-badge">czeka na nauczyciela</span>
                  )}
                </div>
              </div>
              <div className="btn-row">
                {lesson.card_count > 0 && (
                  <Link
                    className="btn small-btn"
                    data-tour={index === 0 ? "study-button" : undefined}
                    href={`/study/?id=${encodeURIComponent(lesson.id)}`}
                  >
                    Ucz się
                  </Link>
                )}
                <Link
                  className="btn secondary small-btn"
                  href={`/lesson/?id=${encodeURIComponent(lesson.id)}`}
                >
                  Otwórz
                </Link>
                {onDelete && (
                  <button className="btn danger small-btn" onClick={() => onDelete(lesson)}>
                    Usuń
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
