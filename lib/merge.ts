import type { LessonCard } from "./types.ts";

/**
 * Łączenie fiszek z kilku lekcji — wspólna nauka i „Połącz w nowy zestaw”.
 *
 * Czysta logika bez Reacta. Ta sama normalizacja co `dedupeKey()` w
 * lib/word-export-format.ts i funkcja `english_merge_lessons` w bazie, więc
 * nauka razem i nowy zestaw zgadzają się co do tego, co jest duplikatem.
 */

/** Najwięcej lekcji w jednym łączeniu — tyle samo pilnuje funkcja w bazie. */
export const MERGE_LIMIT = 20;

/** Pseudo-lekcja ze słówkami z telefonu („Moje słówka”). */
export const MY_WORDS_SOURCE = "my-words";

export function mergeKey(card: Pick<LessonCard, "card_type" | "english">): string {
  const english = card.english.trim().replace(/\s+/g, " ").toLowerCase();
  // Fiszka wymowy pyta o coś innego niż zwykła fiszka z tym samym słowem.
  return card.card_type === "pronunciation" ? `pronunciation:${english}` : english;
}

export type MergeSource = {
  /** Id lekcji albo `MY_WORDS_SOURCE`. */
  id: string;
  title: string;
  cards: LessonCard[];
};

export type MergedCards = {
  cards: LessonCard[];
  /** cardId → id lekcji, z której fiszka pochodzi (postęp nauki zapisujemy per lekcja). */
  origin: Record<string, string>;
  /** Ile fiszek pominięto, bo to samo słówko było już w innej lekcji. */
  duplicates: number;
};

/**
 * Skleja fiszki w kolejności źródeł. Przy duplikacie zostaje pierwsza fiszka,
 * więc to wywołujący decyduje, która lekcja „wygrywa” (lista lekcji jest
 * posortowana od najnowszej). Fiszki bez angielskiej strony nie mają klucza
 * i przechodzą bez porównania.
 */
export function mergeCards(sources: MergeSource[]): MergedCards {
  const seen = new Set<string>();
  const cards: LessonCard[] = [];
  const origin: Record<string, string> = {};
  let duplicates = 0;

  for (const source of sources) {
    const ordered = [...source.cards].sort(
      (a, b) => a.order_index - b.order_index || a.created_at.localeCompare(b.created_at),
    );
    for (const card of ordered) {
      if (origin[card.id]) continue;
      const key = card.english.trim() ? mergeKey(card) : "";
      if (key && seen.has(key)) {
        duplicates += 1;
        continue;
      }
      if (key) seen.add(key);
      cards.push(card);
      origin[card.id] = source.id;
    }
  }

  return { cards, origin, duplicates };
}

/** Parsuje `?ids=a,b,c` (albo stare `?id=a`) — bez pustych i bez powtórzeń. */
export function parseLessonIds(ids: string | null, id: string | null): string[] {
  const raw = [...(ids ?? "").split(","), id ?? ""];
  return [...new Set(raw.map((value) => value.trim()).filter(Boolean))].slice(0, MERGE_LIMIT);
}

/** Link do wspólnej nauki. Jedna lekcja dostaje stary, krótki adres. */
export function studyHref(lessonIds: string[], withMyWords = false): string {
  const params = new URLSearchParams();
  if (lessonIds.length === 1) params.set("id", lessonIds[0]);
  else if (lessonIds.length > 1) params.set("ids", lessonIds.join(","));
  if (withMyWords) params.set("words", "1");
  return `/study/?${params.toString()}`;
}

/** Domyślna nazwa nowego zestawu: „Powtórka: 12.10–02.11” albo z jednego dnia. */
export function defaultMergeTitle(dates: string[]): string {
  const sorted = dates.filter(Boolean).sort();
  if (sorted.length === 0) return "Powtórka";
  const short = (value: string) => {
    const [, month, day] = value.split("-");
    return month && day ? `${day}.${month}` : value;
  };
  const first = short(sorted[0]);
  const last = short(sorted[sorted.length - 1]);
  return first === last ? `Powtórka: ${first}` : `Powtórka: ${first}–${last}`;
}
