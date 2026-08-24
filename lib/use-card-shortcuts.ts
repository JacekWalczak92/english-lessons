"use client";

import { useEffect, useRef } from "react";
import { SHORTCUT_TYPES } from "@/lib/card-labels";
import type { CardType } from "@/lib/types";

/**
 * Skróty Alt+1…Alt+4 dodające fiszkę wybranego typu.
 *
 * Dwie poprawki względem v1.2.0:
 * 1. `useEffect` nie miał tablicy zależności, więc listener był odpinany
 *    i podpinany przy każdym renderze — czyli przy każdym naciśnięciu klawisza.
 * 2. Brakowało warunku `!ctrlKey`. Na klawiaturze polskiej AltGr zgłasza się
 *    w przeglądarce jako Ctrl+Alt, więc skrót potrafił wystrzelić podczas
 *    normalnego pisania. Ignorujemy też auto-powtarzanie klawisza.
 */
export function useCardShortcuts(enabled: boolean, onAdd: (type: CardType) => void) {
  const handlerRef = useRef(onAdd);
  useEffect(() => {
    handlerRef.current = onAdd;
  }, [onAdd]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    function onKeyDown(event: KeyboardEvent) {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
      const type = SHORTCUT_TYPES[event.key];
      if (!type) return;
      event.preventDefault();
      handlerRef.current(type);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
}
