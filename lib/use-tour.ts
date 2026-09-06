"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { TOURS, tourStorageKey, visibleSteps, type TourId, type TourStep } from "@/lib/onboarding";

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function isTourSeen(tourId: TourId, userId: string | null): boolean {
  return storage()?.getItem(tourStorageKey(tourId, userId)) === "1";
}

export function markTourSeen(tourId: TourId, userId: string | null) {
  try {
    storage()?.setItem(tourStorageKey(tourId, userId), "1");
  } catch {
    // Tryb prywatny — instruktaż pokaże się ponownie, ale nic się nie psuje.
  }
}

/**
 * Instruktaż uruchamiany raz, przy pierwszym wejściu na ekran.
 *
 * `ready` mówi, że ekran ma już dane (np. listę lekcji) — bez tego kroki
 * wskazywałyby na elementy, których jeszcze nie ma w DOM-ie.
 */
export function useTour(tourId: TourId | null, userId: string | null, ready: boolean) {
  const [active, setActive] = useState(false);
  const [steps, setSteps] = useState<TourStep[]>([]);

  const collect = useCallback(() => {
    if (!tourId) return [] as TourStep[];
    return visibleSteps(
      TOURS[tourId],
      (target) => !!document.querySelector(`[data-tour="${target}"]`),
    );
  }, [tourId]);

  useEffect(() => {
    if (!tourId || !ready || active) return;
    if (isTourSeen(tourId, userId)) return;
    // Krótka zwłoka: pierwszy render listy bywa jeszcze bez elementów docelowych.
    const timer = window.setTimeout(() => {
      const found = collect();
      if (found.length === 0) return;
      setSteps(found);
      setActive(true);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [active, collect, ready, tourId, userId]);

  const start = useCallback(() => {
    const found = collect();
    if (found.length === 0) return;
    setSteps(found);
    setActive(true);
  }, [collect]);

  const finish = useCallback(() => {
    setActive(false);
    if (tourId) markTourSeen(tourId, userId);
  }, [tourId, userId]);

  return useMemo(() => ({ active, steps, start, finish }), [active, finish, start, steps]);
}
