"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { CardEditor } from "@/components/lesson/CardEditor";
import { ImportPanel } from "@/components/lesson/ImportPanel";
import { LessonHeader } from "@/components/lesson/LessonHeader";
import { LessonToolbar } from "@/components/lesson/LessonToolbar";
import { QuickAddBar } from "@/components/lesson/QuickAddBar";
import { SharePanel } from "@/components/lesson/SharePanel";
import { downloadTextFile } from "@/lib/clipboard";
import { DRIVE_FOLDER_PATH, exportLessonToDrive } from "@/lib/google-drive";
import { readPublicConfig } from "@/lib/supabase-browser";
import { useCardShortcuts } from "@/lib/use-card-shortcuts";
import { useLesson } from "@/lib/use-lesson";
import {
  buildLessonExport,
  defaultDirection,
  lessonFileName,
  type CardType,
  type Lesson,
  type NewCardInput,
} from "@/lib/types";

type Banner = { kind: "success" | "warning"; text: string } | null;

/**
 * Orkiestracja edytora lekcji.
 *
 * Stan i synchronizacja siedzą w `useLesson`, pojedyncze fragmenty interfejsu
 * w `components/lesson/*`. Ten plik tylko je spina — w v1.2.0 wszystko to
 * mieszkało w jednym komponencie na 552 linie.
 */
export function LessonEditor({ lessonId, lessonKey }: { lessonId: string; lessonKey?: string }) {
  const scope = useMemo(() => ({ lessonId, lessonKey }), [lessonId, lessonKey]);
  const { data, loading, fatalError, syncError, syncState, pendingCount, actions } =
    useLesson(scope);

  const [importOpen, setImportOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [driveBusy, setDriveBusy] = useState(false);
  const [banner, setBanner] = useState<Banner>(null);

  const lesson = data?.lesson ?? null;
  const isOwner = data?.access === "owner";
  const locked = !!lesson && !isOwner && lesson.status === "finished";
  const googleClientId = readPublicConfig()?.googleClientId ?? null;

  const addCard = useCallback(
    async (type: CardType) => {
      if (locked) return;
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
    [actions, locked],
  );

  useCardShortcuts(!!data && !locked, (type) => void addCard(type));

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
        existingFileId: fresh.lesson.drive_file_id,
      });
      actions.updateLesson(
        {
          drive_file_id: result.id,
          drive_file_name: result.name,
          last_exported_at: payload.lesson.exportedAt,
        },
        true,
      );
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

  if (!data || !lesson) {
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

  return (
    <main className="shell">
      <div className="topbar">
        <div>
          <div className="brand">J-Learner · English Lessons</div>
          <div className="lesson-meta" style={{ marginTop: 6 }}>
            <span className={`badge ${lesson.status === "finished" ? "finished" : ""}`}>
              {lesson.status === "finished" ? "zakończona" : "w toku"}
            </span>
            <span>{isOwner ? "tryb właściciela" : "link nauczyciela"}</span>
            <span>• {data.cards.length} fiszek</span>
          </div>
        </div>
        {isOwner && (
          <Link href="/dashboard" className="btn ghost small-btn">
            ← Lekcje
          </Link>
        )}
      </div>

      <LessonHeader
        lesson={lesson}
        locked={locked}
        syncState={syncState}
        pendingCount={pendingCount}
        onChange={actions.updateLesson}
        onRetry={actions.retryNow}
      />

      <QuickAddBar
        locked={locked}
        importOpen={importOpen}
        shareOpen={shareOpen}
        isOwner={isOwner}
        onAdd={(type) => void addCard(type)}
        onToggleImport={() => setImportOpen((value) => !value)}
        onToggleShare={() => setShareOpen((value) => !value)}
      />

      {shareOpen && isOwner && (
        <SharePanel lesson={lesson} onChange={actions.updateLesson} onClose={() => setShareOpen(false)} />
      )}

      {importOpen && (
        <ImportPanel
          existingCards={data.cards}
          nextOrder={nextOrder}
          locked={locked}
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
              locked={locked}
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
        driveBusy={driveBusy}
        driveConfigured={!!googleClientId}
        onDownload={downloadJson}
        onExport={() => void exportDrive()}
        onStatusChange={(status: Lesson["status"]) => actions.updateLesson({ status }, true)}
      />
    </main>
  );
}
