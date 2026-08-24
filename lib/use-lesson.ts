"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LessonApiError, lessonApi, type LessonScope } from "@/lib/lesson-api";
import {
  isUnchanged,
  lessonSyncStamp,
  type CardPatch,
  type LessonCard,
  type LessonPatch,
  type LessonPayload,
  type NewCardInput,
} from "@/lib/types";

const DEBOUNCE_MS = 500;
const POLL_ACTIVE_MS = 4000;
const POLL_IDLE_MS = 12000;
const IDLE_AFTER_POLLS = 5;
const RETRY_BASE_MS = 1000;
const RETRY_MAX_MS = 15000;

export type SyncState = "saved" | "saving" | "error" | "offline";

export type LessonState = {
  data: LessonPayload | null;
  loading: boolean;
  /** Błąd blokujący (np. brak dostępu do lekcji). */
  fatalError: string;
  /** Błąd zapisu — lekcja działa, ale zmiany czekają. */
  syncError: string;
  syncState: SyncState;
  /** Liczba niezapisanych zmian, używana też przez ostrzeżenie przed zamknięciem karty. */
  pendingCount: number;
};

export type LessonActions = {
  updateCard: (cardId: string, patch: CardPatch) => void;
  updateLesson: (patch: LessonPatch, immediate?: boolean) => void;
  createCard: (card: NewCardInput) => Promise<LessonCard | null>;
  createCards: (cards: NewCardInput[]) => Promise<LessonCard[]>;
  deleteCard: (cardId: string) => Promise<void>;
  moveCard: (cardId: string, direction: -1 | 1) => Promise<void>;
  /** Wypycha wszystkie oczekujące zmiany i zwraca świeży stan z serwera. */
  flushAndReload: () => Promise<LessonPayload | null>;
  retryNow: () => void;
  setLocalError: (message: string) => void;
};

function nextOrderIndex(cards: LessonCard[]) {
  return cards.reduce((max, card) => Math.max(max, card.order_index), -1) + 1;
}

function sortCards(cards: LessonCard[]) {
  return [...cards].sort(
    (a, b) => a.order_index - b.order_index || a.created_at.localeCompare(b.created_at),
  );
}

/**
 * Cały stan edytora lekcji: pobranie, polling, autosave i ponawianie.
 *
 * Wydzielone z komponentu, bo w v1.2.0 te cztery mechanizmy były przeplecione
 * z JSX-em w jednym pliku na 552 linie i nie dało się ich ani przeczytać,
 * ani przetestować osobno.
 */
export function useLesson(scope: LessonScope): LessonState & { actions: LessonActions } {
  const { lessonId, lessonKey } = scope;

  const [data, setData] = useState<LessonPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [fatalError, setFatalError] = useState("");
  const [syncError, setSyncError] = useState("");
  const [syncState, setSyncState] = useState<SyncState>("saved");
  const [pendingCount, setPendingCount] = useState(0);

  const dataRef = useRef<LessonPayload | null>(null);
  const stampRef = useRef<string>("");
  const mountedRef = useRef(true);

  // Kolejka autosave.
  const cardPatches = useRef(new Map<string, CardPatch>());
  const lessonPatch = useRef<LessonPatch>({});
  const cardTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const lessonTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryAttempt = useRef(0);

  // Ochrona pollingu przed nadpisaniem świeższego stanu lokalnego.
  const mutationSeq = useRef(0);
  const pollAbort = useRef<AbortController | null>(null);
  const quietPolls = useRef(0);

  const scopeRef = useRef<LessonScope>(scope);
  useEffect(() => {
    scopeRef.current = { lessonId, lessonKey };
  }, [lessonId, lessonKey]);

  const hasPending = useCallback(
    () => cardPatches.current.size > 0 || Object.keys(lessonPatch.current).length > 0,
    [],
  );

  const refreshPendingCount = useCallback(() => {
    const count = cardPatches.current.size + (Object.keys(lessonPatch.current).length > 0 ? 1 : 0);
    setPendingCount(count);
    return count;
  }, []);

  const applyPayload = useCallback((payload: LessonPayload) => {
    const normalized: LessonPayload = { ...payload, cards: sortCards(payload.cards) };
    dataRef.current = normalized;
    stampRef.current = lessonSyncStamp(normalized);
    setData(normalized);
  }, []);

  const patchLocal = useCallback((updater: (current: LessonPayload) => LessonPayload) => {
    setData((current) => {
      if (!current) return current;
      const next = updater(current);
      dataRef.current = next;
      return next;
    });
  }, []);

  // ---------------------------------------------------------------- zapisywanie

  const scheduleRetry = useCallback((run: () => void) => {
    if (retryTimer.current) return;
    const delay = Math.min(RETRY_BASE_MS * 2 ** retryAttempt.current, RETRY_MAX_MS);
    retryAttempt.current += 1;
    retryTimer.current = setTimeout(() => {
      retryTimer.current = null;
      run();
    }, delay);
  }, []);

  const flushCard = useCallback(
    async (cardId: string): Promise<boolean> => {
      const patch = cardPatches.current.get(cardId);
      if (!patch || Object.keys(patch).length === 0) return true;

      cardPatches.current.delete(cardId);
      refreshPendingCount();
      setSyncState("saving");

      try {
        const { card } = await lessonApi.patchCard(scopeRef.current, cardId, patch);
        mutationSeq.current += 1;
        // Zmiany, które przyszły w trakcie żądania, mają pierwszeństwo nad odpowiedzią.
        const stillPending = cardPatches.current.get(cardId);
        patchLocal((current) => ({
          ...current,
          cards: current.cards.map((item) =>
            item.id === cardId ? { ...card, ...(stillPending ?? {}) } : item,
          ),
        }));
        retryAttempt.current = 0;
        if (!hasPending()) {
          setSyncState("saved");
          setSyncError("");
        }
        return true;
      } catch (error) {
        // Patch wraca do kolejki — nowsze zmiany użytkownika mają pierwszeństwo.
        cardPatches.current.set(cardId, { ...patch, ...(cardPatches.current.get(cardId) ?? {}) });
        refreshPendingCount();
        const apiError = error instanceof LessonApiError ? error : null;
        setSyncState(apiError?.status === 0 ? "offline" : "error");
        setSyncError(error instanceof Error ? error.message : "Nie udało się zapisać fiszki.");
        if (apiError?.retryable !== false) scheduleRetry(() => void flushCard(cardId));
        return false;
      }
    },
    [hasPending, patchLocal, refreshPendingCount, scheduleRetry],
  );

  const flushLesson = useCallback(async (): Promise<boolean> => {
    const patch = lessonPatch.current;
    if (Object.keys(patch).length === 0) return true;

    lessonPatch.current = {};
    refreshPendingCount();
    setSyncState("saving");

    try {
      const { lesson } = await lessonApi.patchLesson(scopeRef.current, patch);
      mutationSeq.current += 1;
      patchLocal((current) => ({
        ...current,
        lesson: { ...current.lesson, ...lesson, ...lessonPatch.current },
      }));
      retryAttempt.current = 0;
      if (!hasPending()) {
        setSyncState("saved");
        setSyncError("");
      }
      return true;
    } catch (error) {
      lessonPatch.current = { ...patch, ...lessonPatch.current };
      refreshPendingCount();
      const apiError = error instanceof LessonApiError ? error : null;
      setSyncState(apiError?.status === 0 ? "offline" : "error");
      setSyncError(error instanceof Error ? error.message : "Nie udało się zapisać lekcji.");
      if (apiError?.retryable !== false) scheduleRetry(() => void flushLesson());
      return false;
    }
  }, [hasPending, patchLocal, refreshPendingCount, scheduleRetry]);

  const flushAll = useCallback(async () => {
    for (const timer of cardTimers.current.values()) clearTimeout(timer);
    cardTimers.current.clear();
    if (lessonTimer.current) {
      clearTimeout(lessonTimer.current);
      lessonTimer.current = null;
    }
    const cardIds = [...cardPatches.current.keys()];
    const results = await Promise.all([flushLesson(), ...cardIds.map((id) => flushCard(id))]);
    return results.every(Boolean);
  }, [flushCard, flushLesson]);

  const updateCard = useCallback(
    (cardId: string, patch: CardPatch) => {
      patchLocal((current) => ({
        ...current,
        cards: current.cards.map((card) => (card.id === cardId ? { ...card, ...patch } : card)),
      }));
      cardPatches.current.set(cardId, { ...(cardPatches.current.get(cardId) ?? {}), ...patch });
      refreshPendingCount();
      setSyncState("saving");
      quietPolls.current = 0;

      const previous = cardTimers.current.get(cardId);
      if (previous) clearTimeout(previous);
      cardTimers.current.set(
        cardId,
        setTimeout(() => {
          cardTimers.current.delete(cardId);
          void flushCard(cardId);
        }, DEBOUNCE_MS),
      );
    },
    [flushCard, patchLocal, refreshPendingCount],
  );

  const updateLesson = useCallback(
    (patch: LessonPatch, immediate = false) => {
      const { rotate_share_token: _rotate, ...optimistic } = patch;
      patchLocal((current) => ({ ...current, lesson: { ...current.lesson, ...optimistic } }));
      lessonPatch.current = { ...lessonPatch.current, ...patch };
      refreshPendingCount();
      setSyncState("saving");
      quietPolls.current = 0;

      if (lessonTimer.current) clearTimeout(lessonTimer.current);
      if (immediate) {
        void flushLesson();
      } else {
        lessonTimer.current = setTimeout(() => {
          lessonTimer.current = null;
          void flushLesson();
        }, DEBOUNCE_MS);
      }
    },
    [flushLesson, patchLocal, refreshPendingCount],
  );

  // ------------------------------------------------------------------ pobieranie

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await lessonApi.get(scopeRef.current);
      if (!mountedRef.current) return;
      if (!isUnchanged(result)) applyPayload(result);
      setFatalError("");
    } catch (error) {
      if (!mountedRef.current) return;
      setFatalError(error instanceof Error ? error.message : "Nie udało się pobrać lekcji.");
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [applyPayload]);

  useEffect(() => {
    mountedRef.current = true;
    void load();
    return () => {
      mountedRef.current = false;
    };
  }, [load]);

  const poll = useCallback(async () => {
    if (!dataRef.current || hasPending()) return;

    pollAbort.current?.abort();
    const controller = new AbortController();
    pollAbort.current = controller;
    const seqAtStart = mutationSeq.current;

    try {
      const result = await lessonApi.get(scopeRef.current, {
        since: stampRef.current,
        count: dataRef.current.cards.length,
        signal: controller.signal,
      });
      if (!mountedRef.current) return;
      if (isUnchanged(result)) {
        quietPolls.current += 1;
        return;
      }
      // Odpowiedź mogła wystartować przed lokalnym zapisem — wtedy jest już nieaktualna.
      if (mutationSeq.current !== seqAtStart || hasPending()) return;
      quietPolls.current = 0;
      applyPayload(result);
    } catch {
      // Polling jest best-effort: chwilowy błąd sieci nie może zepsuć edycji.
      quietPolls.current += 1;
    }
  }, [applyPayload, hasPending]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = () => {
      if (timer) clearTimeout(timer);
      const delay = quietPolls.current >= IDLE_AFTER_POLLS ? POLL_IDLE_MS : POLL_ACTIVE_MS;
      timer = setTimeout(tick, delay);
    };

    const tick = async () => {
      if (document.visibilityState === "visible") await poll();
      if (mountedRef.current) schedule();
    };

    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      quietPolls.current = 0;
      void poll();
      schedule();
    };

    schedule();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      pollAbort.current?.abort();
    };
  }, [poll]);

  // --------------------------------------------------- ochrona niezapisanych zmian

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasPending()) return;
      event.preventDefault();
      event.returnValue = "";
    };
    // Na mobile karta bywa usypiana bez `beforeunload` — `pagehide` łapie ten przypadek.
    const onPageHide = () => {
      if (hasPending()) void flushAll();
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [flushAll, hasPending]);

  // Wyjście z edytora (np. powrót do listy lekcji) nie może zgubić debounce'owanych zmian.
  useEffect(
    () => () => {
      if (cardPatches.current.size > 0 || Object.keys(lessonPatch.current).length > 0) {
        void flushAll();
      }
      for (const timer of cardTimers.current.values()) clearTimeout(timer);
      if (lessonTimer.current) clearTimeout(lessonTimer.current);
      if (retryTimer.current) clearTimeout(retryTimer.current);
    },
    [flushAll],
  );

  // ---------------------------------------------------------------------- akcje

  const createCard = useCallback(
    async (card: NewCardInput) => {
      const current = dataRef.current;
      if (!current) return null;
      try {
        const { card: created } = await lessonApi.createCard(scopeRef.current, {
          ...card,
          order_index: card.order_index ?? nextOrderIndex(current.cards),
        });
        mutationSeq.current += 1;
        patchLocal((state) => ({ ...state, cards: sortCards([...state.cards, created]) }));
        quietPolls.current = 0;
        return created;
      } catch (error) {
        setSyncError(error instanceof Error ? error.message : "Nie udało się dodać fiszki.");
        setSyncState("error");
        return null;
      }
    },
    [patchLocal],
  );

  const createCards = useCallback(
    async (cards: NewCardInput[]) => {
      if (cards.length === 0) return [];
      const { cards: created } = await lessonApi.createCards(scopeRef.current, cards);
      mutationSeq.current += 1;
      patchLocal((state) => ({ ...state, cards: sortCards([...state.cards, ...created]) }));
      quietPolls.current = 0;
      return created;
    },
    [patchLocal],
  );

  const deleteCard = useCallback(
    async (cardId: string) => {
      const timer = cardTimers.current.get(cardId);
      if (timer) clearTimeout(timer);
      cardTimers.current.delete(cardId);
      cardPatches.current.delete(cardId);
      refreshPendingCount();
      try {
        await lessonApi.deleteCard(scopeRef.current, cardId);
        mutationSeq.current += 1;
        patchLocal((state) => ({ ...state, cards: state.cards.filter((c) => c.id !== cardId) }));
        quietPolls.current = 0;
      } catch (error) {
        setSyncError(error instanceof Error ? error.message : "Nie udało się usunąć fiszki.");
        setSyncState("error");
      }
    },
    [patchLocal, refreshPendingCount],
  );

  /**
   * Zamiana kolejności sąsiadujących fiszek. Kolumna `order_index` istniała
   * od v1.0, ale nic w interfejsie z niej nie korzystało.
   */
  const moveCard = useCallback(
    async (cardId: string, direction: -1 | 1) => {
      const current = dataRef.current;
      if (!current) return;
      const index = current.cards.findIndex((card) => card.id === cardId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.cards.length) return;

      const a = current.cards[index];
      const b = current.cards[target];
      // Indeksy mogą być równe (import równoległy) — wtedy nadajemy je od nowa.
      const orderA = a.order_index === b.order_index ? index : a.order_index;
      const orderB = a.order_index === b.order_index ? target : b.order_index;

      const reordered = [...current.cards];
      reordered[index] = { ...a, order_index: orderB };
      reordered[target] = { ...b, order_index: orderA };
      patchLocal((state) => ({ ...state, cards: sortCards(reordered) }));

      updateCard(a.id, { order_index: orderB });
      updateCard(b.id, { order_index: orderA });
    },
    [patchLocal, updateCard],
  );

  const flushAndReload = useCallback(async () => {
    await flushAll();
    const result = await lessonApi.get(scopeRef.current);
    if (isUnchanged(result)) return dataRef.current;
    applyPayload(result);
    return result;
  }, [applyPayload, flushAll]);

  const retryNow = useCallback(() => {
    if (retryTimer.current) {
      clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }
    retryAttempt.current = 0;
    void flushAll();
  }, [flushAll]);

  const actions = useMemo<LessonActions>(
    () => ({
      updateCard,
      updateLesson,
      createCard,
      createCards,
      deleteCard,
      moveCard,
      flushAndReload,
      retryNow,
      setLocalError: setSyncError,
    }),
    [
      createCard,
      createCards,
      deleteCard,
      flushAndReload,
      moveCard,
      retryNow,
      updateCard,
      updateLesson,
    ],
  );

  return { data, loading, fatalError, syncError, syncState, pendingCount, actions };
}
