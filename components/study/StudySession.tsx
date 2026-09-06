"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { TourOverlay } from "@/components/onboarding/TourOverlay";
import { lessonApi } from "@/lib/lesson-api";
import { useTour } from "@/lib/use-tour";
import { speakEnglish, speechSupported } from "@/lib/speech";
import {
  applyAnswer,
  buildStudyItems,
  countStats,
  emptyStats,
  filterByScope,
  isStudyable,
  type StudyDirection,
  type StudyItem,
  type StudyScope,
  type StudyStats,
} from "@/lib/study";
import { clearProgress, hardCardIds, readProgress, recordAnswer } from "@/lib/study-progress";
import { TYPE_LABELS } from "@/lib/card-labels";
import { isUnchanged, type LessonPayload } from "@/lib/types";

type Phase = "loading" | "setup" | "running" | "summary" | "error";

const DIRECTION_LABELS: Array<{ value: StudyDirection; label: string; hint: string }> = [
  { value: "card", label: "Jak na fiszce", hint: "kierunek ustawiony przy dodawaniu" },
  { value: "PL_TO_EN", label: "PL → EN", hint: "produkcja, trudniejsze" },
  { value: "EN_TO_PL", label: "EN → PL", hint: "rozumienie, łatwiejsze" },
  { value: "mixed", label: "Mieszany", hint: "losowo w obie strony" },
];

/**
 * Powtórka słówek z jednej lekcji.
 *
 * Sesja trwa, dopóki każda fiszka nie zostanie raz zaliczona: „powtórz”
 * odkłada ją o kilka pozycji dalej zamiast usuwać. Wynik ląduje w localStorage,
 * więc następnym razem można wrócić samymi trudnymi słówkami.
 */
export function StudySession({ lessonId, lessonKey }: { lessonId: string; lessonKey?: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState("");
  const [data, setData] = useState<LessonPayload | null>(null);

  const [scope, setScope] = useState<StudyScope>("all");
  const [direction, setDirection] = useState<StudyDirection>("card");

  const [items, setItems] = useState<Record<string, StudyItem>>({});
  const [queue, setQueue] = useState<string[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [stats, setStats] = useState<StudyStats>(emptyStats());
  const [missed, setMissed] = useState<string[]>([]);
  const [hard, setHard] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const result = await lessonApi.get({ lessonId, lessonKey });
        if (!active) return;
        if (isUnchanged(result)) throw new Error("Nieoczekiwana odpowiedź serwera.");
        setData(result);
        setHard(hardCardIds(readProgress(lessonId)));
        setPhase("setup");
      } catch (e) {
        if (!active) return;
        setError(e instanceof Error ? e.message : "Nie udało się pobrać lekcji.");
        setPhase("error");
      }
    })();
    return () => {
      active = false;
    };
  }, [lessonId, lessonKey]);

  const tour = useTour("study", data?.viewer.user_id ?? null, phase === "setup");

  const scopeContext = useMemo(
    () => ({
      viewerId: data?.viewer.user_id ?? null,
      teacherId: data?.teacher_id ?? null,
      hardCardIds: hard,
    }),
    [data, hard],
  );

  const counts = useMemo(() => {
    const cards = data?.cards ?? [];
    const studyable = cards.filter(isStudyable);
    return {
      all: studyable.length,
      teacher: filterByScope(studyable, "teacher", scopeContext).length,
      mine: filterByScope(studyable, "mine", scopeContext).length,
      hard: filterByScope(studyable, "hard", scopeContext).length,
      skipped: cards.length - studyable.length,
    };
  }, [data, scopeContext]);

  const start = useCallback(
    (nextScope: StudyScope) => {
      if (!data) return;
      const built = buildStudyItems(data.cards, {
        scope: nextScope,
        direction,
        context: scopeContext,
      });
      if (built.length === 0) return;
      setItems(Object.fromEntries(built.map((item) => [item.cardId, item])));
      setQueue(built.map((item) => item.cardId));
      setScope(nextScope);
      setStats(emptyStats());
      setMissed([]);
      setRevealed(false);
      setPhase("running");
    },
    [data, direction, scopeContext],
  );

  const answer = useCallback(
    (correct: boolean) => {
      const cardId = queue[0];
      if (!cardId) return;
      recordAnswer(lessonId, cardId, correct);
      setStats((current) => countStats(current, correct));
      if (!correct) {
        setMissed((current) => (current.includes(cardId) ? current : [...current, cardId]));
      }
      const nextQueue = applyAnswer(queue, correct);
      setQueue(nextQueue);
      setRevealed(false);
      if (nextQueue.length === 0) {
        setHard(hardCardIds(readProgress(lessonId)));
        setPhase("summary");
      }
    },
    [lessonId, queue],
  );

  const current = queue.length > 0 ? items[queue[0]] : null;

  // Skróty: spacja odsłania, 1 = powtórz, 2 = umiem. Klawiatura jest tu ważniejsza
  // niż zwykle — powtórka to kilkadziesiąt kliknięć pod rząd.
  useEffect(() => {
    if (phase !== "running") return;
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName)) {
        return;
      }
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        if (!revealed) setRevealed(true);
        else answer(true);
        return;
      }
      if (!revealed) return;
      if (event.key === "1") {
        event.preventDefault();
        answer(false);
      } else if (event.key === "2") {
        event.preventDefault();
        answer(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [answer, phase, revealed]);

  const backLink = (
    <Link className="btn ghost small-btn" href={`/lesson/?id=${encodeURIComponent(lessonId)}${lessonKey ? `&key=${encodeURIComponent(lessonKey)}` : ""}`}>
      ← Do lekcji
    </Link>
  );

  if (phase === "loading") {
    return (
      <main className="center-shell">
        <div className="panel auth-panel">Pobieram słówka…</div>
      </main>
    );
  }

  if (phase === "error" || !data) {
    return (
      <main className="center-shell">
        <div className="panel auth-panel">
          <h2>Nie można otworzyć nauki</h2>
          <p className="error">{error || "Lekcja nie istnieje albo link wygasł."}</p>
          <Link href="/dashboard" className="btn ghost" style={{ marginTop: 16, display: "inline-block" }}>
            ← Moje lekcje
          </Link>
        </div>
      </main>
    );
  }

  if (phase === "setup") {
    const scopeButtons: Array<{ value: StudyScope; label: string; count: number }> = [
      { value: "all", label: "Wszystkie słówka", count: counts.all },
      { value: "teacher", label: "Od nauczyciela", count: counts.teacher },
      { value: "mine", label: "Moje fiszki", count: counts.mine },
      { value: "hard", label: "Do poprawki", count: counts.hard },
    ];

    return (
      <main className="shell study-shell">
        <div className="topbar">
          <div>
            <div className="brand">J-Learner · Nauka</div>
            <h1 style={{ marginBottom: 0 }}>{data.lesson.title}</h1>
            <div className="lesson-meta" style={{ marginTop: 6 }}>
              <span>{counts.all} słówek do powtórki</span>
              {counts.skipped > 0 && <span>• {counts.skipped} pominięto (niepełna fiszka)</span>}
            </div>
          </div>
          <div className="btn-row">
            <button className="btn ghost small-btn" onClick={tour.start}>
              ❔ Instrukcja
            </button>
            {backLink}
          </div>
        </div>

        <section className="panel study-setup">
          <h2>Kierunek pytania</h2>
          <div className="chip-row" data-tour="study-direction">
            {DIRECTION_LABELS.map((entry) => (
              <button
                key={entry.value}
                className={`chip ${direction === entry.value ? "active" : ""}`}
                aria-pressed={direction === entry.value}
                onClick={() => setDirection(entry.value)}
              >
                {entry.label}
                <span className="muted small"> {entry.hint}</span>
              </button>
            ))}
          </div>

          <h2 style={{ marginTop: 18 }}>Co powtarzamy</h2>
          <div className="study-scopes" data-tour="study-scope">
            {scopeButtons.map((entry) => (
              <button
                key={entry.value}
                className="btn secondary"
                disabled={entry.count === 0}
                onClick={() => start(entry.value)}
              >
                {entry.label}
                <span className="muted"> · {entry.count}</span>
              </button>
            ))}
          </div>

          {counts.hard > 0 && (
            <p className="small muted">
              „Do poprawki” to słówka, które ostatnio poszły źle. Postęp jest zapisany w tej
              przeglądarce.{" "}
              <button
                className="link-btn"
                onClick={() => {
                  clearProgress(lessonId);
                  setHard([]);
                }}
              >
                Wyczyść historię nauki
              </button>
            </p>
          )}

          {counts.all === 0 && (
            <p className="warning small">
              Ta lekcja nie ma jeszcze fiszek z wypełnionymi obiema stronami.
            </p>
          )}
        </section>

        {tour.active && <TourOverlay steps={tour.steps} onFinish={tour.finish} />}
      </main>
    );
  }

  if (phase === "summary") {
    const missedItems = missed.map((cardId) => items[cardId]).filter(Boolean);
    return (
      <main className="shell study-shell">
        <div className="topbar">
          <div>
            <div className="brand">J-Learner · Nauka</div>
            <h1 style={{ marginBottom: 0 }}>Sesja skończona</h1>
          </div>
          {backLink}
        </div>

        <section className="panel study-summary">
          <p className="study-score">
            {stats.correct} / {stats.answered} odpowiedzi za pierwszym razem trafionych
          </p>
          {missedItems.length === 0 ? (
            <p className="success">Wszystko za pierwszym podejściem. Nieźle.</p>
          ) : (
            <>
              <h2>Do powtórzenia ({missedItems.length})</h2>
              <ul className="preview-list-plain">
                {missedItems.map((item) => (
                  <li key={item.cardId}>
                    <strong>{item.question}</strong> → {item.answer}
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="btn-row" style={{ marginTop: 16 }}>
            <button className="btn" onClick={() => start(scope)}>
              Powtórz tę samą pulę
            </button>
            {missedItems.length > 0 && (
              <button className="btn secondary" onClick={() => start("hard")}>
                Tylko trudne
              </button>
            )}
            <button className="btn ghost" onClick={() => setPhase("setup")}>
              Zmień ustawienia
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (!current) return null;

  const total = stats.answered + queue.length;
  const progress = total === 0 ? 0 : Math.round((stats.answered / total) * 100);

  return (
    <main className="shell study-shell">
      <div className="topbar">
        <div>
          <div className="brand">J-Learner · Nauka</div>
          <div className="lesson-meta" style={{ marginTop: 6 }}>
            <span>{data.lesson.title}</span>
            <span>• zostało {queue.length}</span>
            <span>• trafione {stats.correct}</span>
          </div>
        </div>
        <button className="btn ghost small-btn" onClick={() => setPhase("setup")}>
          Przerwij
        </button>
      </div>

      <div className="study-progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${progress}%` }} />
      </div>

      <section className="panel study-card">
        <div className="lesson-meta">
          <span className="badge">{TYPE_LABELS[current.card.card_type]}</span>
          <span className="badge muted-badge">
            {current.direction === "PRONUNCIATION"
              ? "wymowa"
              : current.direction === "PL_TO_EN"
                ? "PL → EN"
                : "EN → PL"}
          </span>
        </div>

        <p className="study-question">{current.question}</p>

        {revealed ? (
          <>
            <p className="study-answer">{current.answer}</p>
            {current.card.example.trim() && (
              <p className="small muted">Przykład: {current.card.example.trim()}</p>
            )}
            {current.card.note.trim() && (
              <p className="small muted">Notatka: {current.card.note.trim()}</p>
            )}
            {current.card.card_type === "british" && current.card.american_variant.trim() && (
              <p className="small muted">Amerykański: {current.card.american_variant.trim()}</p>
            )}
            {speechSupported() && current.speakText && (
              <button
                className="btn ghost small-btn"
                onClick={() => speakEnglish(current.speakText ?? "")}
              >
                🔊 Przeczytaj
              </button>
            )}

            <div className="study-actions">
              <button className="btn danger" onClick={() => answer(false)}>
                Powtórz <span className="muted">1</span>
              </button>
              <button className="btn success" onClick={() => answer(true)}>
                Umiem <span className="muted">2</span>
              </button>
            </div>
          </>
        ) : (
          <div className="study-actions">
            <button className="btn" onClick={() => setRevealed(true)}>
              Pokaż odpowiedź <span className="muted">spacja</span>
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
