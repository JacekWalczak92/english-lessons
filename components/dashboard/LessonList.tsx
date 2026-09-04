"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { formatJoinCode, type Lesson } from "@/lib/types";

/**
 * Jedna sekcja listy lekcji. Ta sama lista obsługuje lekcje nauczyciela,
 * gotowe zestawy i lekcje, do których uczeń dołączył — różnią się tylko
 * dostępnymi akcjami.
 */
export function LessonList({
  title,
  emptyText,
  lessons,
  showJoinCode = false,
  onDelete,
  onLeave,
  footer,
}: {
  title: string;
  emptyText: string;
  lessons: Lesson[];
  showJoinCode?: boolean;
  onDelete?: (lesson: Lesson) => void;
  onLeave?: (lesson: Lesson) => void;
  footer?: ReactNode;
}) {
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
          {lessons.map((lesson) => (
            <article className="panel lesson-row" key={lesson.id}>
              <div>
                <div className="lesson-title">{lesson.title}</div>
                <div className="lesson-meta">
                  <span>{lesson.lesson_date}</span>
                  {lesson.teacher_name && <span>• {lesson.teacher_name}</span>}
                  <span>• {lesson.card_count} fiszek</span>
                  <span className={`badge ${lesson.status === "finished" ? "finished" : ""}`}>
                    {lesson.status === "finished" ? "zakończona" : "w toku"}
                  </span>
                  {lesson.is_published && <span className="badge">opublikowany</span>}
                  {showJoinCode && lesson.join_code && (
                    <span className="badge muted-badge">
                      {lesson.join_enabled ? `kod ${formatJoinCode(lesson.join_code)}` : "kod wyłączony"}
                    </span>
                  )}
                </div>
              </div>
              <div className="btn-row">
                {lesson.card_count > 0 && (
                  <Link
                    className="btn small-btn"
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
                {onLeave && (
                  <button className="btn ghost small-btn" onClick={() => onLeave(lesson)}>
                    Wypisz się
                  </button>
                )}
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
