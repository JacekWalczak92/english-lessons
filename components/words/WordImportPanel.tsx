"use client";

import { useMemo, useState, type ChangeEvent } from "react";
import { dedupeKey, parseWordsInput } from "@/lib/word-export-format";
import type { ImportedWord } from "@/lib/word-export-format";

const PREVIEW_LIMIT = 8;

/**
 * Import słówek ze Słownika: plik `.json` z telefonu, wklejka albo ładunek,
 * który przyszedł w adresie (`#import=…`) po kliknięciu „Wyślij do J-Learner”.
 * Przed zapisem pokazuje, ile słówek jest nowych, a ile już jest na koncie.
 */
export function WordImportPanel({
  initialText,
  fromPhone,
  existingKeys,
  busy,
  onSave,
  onClose,
}: {
  initialText: string;
  fromPhone: boolean;
  existingKeys: Set<string>;
  busy: boolean;
  onSave: (words: ImportedWord[]) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(initialText);
  const [fileError, setFileError] = useState("");

  const result = useMemo(() => parseWordsInput(text), [text]);
  const fresh = useMemo(
    () => result.words.filter((word) => !existingKeys.has(dedupeKey(word.english))),
    [result.words, existingKeys],
  );
  const alreadyThere = result.words.length - fresh.length;

  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setFileError("");
    try {
      setText(await file.text());
    } catch {
      setFileError("Nie udało się odczytać pliku.");
    }
  }

  return (
    <section className="panel import-panel" data-tour="words-import">
      <div className="section-head import-head">
        <div>
          <h2>{fromPhone ? "Słówka z telefonu" : "Importuj słówka ze Słownika"}</h2>
          <p className="small muted" style={{ margin: "4px 0 0" }}>
            {fromPhone
              ? "Sprawdź listę i zapisz ją na swoim koncie."
              : "Wybierz plik .json wyeksportowany w aplikacji Słownik albo wklej listę „angielski;polski”."}
          </p>
        </div>
        <button className="btn ghost small-btn" onClick={onClose}>
          Zamknij
        </button>
      </div>

      {!fromPhone && (
        <div className="btn-row">
          <label className="btn secondary small-btn">
            Wybierz plik…
            <input type="file" accept=".json,.txt,.tsv,application/json,text/plain" hidden onChange={readFile} />
          </label>
          <span className="small muted">albo wklej poniżej</span>
        </div>
      )}
      {fileError && <p className="error">{fileError}</p>}

      {!fromPhone && (
        <textarea
          className="textarea import-textarea"
          value={text}
          placeholder={"bias;stronniczość, uprzedzenie\nto look forward to;czekać z niecierpliwością"}
          onChange={(event) => setText(event.target.value)}
        />
      )}

      {result.format !== "empty" && (
        <div className="stack" style={{ gap: 8 }}>
          <p className="small" style={{ margin: 0 }}>
            <strong>{fresh.length}</strong> nowych słówek
            {alreadyThere > 0 && <span className="muted"> · {alreadyThere} już masz</span>}
            {result.duplicates > 0 && <span className="muted"> · {result.duplicates} powtórzeń w imporcie</span>}
          </p>
          {fresh.length > 0 && (
            <ul className="preview-list-plain">
              {fresh.slice(0, PREVIEW_LIMIT).map((word) => (
                <li key={dedupeKey(word.english)}>
                  <strong>{word.english}</strong> · {word.polish}
                </li>
              ))}
              {fresh.length > PREVIEW_LIMIT && <li>…i {fresh.length - PREVIEW_LIMIT} więcej</li>}
            </ul>
          )}
          {result.problems.length > 0 && (
            <ul className="problem-list">
              {result.problems.slice(0, 10).map((problem) => (
                <li key={`${problem.line}-${problem.message}`}>
                  {problem.line > 0 ? `Pozycja ${problem.line}: ` : ""}
                  {problem.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="btn-row">
        <button className="btn" disabled={busy || fresh.length === 0} onClick={() => onSave(fresh)}>
          {busy ? "Zapisuję…" : fresh.length > 0 ? `Zapisz ${fresh.length} słówek` : "Brak nowych słówek"}
        </button>
      </div>
    </section>
  );
}
