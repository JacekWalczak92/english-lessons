"use client";

/**
 * Postęp nauki w przeglądarce.
 *
 * Świadomie nie trzymamy tego w Supabase: prawdziwy SRS z SM-2 działa
 * w AnkiFiszki na Androidzie, a web ma być szybką powtórką przed lekcją
 * i po niej. Dzięki temu tryb nauki nie wymaga kolejnej migracji ani
 * synchronizacji, a wyniki i tak przeżywają zamknięcie karty.
 */

const PREFIX = "jlearner.study.";

export type CardProgress = {
  correct: number;
  wrong: number;
  lastResult: "ok" | "again";
  lastAt: string;
};

export type LessonProgress = {
  updatedAt: string;
  cards: Record<string, CardProgress>;
};

function emptyProgress(): LessonProgress {
  return { updatedAt: "", cards: {} };
}

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    // Prywatne okno albo zablokowane ciasteczka — nauka ma działać mimo to.
    return null;
  }
}

export function readProgress(lessonId: string): LessonProgress {
  const store = storage();
  if (!store) return emptyProgress();
  try {
    const raw = store.getItem(PREFIX + lessonId);
    if (!raw) return emptyProgress();
    const parsed = JSON.parse(raw) as LessonProgress;
    if (!parsed || typeof parsed !== "object" || !parsed.cards) return emptyProgress();
    return parsed;
  } catch {
    return emptyProgress();
  }
}

export function recordAnswer(lessonId: string, cardId: string, correct: boolean): LessonProgress {
  const store = storage();
  const progress = readProgress(lessonId);
  const previous = progress.cards[cardId] ?? {
    correct: 0,
    wrong: 0,
    lastResult: "again" as const,
    lastAt: "",
  };
  const now = new Date().toISOString();
  const next: LessonProgress = {
    updatedAt: now,
    cards: {
      ...progress.cards,
      [cardId]: {
        correct: previous.correct + (correct ? 1 : 0),
        wrong: previous.wrong + (correct ? 0 : 1),
        lastResult: correct ? "ok" : "again",
        lastAt: now,
      },
    },
  };
  if (store) {
    try {
      store.setItem(PREFIX + lessonId, JSON.stringify(next));
    } catch {
      // Brak miejsca albo tryb prywatny — sesja i tak dokończy się w pamięci.
    }
  }
  return next;
}

/** Fiszki „do poprawki”: ostatnio nietrafione albo częściej mylone niż trafiane. */
export function hardCardIds(progress: LessonProgress): string[] {
  return Object.entries(progress.cards)
    .filter(([, card]) => card.lastResult === "again" || card.wrong > card.correct)
    .map(([cardId]) => cardId);
}

export function clearProgress(lessonId: string) {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(PREFIX + lessonId);
  } catch {
    // Nic nie szkodzi — postęp jest pomocniczy, nie źródłem prawdy.
  }
}
