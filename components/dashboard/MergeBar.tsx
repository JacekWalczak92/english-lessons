"use client";

import Link from "next/link";
import { useState } from "react";
import { MERGE_LIMIT, defaultMergeTitle, studyHref } from "@/lib/merge";
import type { Lesson } from "@/lib/types";

/**
 * Pasek na dole listy lekcji, gdy coś jest zaznaczone.
 *
 * „Ucz się razem” nic nie zapisuje — otwiera naukę z fiszkami ze wszystkich
 * zaznaczonych lekcji. „Połącz w nowy zestaw” robi nową lekcję z kopią fiszek;
 * oryginały zostają bez zmian.
 */
export function MergeBar({
  lessons,
  busy,
  onMerge,
  onClear,
}: {
  /** Zaznaczone lekcje w kolejności z listy (od najnowszej). */
  lessons: Lesson[];
  busy: boolean;
  onMerge: (title: string) => void;
  onClear: () => void;
}) {
  const [withMyWords, setWithMyWords] = useState(false);
  const [naming, setNaming] = useState(false);
  const [title, setTitle] = useState("");

  if (lessons.length === 0) return null;

  const ids = lessons.map((lesson) => lesson.id);
  const cards = lessons.reduce((sum, lesson) => sum + lesson.card_count, 0);
  const canStudy = lessons.length >= 2 || withMyWords;
  const canMerge = lessons.length >= 2;
  const tooMany = lessons.length > MERGE_LIMIT;

  function startNaming() {
    setTitle(defaultMergeTitle(lessons.map((lesson) => lesson.lesson_date)));
    setNaming(true);
  }

  return (
    <div className="merge-bar" role="region" aria-label="Zaznaczone lekcje">
      <div className="merge-bar-inner panel">
        <div className="merge-bar-summary">
          <strong>
            Zaznaczone: {lessons.length} {lessonWord(lessons.length)}
          </strong>
          <span className="muted small">
            {" "}
            · {cards} fiszek{lessons.length >= 2 ? ", powtórzenia pokażą się raz" : ""}
          </span>
          {lessons.length === 1 && !withMyWords && (
            <div className="muted small">Zaznacz jeszcze jedną lekcję, żeby je połączyć.</div>
          )}
          {tooMany && (
            <div className="warning small">Najwyżej {MERGE_LIMIT} lekcji naraz.</div>
          )}
        </div>

        {naming ? (
          <form
            className="merge-bar-actions"
            onSubmit={(event) => {
              event.preventDefault();
              if (title.trim() && !busy) onMerge(title.trim());
            }}
          >
            <input
              className="input merge-title"
              value={title}
              maxLength={200}
              autoFocus
              onChange={(event) => setTitle(event.target.value)}
              aria-label="Nazwa nowego zestawu"
            />
            <button className="btn small-btn" type="submit" disabled={busy || !title.trim()}>
              {busy ? "Łączę…" : "Utwórz"}
            </button>
            <button
              className="btn ghost small-btn"
              type="button"
              onClick={() => setNaming(false)}
              disabled={busy}
            >
              Anuluj
            </button>
          </form>
        ) : (
          <div className="merge-bar-actions">
            <label className="toggle small">
              <input
                type="checkbox"
                checked={withMyWords}
                onChange={(event) => setWithMyWords(event.target.checked)}
              />
              <span>+ Moje słówka</span>
            </label>
            {canStudy && !tooMany ? (
              <Link className="btn small-btn" href={studyHref(ids, withMyWords)}>
                🎓 Ucz się razem
              </Link>
            ) : (
              <button className="btn small-btn" disabled>
                🎓 Ucz się razem
              </button>
            )}
            <button
              className="btn secondary small-btn"
              disabled={!canMerge || tooMany || busy}
              onClick={startNaming}
              title="Nowa lekcja z kopią fiszek, bez duplikatów. Oryginały zostają."
            >
              Połącz w nowy zestaw
            </button>
            <button className="btn ghost small-btn" onClick={onClear} aria-label="Odznacz wszystko">
              ✕
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function lessonWord(count: number): string {
  if (count === 1) return "lekcja";
  const last = count % 10;
  const lastTwo = count % 100;
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return "lekcje";
  return "lekcji";
}
