"use client";

import { useState, type FormEvent } from "react";
import { joinLessonByCode } from "@/lib/account";
import { JOIN_CODE_LENGTH, normalizeJoinCode } from "@/lib/types";

/** Pole na kod od nauczyciela. Kod przepisywany z ekranu bywa z myślnikiem i małymi literami. */
export function JoinLessonBox({ onJoined }: { onJoined: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await joinLessonByCode(code);
      setMessage({
        kind: "success",
        text: result.already_member
          ? `Jesteś już zapisany na „${result.title}”.`
          : `Dołączono do lekcji „${result.title}”.`,
      });
      setCode("");
      onJoined();
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "Nie udało się dołączyć.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel join-box" data-tour="join-code">
      <form onSubmit={submit} className="join-form">
        <div className="field">
          <label htmlFor="join-code">Kod lekcji od nauczyciela</label>
          <input
            id="join-code"
            className="input join-input"
            value={code}
            placeholder="ABCD-EFGH"
            autoComplete="off"
            spellCheck={false}
            maxLength={JOIN_CODE_LENGTH + 2}
            onChange={(event) => setCode(event.target.value)}
          />
        </div>
        <button className="btn" disabled={busy || normalizeJoinCode(code).length < 4}>
          {busy ? "Dołączam…" : "Dołącz do lekcji"}
        </button>
      </form>
      {message && <p className={message.kind === "success" ? "success" : "error"}>{message.text}</p>}
    </section>
  );
}
