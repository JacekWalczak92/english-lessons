"use client";

import { useState } from "react";
import { copyToClipboard } from "@/lib/clipboard";
import { absoluteSiteUrl } from "@/lib/site-path";
import type { Lesson, LessonPatch } from "@/lib/types";

export function shareLinkFor(lesson: Pick<Lesson, "id" | "share_token">) {
  if (!lesson.share_token) return null;
  return absoluteSiteUrl(
    `/lesson/?id=${encodeURIComponent(lesson.id)}&key=${encodeURIComponent(lesson.share_token)}`,
  );
}

/**
 * Panel tajnego linku.
 *
 * Kolumny `share_enabled` i `share_token` istniały w bazie od pierwszej wersji,
 * ale interfejs nie pozwalał ani wyłączyć udostępniania, ani unieważnić linku,
 * który wyciekł. Teraz jedno i drugie jest dostępne dla właściciela.
 */
export function SharePanel({
  lesson,
  onChange,
  onClose,
}: {
  lesson: Lesson;
  onChange: (patch: LessonPatch, immediate?: boolean) => void;
  onClose: () => void;
}) {
  const [message, setMessage] = useState<{ kind: "success" | "warning"; text: string } | null>(null);
  const link = shareLinkFor(lesson);

  async function copy() {
    if (!link) return;
    const ok = await copyToClipboard(link);
    setMessage(
      ok
        ? { kind: "success", text: "Link dla nauczyciela skopiowany." }
        : { kind: "warning", text: "Nie udało się skopiować. Zaznacz link i skopiuj ręcznie." },
    );
  }

  function rotate() {
    if (!window.confirm("Wygenerować nowy link? Stary przestanie działać natychmiast.")) return;
    onChange({ rotate_share_token: true }, true);
    setMessage({ kind: "success", text: "Nowy link został wygenerowany — skopiuj go ponownie." });
  }

  return (
    <section className="panel share-panel">
      <div className="card-top import-head">
        <h2>Link dla nauczyciela</h2>
        <button className="btn ghost small-btn" onClick={onClose}>
          Zamknij
        </button>
      </div>

      <label className="toggle">
        <input
          type="checkbox"
          checked={lesson.share_enabled}
          onChange={(event) => onChange({ share_enabled: event.target.checked }, true)}
        />
        <span>Udostępnianie tajnym linkiem włączone</span>
      </label>

      {lesson.share_enabled ? (
        <>
          <p className="muted small">
            Każdy, kto ma ten link, może edytować fiszki tej lekcji bez logowania. Traktuj go jak
            hasło.
          </p>
          <input className="input share-input" readOnly value={link ?? ""} onFocus={(e) => e.currentTarget.select()} />
          <div className="btn-row" style={{ marginTop: 12 }}>
            <button className="btn secondary" onClick={copy} disabled={!link}>
              Kopiuj link
            </button>
            <button className="btn ghost" onClick={rotate}>
              Wygeneruj nowy link
            </button>
          </div>
        </>
      ) : (
        <p className="muted small">
          Udostępnianie jest wyłączone — istniejący link nie otworzy lekcji.
        </p>
      )}

      {message && <p className={message.kind === "success" ? "success" : "warning"}>{message.text}</p>}
    </section>
  );
}
