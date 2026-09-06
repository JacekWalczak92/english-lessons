"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { AccessPanel } from "@/components/lesson/AccessPanel";
import { CardEditor } from "@/components/lesson/CardEditor";
import { ImportPanel } from "@/components/lesson/ImportPanel";
import { LessonHeader } from "@/components/lesson/LessonHeader";
import { LessonToolbar } from "@/components/lesson/LessonToolbar";
import { QuickAddBar } from "@/components/lesson/QuickAddBar";
import { TourOverlay } from "@/components/onboarding/TourOverlay";
import { lessonTour } from "@/lib/onboarding";
import { useTour } from "@/lib/use-tour";
import { downloadTextFile } from "@/lib/clipboard";
import { DRIVE_FOLDER_PATH, exportLessonToDrive } from "@/lib/google-drive";
import { readPublicConfig } from "@/lib/supabase-browser";
import { useCardShortcuts } from "@/lib/use-card-shortcuts";
import { useLesson } from "@/lib/use-lesson";
import {
  buildLessonExport,
  canAddCards,
  canEditCard,
  canEditLessonMeta,
  canManageAccess,
  defaultDirection,
  isLessonCard,
  lessonFileName,
  type CardAccessContext,
  type CardType,
  type Lesson,
  type NewCardInput,
} from "@/lib/types";

type Banner = { kind: "success" | "warning"; text: string } | null;

/**
 * Orkiestracja edytora lekcji.
 *
 * Stan i synchronizacja siedzą w `useLesson`, pojedyncze fragmenty interfejsu
 * w `components/lesson/*`. Ten plik tylko je spina i wylicza uprawnienia —
 * te same funkcje z `lib/domain.ts` egzekwuje Edge Function, więc interfejs
 * nie pokazuje pól, których zapis i tak zostałby odrzucony.
 */
export function LessonEditor({ lessonId, lessonKey }: { lessonId: string; lessonKey?: string }) {
  const scope = useMemo(() => ({ lessonId, lessonKey }), [lessonId, lessonKey]);
  const { data, loading, fatalError, syncError, syncState, pendingCount, actions } =
    useLesson(scope);

  const [importOpen, setImportOpen] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);
  const [driveBusy, setDriveBusy] = useState(false);
  const [banner, setBanner] = useState<Banner>(null);

  const lesson = data?.lesson ?? null;
  const access = data?.access ?? "shared";
  const isOwner = access === "owner";
  const isStudent = access === "member";
  const googleClientId = readPublicConfig()?.googleClientId ?? null;

  const context: CardAccessContext | null = useMemo(() => {
    if (!data || !lesson) return null;
    return {
      mode: data.access,
      viewerId: data.viewer.user_id,
      lessonOwnerId: data.teacher_id,
      lessonStatus: lesson.status,
      peerVisibility: lesson.peer_visibility,
    };
  }, [data, lesson]);

  const tour = useTour(
    data ? lessonTour(data.access) : null,
    data?.viewer.user_id ?? null,
    !!data && !loading,
  );

  const canAdd = context ? canAddCards(context) : false;
  const metaLocked = !canEditLessonMeta(access) || (!isOwner && lesson?.status === "finished");

  const addCard = useCallback(
    async (type: CardType) => {
      if (!canAdd) return;
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
    [actions, canAdd],
  );

  useCardShortcuts(!!data && canAdd, (type) => void addCard(type));

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
      // Stan eksportu jest per konto: uczeń zapisuje własny plik na własnym Drive.
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
          <p className="error">{fatalError || "Lekcja nie istnieje albo link wygasł."}</p>
          <Link href="/dashboard" className="btn ghost" style={{ marginTop: 16, display: "inline-block" }}>
            ← Moje lekcje
          </Link>
        </div>
      </main>
    );
  }

  const nextOrder = data.cards.reduce((max, card) => Math.max(max, card.order_index), -1) + 1;

  const accessLabel =
    access === "owner" ? "tryb nauczyciela" : access === "member" ? "tryb ucznia" : "tajny link";

  function authorLabel(authorId: string | null) {
    if (!data) return "";
    if (authorId && authorId === data.viewer.user_id) return "";
    if (isLessonCard(authorId, data.teacher_id)) return "od nauczyciela";
    return data.authors[authorId ?? ""] || "inny uczeń";
  }

  const lockNote = isStudent
    ? lesson.status === "finished"
      ? "Lekcja zakończona — fiszek nie da się już zmieniać."
      : "Ustawienia lekcji prowadzi nauczyciel."
    : "Lekcja zakończona — link nauczyciela jest tylko do odczytu.";

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
            <span>{accessLabel}</span>
            <span>• {data.cards.length} fiszek</span>
            {isOwner && data.members.length > 0 && <span>• {data.members.length} uczniów</span>}
          </div>
        </div>
        <div className="btn-row">
          <button className="btn ghost small-btn" onClick={tour.start}>
            ❔ Instrukcja
          </button>
          {data.cards.length > 0 && (
            <Link
              href={`/study/?id=${encodeURIComponent(lesson.id)}${
                lessonKey ? `&key=${encodeURIComponent(lessonKey)}` : ""
              }`}
              className="btn small-btn"
              data-tour="study-link"
            >
              🎓 Ucz się
            </Link>
          )}
          {access !== "shared" && (
            <Link href="/dashboard" className="btn ghost small-btn">
              ← Lekcje
            </Link>
          )}
        </div>
      </div>

      <LessonHeader
        lesson={lesson}
        locked={metaLocked}
        lockNote={lockNote}
        syncState={syncState}
        pendingCount={pendingCount}
        onChange={actions.updateLesson}
        onRetry={actions.retryNow}
      />

      <QuickAddBar
        locked={!canAdd}
        importOpen={importOpen}
        shareOpen={accessOpen}
        isOwner={canManageAccess(access)}
        isStudent={isStudent}
        onAdd={(type) => void addCard(type)}
        onToggleImport={() => setImportOpen((value) => !value)}
        onToggleShare={() => setAccessOpen((value) => !value)}
      />

      {accessOpen && canManageAccess(access) && (
        <AccessPanel
          lesson={lesson}
          members={data.members}
          onChange={actions.updateLesson}
          onRemoveMember={(userId) => void actions.removeMember(userId)}
          onClose={() => setAccessOpen(false)}
        />
      )}

      {importOpen && (
        <ImportPanel
          existingCards={data.cards}
          nextOrder={nextOrder}
          locked={!canAdd}
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
            <h2>Dodaj pierwszą fiszkę</h2>
            <p>Podczas lekcji używaj przycisków powyżej albo Alt+1…Alt+4.</p>
          </div>
        ) : (
          data.cards.map((card, index) => (
            <CardEditor
              key={card.id}
              card={card}
              index={index}
              total={data.cards.length}
              locked={!canEditCard(context, card.author_id)}
              authorLabel={authorLabel(card.author_id)}
              onChange={actions.updateCard}
              onDelete={removeCard}
              onMove={moveCard}
            />
          ))
        )}
      </section>

      <LessonToolbar
        lesson={lesson}
        isOwner={isOwner}
        canFinish={canEditLessonMeta(access)}
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
