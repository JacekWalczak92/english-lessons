"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { speakEnglish, speechSupported } from "@/lib/speech";
import {
  applyAnswer,
  buildStudyItems,
  countStats,
  emptyStats,
  type StudyDirection,
  type StudyItem,
  type StudyStats,
} from "@/lib/study";
import type { MyWord } from "@/lib/my-words";
import { wordAsCard } from "@/lib/word-export-format";

const DIRECTIONS: Array<{ value: StudyDirection; label: string }> = [
  { value: "EN_TO_PL", label: "EN → PL" },
  { value: "PL_TO_EN", label: "PL → EN" },
  { value: "mixed", label: "Mieszany" },
];

/**
 * Szybka powtórka wybranych słówek. Kolejka i kierunek pytań pochodzą z
 * `lib/study.ts` — tej samej logiki, której używa nauka z lekcji.
 */
export function WordsStudy({ words, onClose }: { words: MyWord[]; onClose: () => void }) {
  const [direction, setDirection] = useState<StudyDirection>("EN_TO_PL");
  const [items, setItems] = useState<Record<string, StudyItem>>({});
  const [queue, setQueue] = useState<string[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [stats, setStats] = useState<StudyStats>(emptyStats());
  const [started, setStarted] = useState(false);

  const cards = useMemo(() => words.map(wordAsCard), [words]);

  function start() {
    const built = buildStudyItems(cards, { scope: "all", direction, context: {} });
    setItems(Object.fromEntries(built.map((item) => [item.cardId, item])));
    setQueue(built.map((item) => item.cardId));
    setStats(emptyStats());
    setRevealed(false);
    setStarted(true);
  }

  const answer = useCallback(
    (correct: boolean) => {
      setQueue((current) => applyAnswer(current, correct));
      setStats((current) => countStats(current, correct));
      setRevealed(false);
    },
    [],
  );

  const current = queue.length > 0 ? items[queue[0]] : null;

  useEffect(() => {
    if (!started || !current) return;
    function onKey(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === " ") {
        event.preventDefault();
        if (!revealed) setRevealed(true);
        else answer(true);
      } else if (revealed && event.key === "1") answer(false);
      else if (revealed && event.key === "2") answer(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [started, current, revealed, answer]);

  if (!started) {
    return (
      <section className="panel study-setup">
        <div className="section-head">
          <h2>Powtórka: {words.length} słówek</h2>
          <button className="btn ghost small-btn" onClick={onClose}>
            Zamknij
          </button>
        </div>
        <div className="chip-row">
          {DIRECTIONS.map((entry) => (
            <button
              key={entry.value}
              className={`chip ${direction === entry.value ? "active" : ""}`}
              aria-pressed={direction === entry.value}
              onClick={() => setDirection(entry.value)}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <div className="btn-row">
          <button className="btn" onClick={start} disabled={words.length === 0}>
            Zaczynam
          </button>
        </div>
      </section>
    );
  }

  if (!current) {
    return (
      <section className="panel study-summary">
        <p className="study-score">
          Gotowe! {Object.keys(items).length} słówek, {stats.again} powtórek po drodze.
        </p>
        <div className="btn-row">
          <button className="btn" onClick={start}>
            Jeszcze raz
          </button>
          <button className="btn ghost" onClick={onClose}>
            Wróć do listy
          </button>
        </div>
      </section>
    );
  }

  const total = Object.keys(items).length;
  const done = total - queue.length;
  const progress = total === 0 ? 0 : Math.round((done / total) * 100);

  return (
    <section>
      <div className="study-progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${progress}%` }} />
      </div>
      <div className="panel study-card">
        <div className="lesson-meta">
          <span className="badge muted-badge">
            {done}/{total}
          </span>
          <span className="badge">{current.direction === "PL_TO_EN" ? "PL → EN" : "EN → PL"}</span>
          {speechSupported() && current.speakText && (
            <button className="btn ghost small-btn" onClick={() => speakEnglish(current.speakText ?? "")}>
              🔊
            </button>
          )}
          <button className="btn ghost small-btn" style={{ marginLeft: "auto" }} onClick={onClose}>
            Zakończ
          </button>
        </div>
        <p className="study-question">{current.question}</p>
        {revealed && <p className="study-answer">{current.answer}</p>}
        <div className="study-actions">
          {revealed ? (
            <>
              <button className="btn secondary" onClick={() => answer(false)}>
                Powtórz <span className="muted">1</span>
              </button>
              <button className="btn" onClick={() => answer(true)}>
                Umiem <span className="muted">2</span>
              </button>
            </>
          ) : (
            <button className="btn" onClick={() => setRevealed(true)}>
              Pokaż odpowiedź <span className="muted">spacja</span>
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
