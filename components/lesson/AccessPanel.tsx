"use client";

import { useState } from "react";
import { copyToClipboard } from "@/lib/clipboard";
import { absoluteSiteUrl } from "@/lib/site-path";
import { formatJoinCode, type Lesson, type LessonMember, type LessonPatch } from "@/lib/types";

export function shareLinkFor(lesson: Pick<Lesson, "id" | "share_token">) {
  if (!lesson.share_token) return null;
  return absoluteSiteUrl(
    `/lesson/?id=${encodeURIComponent(lesson.id)}&key=${encodeURIComponent(lesson.share_token)}`,
  );
}

export function joinLinkFor(lesson: Pick<Lesson, "join_code">) {
  if (!lesson.join_code) return null;
  return absoluteSiteUrl(`/join/?code=${encodeURIComponent(lesson.join_code)}`);
}

type Message = { kind: "success" | "warning"; text: string } | null;

/**
 * Panel dostępu do lekcji: kod dla uczniów, widoczność fiszek, publikacja
 * zestawu i stary tajny link nauczyciela.
 *
 * Kod dołączenia zastępuje w v1.4.0 rolę tajnego linku w typowej lekcji:
 * uczeń wchodzi na własne konto, więc jego fiszki mają autora, a nauczyciel
 * widzi, kto co dodał. Tajny link zostaje dla nauczyciela bez konta.
 */
export function AccessPanel({
  lesson,
  members,
  onChange,
  onRemoveMember,
  onClose,
}: {
  lesson: Lesson;
  members: LessonMember[];
  onChange: (patch: LessonPatch, immediate?: boolean) => void;
  onRemoveMember: (userId: string) => void;
  onClose: () => void;
}) {
  const [message, setMessage] = useState<Message>(null);
  const [showSecretLink, setShowSecretLink] = useState(false);

  const joinCode = lesson.join_code ?? "";
  const joinLink = joinLinkFor(lesson);
  const shareLink = shareLinkFor(lesson);
  const isSet = lesson.lesson_kind === "set";

  async function copy(value: string | null, label: string) {
    if (!value) return;
    const ok = await copyToClipboard(value);
    setMessage(
      ok
        ? { kind: "success", text: `${label} skopiowany.` }
        : { kind: "warning", text: "Nie udało się skopiować. Zaznacz tekst i skopiuj ręcznie." },
    );
  }

  function rotateJoinCode() {
    if (!window.confirm("Wygenerować nowy kod? Stary przestanie działać, ale zapisani uczniowie zostają.")) {
      return;
    }
    onChange({ rotate_join_code: true }, true);
    setMessage({ kind: "success", text: "Nowy kod został wygenerowany." });
  }

  function rotateShareToken() {
    if (!window.confirm("Wygenerować nowy tajny link? Stary przestanie działać natychmiast.")) return;
    onChange({ rotate_share_token: true }, true);
    setMessage({ kind: "success", text: "Nowy link został wygenerowany — skopiuj go ponownie." });
  }

  return (
    <section className="panel share-panel">
      <div className="card-top import-head">
        <h2>Dostęp i uczniowie</h2>
        <button className="btn ghost small-btn" onClick={onClose}>
          Zamknij
        </button>
      </div>

      <div className="access-block">
        <h3>Kod dla uczniów</h3>
        <label className="toggle">
          <input
            type="checkbox"
            checked={lesson.join_enabled}
            onChange={(event) => onChange({ join_enabled: event.target.checked }, true)}
          />
          <span>Uczniowie mogą dołączać kodem</span>
        </label>

        {lesson.join_enabled ? (
          <>
            <p className="join-code">{formatJoinCode(joinCode)}</p>
            <p className="muted small">
              Uczeń zakłada własne konto, wpisuje ten kod i dodaje do lekcji swoje fiszki. Każdy
              widzi Twoje słówka i własne.
            </p>
            <div className="btn-row">
              <button className="btn secondary small-btn" onClick={() => void copy(joinCode, "Kod")}>
                Kopiuj kod
              </button>
              <button
                className="btn secondary small-btn"
                onClick={() => void copy(joinLink, "Link z kodem")}
              >
                Kopiuj link z kodem
              </button>
              <button className="btn ghost small-btn" onClick={rotateJoinCode}>
                Nowy kod
              </button>
            </div>
          </>
        ) : (
          <p className="muted small">Dołączanie wyłączone — kod nie zadziała.</p>
        )}
      </div>

      <div className="access-block">
        <h3>Widoczność fiszek</h3>
        <label className="toggle">
          <input
            type="checkbox"
            checked={lesson.peer_visibility}
            onChange={(event) => onChange({ peer_visibility: event.target.checked }, true)}
          />
          <span>Uczniowie widzą nawzajem swoje fiszki</span>
        </label>
        <p className="muted small">
          Wyłączone: każdy uczeń widzi tylko Twoje słówka i swoje własne. Ty widzisz wszystkie.
        </p>
      </div>

      <div className="access-block">
        <h3>Biblioteka gotowych zestawów</h3>
        {isSet ? (
          <>
            <label className="toggle">
              <input
                type="checkbox"
                checked={lesson.is_published}
                onChange={(event) => onChange({ is_published: event.target.checked }, true)}
              />
              <span>Opublikuj zestaw dla wszystkich uczniów</span>
            </label>
            <p className="muted small">
              Opublikowany zestaw widać w zakładce „Biblioteka”. Uczeń kopiuje go na swoje konto —
              Twój oryginał zostaje nietknięty.
            </p>
          </>
        ) : (
          <p className="muted small">
            To jest lekcja na żywo. Gotowy zestaw do biblioteki tworzy się przyciskiem „+ Nowy
            zestaw słówek” na liście lekcji.
          </p>
        )}
      </div>

      <div className="access-block">
        <h3>Uczniowie ({members.length})</h3>
        {members.length === 0 ? (
          <p className="muted small">Nikt jeszcze nie dołączył.</p>
        ) : (
          <ul className="member-list">
            {members.map((member) => (
              <li key={member.user_id}>
                <span className="member-name">{member.display_name || "Uczeń bez nazwy"}</span>
                <span className="muted small">{member.card_count} fiszek</span>
                <button
                  className="btn danger small-btn"
                  onClick={() => {
                    if (window.confirm(`Usunąć ${member.display_name || "ucznia"} z lekcji?`)) {
                      onRemoveMember(member.user_id);
                    }
                  }}
                >
                  Usuń z lekcji
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="access-block">
        <h3>Tajny link (nauczyciel bez konta)</h3>
        <button
          className="btn ghost small-btn"
          aria-expanded={showSecretLink}
          onClick={() => setShowSecretLink((value) => !value)}
        >
          {showSecretLink ? "Ukryj" : "Pokaż ustawienia linku"}
        </button>

        {showSecretLink && (
          <>
            <label className="toggle" style={{ marginTop: 10 }}>
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
                  Każdy, kto ma ten link, edytuje fiszki tej lekcji bez logowania i bez podpisu
                  autora. Traktuj go jak hasło.
                </p>
                <input
                  className="input share-input"
                  readOnly
                  value={shareLink ?? ""}
                  onFocus={(event) => event.currentTarget.select()}
                />
                <div className="btn-row" style={{ marginTop: 12 }}>
                  <button
                    className="btn secondary small-btn"
                    onClick={() => void copy(shareLink, "Link")}
                    disabled={!shareLink}
                  >
                    Kopiuj link
                  </button>
                  <button className="btn ghost small-btn" onClick={rotateShareToken}>
                    Wygeneruj nowy link
                  </button>
                </div>
              </>
            ) : (
              <p className="muted small">
                Udostępnianie jest wyłączone — istniejący link nie otworzy lekcji.
              </p>
            )}
          </>
        )}
      </div>

      {message && (
        <p className={message.kind === "success" ? "success" : "warning"}>{message.text}</p>
      )}
    </section>
  );
}
