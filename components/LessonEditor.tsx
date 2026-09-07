"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { CardEditor } from "@/components/lesson/CardEditor";
import { ImportPanel } from "@/components/lesson/ImportPanel";
import { LessonHeader } from "@/components/lesson/LessonHeader";
import { LessonToolbar } from "@/components/lesson/LessonToolbar";
import { QuickAddBar } from "@/components/lesson/QuickAddBar";
import { StudentRequestPanel } from "@/components/lesson/StudentRequestPanel";
import { TourOverlay } from "@/components/onboarding/TourOverlay";
import { downloadTextFile } from "@/lib/clipboard";
import { DRIVE_FOLDER_PATH, exportLessonToDrive } from "@/lib/google-drive";
import { lessonTour } from "@/lib/onboarding";
import { readPublicConfig } from "@/lib/supabase-browser";
import { useCardShortcuts } from "@/lib/use-card-shortcuts";
import { useLesson } from "@/lib/use-lesson";
import { useTour } from "@/lib/use-tour";
import {
  buildLessonExport,
  canChangeStatus,
  canEditCards,
  canEditLessonMeta,
  canEditStudentComment,
  defaultDirection,
  lessonFileName,
  type CardType,
  type Lesson,
  type LessonAccessContext,
  type NewCardInput,
} from "@/lib/types";

type Banner = { kind: "success" | "warning"; text: string } | null;

/**
 * Orkiestracja edytora lekcji.
 *
 * Podział obowiązków od v1.7.0: treść fiszek wypełnia nauczyciel, uczeń
 * dopisuje komentarz do każdej fiszki. Uprawnienia liczą te same funkcje
 * z `lib/domain.ts`, które egzekwuje Edge Function.
 */
export function LessonEditor({ lessonId }: { lessonId: string }) {
  const scope = useMemo(() => ({ lessonId }), [lessonId]);
  const { data, loading, fatalError, syncError, syncState, pendingCount, actions } =
    useLesson(scope);

  const [importOpen, setImportOpen] = useState(false);
  const [driveBusy, setDriveBusy] = useState(false);
  const [banner, setBanner] = useState<Banner>(null);

  const lesson = data?.lesson ?? null;
  const googleClientId = readPublicConfig()?.googleClientId ?? null;

  const tour = useTour(
    data ? lessonTour(data.viewer.role) : null,
    data?.viewer.user_id ?? null,
    !!data && !loading,
  );

  const context: LessonAccessContext | null = useMemo(() => {
    if (!data || !lesson) return null;
    return { mode: data.access, viewerRole: data.viewer.role, lessonStatus: lesson.status };
  }, [data, lesson]);

  const teacherMode = context ? canEditCards(context) : false;
  const commentMode = context ? canEditStudentComment(context) : false;
  const isStudent = data?.viewer.role === "student";

  const addCard = useCallback(
    async (type: CardType) => {
      if (!teacherMode) return;
      const card: NewCardInput = {
        card_type: type,
        review_direction: defaultDirection(type),
        order_index: 0,
      };
      const created = await actions.createCard(card);
      if (!created) return;
      window.setTimeout(() => {
        document
          .getElementById(`card-${created.id}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 80);
    },
    [actions, teacherMode],
  );

  useCardShortcuts(!!data && teacherMode, (type) => void addCard(type));

  const removeCard = useCallback(
    (cardId: string) => {
      if (!window.confirm("Usunąć tę fiszkę?")) return;
      void actions.deleteCard(cardId);
    },
    [actions],
  );

  const moveCard = useCallback(
    (cardId: string, direction: -1 | 1) => void actions.moveCard(cardId, direction),
    [actions],
  );

  const runImport = useCallback(
    async (cards: NewCardInput[]) => {
      const created = await actions.createCards(cards);
      return created.length;
    },
    [actions],
  );

  function downloadJson() {
    if (!data) return;
    const payload = buildLessonExport(data.lesson, data.cards);
    downloadTextFile(lessonFileName(data.lesson), JSON.stringify(payload, null, 2));
  }

  async function exportDrive() {
    if (!data || !googleClientId) return;
    setDriveBusy(true);
    setBanner(null);
    try {
      // Najpierw wypychamy autosave i pobieramy świeży stan — inaczej kliknięcie
      // „Eksportuj” tuż po wpisaniu tekstu wysłałoby poprzednią wersję.
      const fresh = (await actions.flushAndReload()) ?? data;
      const payload = buildLessonExport(fresh.lesson, fresh.cards);
      const fileName = lessonFileName(fresh.lesson);
      const result = await exportLessonToDrive({
        clientId: googleClientId,
        fileName,
        payload,
        existingFileId: fresh.drive.drive_file_id,
      });
      await actions.saveDrive({
        drive_file_id: result.id,
        drive_file_name: result.name,
        last_exported_at: payload.lesson.exportedAt,
      });
      setBanner({ kind: "success", text: `Zapisano na Drive: ${DRIVE_FOLDER_PATH}/${result.name}` });
    } catch (error) {
      setBanner({
        kind: "warning",
        text: error instanceof Error ? error.message : "Eksport na Drive nie powiódł się.",
      });
    } finally {
      setDriveBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="center-shell">
        <div className="panel auth-panel">Pobieram lekcję…</div>
      </main>
    );
  }

  if (!data || !lesson || !context) {
    return (
      <main className="center-shell">
        <div className="panel auth-panel">
          <h2>Nie można otworzyć lekcji</h2>
          <p className="error">{fatalError || "Ta lekcja nie należy do Ciebie."}</p>
          <Link href="/dashboard" className="btn ghost" style={{ marginTop: 16, display: "inline-block" }}>
            ← Moje lekcje
          </Link>
        </div>
      </main>
    );
  }

  const nextOrder = data.cards.reduce((max, card) => Math.max(max, card.order_index), -1) + 1;
  const counterpartLabel = data.counterpart
    ? data.counterpart.role === "teacher"
      ? `nauczyciel: ${data.counterpart.display_name}`
      : `uczeń: ${data.counterpart.display_name}`
    : lesson.lesson_kind === "set"
      ? "zestaw do biblioteki"
      : "lekcja bez przypisanego nauczyciela";

  const lockNote = isStudent
    ? lesson.status === "finished"
      ? "Lekcja zakończona — komentarzy nie da się już zmieniać."
      : "Treść fiszek wypełnia nauczyciel. Ty dopisujesz komentarz pod każdą fiszką."
    : "Lekcja zakończona. Otwórz ją ponownie, żeby edytować.";

  return (
    <main className="shell">
      <div className="topbar">
        <div>
          <div className="brand">J-Learner · English Lessons</div>
          <div className="lesson-meta" style={{ marginTop: 6 }}>
            <span className={`badge ${lesson.status === "finished" ? "finished" : ""}`}>
              {lesson.status === "finished" ? "zakończona" : "w toku"}
            </span>
            {lesson.lesson_kind === "set" && <span className="badge muted-badge">zestaw</span>}
            <span>{counterpartLabel}</span>
            <span>• {data.cards.length} fiszek</span>
          </div>
        </div>
        <div className="btn-row">
          <button className="btn ghost small-btn" onClick={tour.start}>
            ❔ Instrukcja
          </button>
          {data.cards.length > 0 && (
            <Link
              href={`/study/?id=${encodeURIComponent(lesson.id)}`}
              className="btn small-btn"
              data-tour="study-link"
            >
              🎓 Ucz się
            </Link>
          )}
          <Link href="/dashboard" className="btn ghost small-btn">
            ← Lekcje
          </Link>
        </div>
      </div>

      <LessonHeader
        lesson={lesson}
        locked={!canEditLessonMeta(context)}
        lockNote={lockNote}
        syncState={syncState}
        pendingCount={pendingCount}
        onChange={actions.updateLesson}
        onRetry={actions.retryNow}
      />

      <StudentRequestPanel
        lesson={lesson}
        editable={data.access === "owner" && isStudent && lesson.status === "draft"}
        onChange={actions.updateLesson}
      />

      {teacherMode ? (
        <QuickAddBar
          locked={!teacherMode}
          importOpen={importOpen}
          onAdd={(type) => void addCard(type)}
          onToggleImport={() => setImportOpen((value) => !value)}
        />
      ) : (
        <p className="hint student-hint" data-tour="student-comment-hint">
          {lockNote}
        </p>
      )}

      {importOpen && teacherMode && (
        <ImportPanel
          existingCards={data.cards}
          nextOrder={nextOrder}
          locked={!teacherMode}
          onImport={runImport}
          onClose={() => setImportOpen(false)}
        />
      )}

      {syncError && (
        <p className="error" role="alert">
          {syncError}
        </p>
      )}
      {banner && <p className={banner.kind === "success" ? "success" : "warning"}>{banner.text}</p>}

      <section className="cards">
        {data.cards.length === 0 ? (
          <div className="panel empty">
            <h2>{teacherMode ? "Dodaj pierwszą fiszkę" : "Nauczyciel nie wypełnił jeszcze lekcji"}</h2>
            <p>
              {teacherMode
                ? "Podczas lekcji używaj przycisków powyżej albo Alt+1…Alt+4."
                : "Gdy fiszki się pojawią, dopiszesz do każdej własny komentarz."}
            </p>
          </div>
        ) : (
          data.cards.map((card, index) => (
            <CardEditor
              key={card.id}
              card={card}
              index={index}
              total={data.cards.length}
              locked={!teacherMode}
              commentEditable={commentMode}
              onChange={actions.updateCard}
              onDelete={removeCard}
              onMove={moveCard}
            />
          ))
        )}
      </section>

      <LessonToolbar
        lesson={lesson}
        isOwner={data.access === "owner"}
        canFinish={canChangeStatus(context)}
        driveBusy={driveBusy}
        driveConfigured={!!googleClientId}
        driveState={data.drive}
        onDownload={downloadJson}
        onExport={() => void exportDrive()}
        onStatusChange={(status: Lesson["status"]) => actions.updateLesson({ status }, true)}
      />

      {tour.active && <TourOverlay steps={tour.steps} onFinish={tour.finish} />}
    </main>
  );
}
