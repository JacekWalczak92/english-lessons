"use client";

import { useId, type ReactNode } from "react";

/**
 * Etykieta powiązana z kontrolką.
 *
 * W v1.2.0 `<label>` nie miał `htmlFor`, więc kliknięcie etykiety nie ustawiało
 * fokusu, a czytnik ekranu odczytywał pola jako nienazwane.
 */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: (props: { id: string; "aria-describedby"?: string }) => ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children(hint ? { id, "aria-describedby": hintId } : { id })}
      {hint && (
        <span className="small muted" id={hintId}>
          {hint}
        </span>
      )}
    </div>
  );
}
