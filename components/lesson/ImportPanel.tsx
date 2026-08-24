"use client";

import { useMemo, useState } from "react";
import {
  IMPORT_AI_PROMPT,
  IMPORT_COLUMNS,
  describeImportResult,
  parseImportRows,
} from "@/lib/import-format";
import { copyToClipboard } from "@/lib/clipboard";
import type { LessonCard, NewCardInput } from "@/lib/types";

const PLACEHOLDER = [
  "rachunek;bill;word_phrase;;;",
  "Nie jestem pewien, że nadążam;I'm not sure I follow;translation_sentence;;;",
].join("\n");

export function ImportPanel({
  existingCards,
  nextOrder,
  locked,
  onImport,
  onClose,
}: {
  existingCards: LessonCard[];
  nextOrder: number;
  locked: boolean;
  onImport: (cards: NewCardInput[]) => Promise<number>;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "warning"; text: string } | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  // Podgląd liczy się na bieżąco — użytkownik widzi wynik parsowania,
  // zanim cokolwiek trafi na serwer.
  const parsed = useMemo(
    () => parseImportRows(text, { startOrder: nextOrder, existing: existingCards }),
    [existingCards, nextOrder, text],
  );

  async function run() {
    if (busy || locked) return;
    if (parsed.cards.length === 0) {
      setMessage({ kind: "warning", text: "Nie ma nic do zaimportowania." });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const count = await onImport(parsed.cards);
      setMessage({ kind: "success", text: `Zaimportowano ${count} fiszek.` });
      setText("");
    } catch (error) {
      setMessage({
        kind: "warning",
        text: error instanceof Error ? error.message : "Import nie powiódł się.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function copyPrompt() {
    const ok = await copyToClipboard(IMPORT_AI_PROMPT);
    setMessage({
      kind: ok ? "success" : "warning",
      text: ok
        ? "Prompt dla AI skopiowany do schowka."
        : "Nie udało się skopiować. Zaznacz tekst poniżej i skopiuj ręcznie.",
    });
    if (!ok) setShowPrompt(true);
  }

  return (
    <section className="panel import-panel">
      <div className="card-top import-head">
        <h2>Importuj słówka / fiszki</h2>
        <div className="btn-row">
          <button className="btn ghost small-btn" onClick={() => setShowPrompt((value) => !value)}>
            {showPrompt ? "Ukryj prompt AI" : "Pokaż prompt AI"}
          </button>
          <button className="btn secondary small-btn" onClick={copyPrompt}>
            Kopiuj prompt
          </button>
        </div>
      </div>

      <p className="muted">
        Jeden wpis na linię: <strong>{IMPORT_COLUMNS}</strong>. Ostatnie cztery pola mogą być puste.
        Nagłówek, puste linie i komentarze <code>#</code> są pomijane; duplikaty istniejących fiszek
        też.
      </p>

      <textarea
        className="textarea import-textarea"
        disabled={locked || busy}
        value={text}
        placeholder={PLACEHOLDER}
        onChange={(event) => setText(event.target.value)}
        aria-label="Lista fiszek do zaimportowania"
      />

      {text.trim() && (
        <p className={parsed.problems.length > 0 ? "warning small" : "success small"}>
          {describeImportResult(parsed)}
        </p>
      )}

      {parsed.problems.length > 0 && (
        <ul className="problem-list">
          {parsed.problems.slice(0, 12).map((problem) => (
            <li key={problem.line}>
              wiersz {problem.line}: {problem.message}
            </li>
          ))}
          {parsed.problems.length > 12 && <li>…i {parsed.problems.length - 12} kolejnych</li>}
        </ul>
      )}

      {showPrompt && (
        <textarea
          className="textarea prompt-textarea"
          readOnly
          value={IMPORT_AI_PROMPT}
          aria-label="Prompt dla agenta AI"
        />
      )}

      {message && <p className={message.kind === "success" ? "success" : "warning"}>{message.text}</p>}

      <div className="toolbar-left" style={{ marginTop: 12 }}>
        <button
          className="btn success"
          disabled={locked || busy || parsed.cards.length === 0}
          onClick={run}
        >
          {busy ? "Importuję…" : `Importuj (${parsed.cards.length})`}
        </button>
        <button className="btn ghost" disabled={busy} onClick={onClose}>
          Zamknij
        </button>
      </div>
    </section>
  );
}
