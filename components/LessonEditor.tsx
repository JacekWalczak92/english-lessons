"use client";

import Script from "next/script";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { buildLessonExport, defaultDirection, lessonFileName, type CardType, type LessonCard, type LessonPayload, type ReviewDirection } from "@/lib/types";
import { lessonApi } from "@/lib/lesson-api";
import { absoluteSiteUrl } from "@/lib/site-path";
import { exportLessonToDrive } from "@/lib/google-drive";

type CardPatch = Partial<Omit<LessonCard, "id" | "lesson_id" | "created_at" | "updated_at">>;
type LessonPatch = Partial<Pick<LessonPayload["lesson"], "lesson_date" | "title" | "teacher_name" | "status" | "share_enabled" | "drive_file_id" | "drive_file_name" | "last_exported_at">>;

const TYPE_LABELS: Record<CardType, string> = {
  translation_sentence: "Zdanie do tłumaczenia",
  word_phrase: "Słowo / zwrot",
  pronunciation: "Wymowa / akcent",
  british: "British English",
  custom: "Inne",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="field"><label>{label}</label>{children}</div>;
}

export function LessonEditor({ lessonId }: { lessonId: string }) {
  const searchParams = useSearchParams();
  const lessonKey = searchParams.get("key") ?? "";
  const [data, setData] = useState<LessonPayload | null>(null);
  const dataRef = useRef<LessonPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [syncState, setSyncState] = useState<"saved" | "saving" | "error">("saved");
  const [driveBusy, setDriveBusy] = useState(false);
  const [driveMessage, setDriveMessage] = useState("");
  const cardTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const pendingCardPatches = useRef(new Map<string, CardPatch>());
  const lessonTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingLessonPatch = useRef<LessonPatch>({});

  useEffect(() => { dataRef.current = data; }, [data]);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const incoming = await lessonApi<LessonPayload>({ lessonId, lessonKey });
      if (quiet && (pendingCardPatches.current.size > 0 || Object.keys(pendingLessonPatch.current).length > 0)) return;
      setData(incoming);
      setError("");
    } catch (e) {
      if (!quiet) setError(e instanceof Error ? e.message : "Nie udało się pobrać lekcji");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [lessonId, lessonKey]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") load(true);
    }, 3500);
    return () => window.clearInterval(id);
  }, [load]);

  const flushCard = useCallback(async (cardId: string) => {
    const patch = pendingCardPatches.current.get(cardId);
    if (!patch || Object.keys(patch).length === 0) return;
    pendingCardPatches.current.delete(cardId);
    setSyncState("saving");
    try {
      const result = await lessonApi<{ card: LessonCard }>({ lessonId, cardId, lessonKey, method: "PATCH", body: patch });
      setData((current) => current ? { ...current, cards: current.cards.map((c) => c.id === cardId ? result.card : c) } : current);
      setSyncState("saved");
    } catch (e) {
      pendingCardPatches.current.set(cardId, { ...(pendingCardPatches.current.get(cardId) ?? {}), ...patch });
      setSyncState("error");
      setError(e instanceof Error ? e.message : "Nie udało się zapisać fiszki");
    }
  }, [lessonId, lessonKey]);

  function queueCardPatch(cardId: string, patch: CardPatch) {
    pendingCardPatches.current.set(cardId, { ...(pendingCardPatches.current.get(cardId) ?? {}), ...patch });
    setSyncState("saving");
    const old = cardTimers.current.get(cardId);
    if (old) clearTimeout(old);
    cardTimers.current.set(cardId, setTimeout(() => flushCard(cardId), 520));
  }

  function updateCard(cardId: string, patch: CardPatch) {
    setData((current) => current ? {
      ...current,
      cards: current.cards.map((card) => card.id === cardId ? { ...card, ...patch } : card),
    } : current);
    queueCardPatch(cardId, patch);
  }

  const flushLesson = useCallback(async () => {
    const patch = pendingLessonPatch.current;
    if (Object.keys(patch).length === 0) return;
    pendingLessonPatch.current = {};
    setSyncState("saving");
    try {
      const result = await lessonApi<{ lesson: LessonPayload["lesson"] }>({ lessonId, lessonKey, method: "PATCH", body: patch });
      setData((current) => current ? { ...current, lesson: { ...current.lesson, ...result.lesson } } : current);
      setSyncState("saved");
    } catch (e) {
      pendingLessonPatch.current = { ...patch, ...pendingLessonPatch.current };
      setSyncState("error");
      setError(e instanceof Error ? e.message : "Nie udało się zapisać lekcji");
    }
  }, [lessonId, lessonKey]);

  function updateLesson(patch: LessonPatch, immediate = false) {
    setData((current) => current ? { ...current, lesson: { ...current.lesson, ...patch } } : current);
    pendingLessonPatch.current = { ...pendingLessonPatch.current, ...patch };
    setSyncState("saving");
    if (lessonTimer.current) clearTimeout(lessonTimer.current);
    if (immediate) void flushLesson();
    else lessonTimer.current = setTimeout(() => flushLesson(), 520);
  }

  async function createCard(type: CardType) {
    if (!data) return;
    setError("");
    try {
      const order = data.cards.reduce((m, c) => Math.max(m, c.order_index), -1) + 1;
      const result = await lessonApi<{ card: LessonCard }>({
        lessonId,
        lessonKey,
        method: "POST",
        body: { card_type: type, review_direction: defaultDirection(type), order_index: order },
      });
      setData((current) => current ? { ...current, cards: [...current.cards, result.card] } : current);
      window.setTimeout(() => document.getElementById(`card-${result.card.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udało się dodać fiszki");
    }
  }

  async function deleteCard(cardId: string) {
    if (!window.confirm("Usunąć tę fiszkę?")) return;
    try {
      await lessonApi<void>({ lessonId, cardId, lessonKey, method: "DELETE" });
      setData((current) => current ? { ...current, cards: current.cards.filter((c) => c.id !== cardId) } : current);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udało się usunąć fiszki");
    }
  }

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!event.altKey) return;
      const mapping: Record<string, CardType> = { "1": "translation_sentence", "2": "word_phrase", "3": "pronunciation", "4": "british" };
      const type = mapping[event.key];
      if (type) { event.preventDefault(); void createCard(type); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function copyShareLink() {
    const current = dataRef.current;
    if (!current?.lesson.share_token) return;
    const url = absoluteSiteUrl(`/lesson/?id=${encodeURIComponent(lessonId)}&key=${encodeURIComponent(current.lesson.share_token)}`);
    await navigator.clipboard.writeText(url);
    setDriveMessage("Link dla nauczyciela skopiowany.");
  }

  function downloadJson() {
    if (!data) return;
    const payload = buildLessonExport(data.lesson, data.cards);
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = lessonFileName(data.lesson);
    a.click();
    URL.revokeObjectURL(url);
  }

  async function exportDrive() {
    if (!data) return;
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) {
      setDriveMessage("Brak NEXT_PUBLIC_GOOGLE_CLIENT_ID. Możesz teraz pobrać JSON lokalnie.");
      return;
    }
    setDriveBusy(true);
    setDriveMessage("");
    try {
      await flushLesson();
      await Promise.all([...pendingCardPatches.current.keys()].map((id) => flushCard(id)));
      // Pobieramy świeży stan z backendu po autosave. Dzięki temu kliknięcie „Eksportuj”
      // tuż po wpisaniu tekstu nie może wyeksportować poprzedniej wersji stanu React.
      const current = await lessonApi<LessonPayload>({ lessonId, lessonKey });
      setData(current);
      const payload = buildLessonExport(current.lesson, current.cards);
      const fileName = lessonFileName(current.lesson);
      const result = await exportLessonToDrive({
        clientId,
        fileName,
        payload,
        existingFileId: current.lesson.drive_file_id,
      });
      const exportTimestamp = payload.lesson.exportedAt;
      pendingLessonPatch.current = {
        ...pendingLessonPatch.current,
        drive_file_id: result.id,
        drive_file_name: result.name,
        last_exported_at: exportTimestamp,
      };
      await flushLesson();
      setDriveMessage(`Zapisano na Drive: J-Learner/EnglishLessons/${result.name}`);
    } catch (e) {
      setDriveMessage(e instanceof Error ? e.message : "Eksport na Drive nie powiódł się");
    } finally {
      setDriveBusy(false);
    }
  }

  if (loading) return <main className="center-shell"><div className="panel auth-panel">Pobieram lekcję…</div></main>;
  if (!data) return <main className="center-shell"><div className="panel auth-panel"><h2>Nie można otworzyć lekcji</h2><p className="error">{error}</p></div></main>;

  const lesson = data.lesson;
  const isOwner = data.access === "owner";
  const locked = !isOwner && lesson.status === "finished";

  return (
    <main className="shell">
      <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" />

      <div className="topbar">
        <div>
          <div className="brand">J-Learner · English Lessons</div>
          <div className="lesson-meta" style={{ marginTop: 6 }}>
            <span className={`badge ${lesson.status === "finished" ? "finished" : ""}`}>{lesson.status === "finished" ? "zakończona" : "w toku"}</span>
            <span>{isOwner ? "tryb właściciela" : "link nauczyciela"}</span>
            <span>• {data.cards.length} fiszek</span>
          </div>
        </div>
        {isOwner && <Link href="/dashboard" className="btn ghost small-btn">← Lekcje</Link>}
      </div>

      <section className="panel editor-header">
        <div className="editor-header-grid">
          <Field label="Nazwa lekcji">
            <input className="input" value={lesson.title} disabled={locked} onChange={(e) => updateLesson({ title: e.target.value })} />
          </Field>
          <Field label="Data">
            <input className="input" type="date" value={lesson.lesson_date} disabled={locked} onChange={(e) => updateLesson({ lesson_date: e.target.value })} />
          </Field>
          <Field label="Nauczyciel">
            <input className="input" value={lesson.teacher_name ?? ""} disabled={locked} placeholder="np. Mark" onChange={(e) => updateLesson({ teacher_name: e.target.value || null })} />
          </Field>
        </div>
        <div className="editor-status-line">
          <span className={`sync-pill ${syncState}`}>{syncState === "saving" ? "● zapisuję automatycznie…" : syncState === "error" ? "● błąd zapisu" : "✓ zapisano"}</span>
          {locked && <span className="warning small">Lekcja zakończona — link nauczyciela jest tylko do odczytu.</span>}
        </div>
      </section>

      <section className="panel quick-add">
        <button className="btn secondary small-btn" disabled={locked} onClick={() => createCard("translation_sentence")}>+ Zdanie <span className="muted">Alt+1</span></button>
        <button className="btn secondary small-btn" disabled={locked} onClick={() => createCard("word_phrase")}>+ Słowo / zwrot <span className="muted">Alt+2</span></button>
        <button className="btn secondary small-btn" disabled={locked} onClick={() => createCard("pronunciation")}>+ Wymowa <span className="muted">Alt+3</span></button>
        <button className="btn secondary small-btn" disabled={locked} onClick={() => createCard("british")}>+ British <span className="muted">Alt+4</span></button>
        <span className="hint">Zmiany zapisują się automatycznie. Druga osoba widzi je po kilku sekundach.</span>
      </section>

      {error && <p className="error">{error}</p>}

      <section className="cards">
        {data.cards.length === 0 ? (
          <div className="panel empty"><h2>Dodaj pierwszą fiszkę</h2><p>Podczas lekcji używaj przycisków powyżej albo Alt+1…Alt+4.</p></div>
        ) : data.cards.map((card, index) => (
          <article className="panel card-editor" id={`card-${card.id}`} key={card.id}>
            <div className="card-top">
              <select
                className="select card-type"
                value={card.card_type}
                disabled={locked}
                onChange={(e) => {
                  const next = e.target.value as CardType;
                  updateCard(card.id, { card_type: next, review_direction: defaultDirection(next) });
                }}
              >
                {(Object.keys(TYPE_LABELS) as CardType[]).map((type) => <option value={type} key={type}>{TYPE_LABELS[type]}</option>)}
              </select>
              <span className="card-index">#{index + 1}</span>
              <button className="btn danger small-btn" disabled={locked} onClick={() => deleteCard(card.id)}>Usuń</button>
            </div>

            <div className="card-main-grid">
              <Field label={card.card_type === "translation_sentence" ? "Zdanie po polsku — pytanie" : card.card_type === "word_phrase" ? "Polskie znaczenie" : card.card_type === "pronunciation" ? "Polskie znaczenie (opcjonalnie)" : card.card_type === "british" ? "Polskie znaczenie" : "Polski / odpowiedź"}>
                <textarea className="textarea" disabled={locked} value={card.polish} onChange={(e) => updateCard(card.id, { polish: e.target.value })} />
              </Field>
              <Field label={card.card_type === "translation_sentence" ? "Poprawne zdanie po angielsku" : card.card_type === "word_phrase" ? "Angielskie słowo / zwrot" : card.card_type === "pronunciation" ? "Słowo / zwrot do wymówienia" : card.card_type === "british" ? "Zwrot brytyjski" : "Angielski / pytanie"}>
                <textarea className="textarea" disabled={locked} value={card.english} onChange={(e) => {
                  const patch: CardPatch = { english: e.target.value };
                  if (card.card_type === "british") patch.british_variant = e.target.value;
                  updateCard(card.id, patch);
                }} />
              </Field>
            </div>

            {card.card_type === "pronunciation" && (
              <div className="card-extra-grid">
                <Field label="IPA / zapis fonetyczny"><input className="input" disabled={locked} value={card.phonetic} placeholder="/fəˈtɒɡrəfi/" onChange={(e) => updateCard(card.id, { phonetic: e.target.value })} /></Field>
                <Field label="Akcent / wymowa"><input className="input" disabled={locked} value={card.pronunciation} placeholder="pho-TOG-ra-phy" onChange={(e) => updateCard(card.id, { pronunciation: e.target.value })} /></Field>
              </div>
            )}

            {card.card_type === "british" && (
              <div className="card-extra-grid">
                <Field label="Odpowiednik amerykański (opcjonalnie)"><input className="input" disabled={locked} value={card.american_variant} placeholder="on the weekend" onChange={(e) => updateCard(card.id, { american_variant: e.target.value })} /></Field>
                <Field label="IPA / wymowa (opcjonalnie)"><input className="input" disabled={locked} value={card.phonetic} onChange={(e) => updateCard(card.id, { phonetic: e.target.value })} /></Field>
              </div>
            )}

            <div className="card-extra-grid">
              <Field label="Przykład (opcjonalnie)"><textarea className="textarea" disabled={locked} value={card.example} onChange={(e) => updateCard(card.id, { example: e.target.value })} /></Field>
              <Field label="Notatka (opcjonalnie)"><textarea className="textarea" disabled={locked} value={card.note} onChange={(e) => updateCard(card.id, { note: e.target.value })} /></Field>
            </div>

            <div className="card-footer">
              {card.card_type === "pronunciation" ? (
                <span className="badge">powtórka wymowy</span>
              ) : (
                <div className="direction">
                  <button className={card.review_direction === "PL_TO_EN" ? "active" : ""} disabled={locked} onClick={() => updateCard(card.id, { review_direction: "PL_TO_EN" as ReviewDirection })}>PL → EN</button>
                  <button className={card.review_direction === "EN_TO_PL" ? "active" : ""} disabled={locked} onClick={() => updateCard(card.id, { review_direction: "EN_TO_PL" as ReviewDirection })}>EN → PL</button>
                </div>
              )}
              <span className="small muted">autosave</span>
            </div>
          </article>
        ))}
      </section>

      <section className="panel toolbar">
        <div className="toolbar-left">
          {isOwner && <button className="btn secondary" onClick={copyShareLink}>Kopiuj link dla nauczyciela</button>}
          <button className="btn ghost" onClick={downloadJson}>Pobierz JSON</button>
          {isOwner && <button className="btn secondary" disabled={driveBusy} onClick={exportDrive}>{driveBusy ? "Eksportuję…" : "Eksportuj na Google Drive"}</button>}
        </div>
        <div className="toolbar-right">
          {isOwner ? (
            lesson.status === "draft" ?
              <button className="btn success" onClick={() => updateLesson({ status: "finished" }, true)}>Zakończ lekcję</button> :
              <button className="btn secondary" onClick={() => updateLesson({ status: "draft" }, true)}>Otwórz ponownie</button>
          ) : lesson.status === "draft" ? (
            <button className="btn success" onClick={() => updateLesson({ status: "finished" }, true)}>Zakończ lekcję</button>
          ) : null}
        </div>
      </section>

      {driveMessage && <p className={driveMessage.startsWith("Zapisano") || driveMessage.includes("skopiowany") ? "success" : "warning"}>{driveMessage}</p>}
    </main>
  );
}
