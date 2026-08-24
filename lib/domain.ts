// Jedno źródło prawdy dla wartości domenowych.
// Kopia dla Deno leży w supabase/functions/_shared/domain.ts,
// a test tests/domain-sync.test.ts pilnuje, żeby oba pliki się nie rozjechały.

export const CARD_TYPES = [
  "translation_sentence",
  "word_phrase",
  "pronunciation",
  "british",
  "custom",
] as const;

export const REVIEW_DIRECTIONS = ["EN_TO_PL", "PL_TO_EN", "PRONUNCIATION"] as const;

export const LESSON_STATUSES = ["draft", "finished"] as const;

export const FIELD_LIMITS = {
  title: 200,
  teacher_name: 120,
  english: 8000,
  polish: 8000,
  phonetic: 1000,
  pronunciation: 1000,
  note: 12000,
  example: 12000,
  british_variant: 4000,
  american_variant: 4000,
  order_index: 100000,
  import_batch: 1000,
} as const;

export type CardType = (typeof CARD_TYPES)[number];
export type ReviewDirection = (typeof REVIEW_DIRECTIONS)[number];
export type LessonStatus = (typeof LESSON_STATUSES)[number];

export function isCardType(value: string): value is CardType {
  return (CARD_TYPES as readonly string[]).includes(value);
}

/**
 * Domyślny kierunek powtórki dla typu fiszki.
 */
export function defaultDirection(type: CardType): ReviewDirection {
  switch (type) {
    case "pronunciation":
      return "PRONUNCIATION";
    case "translation_sentence":
    case "word_phrase":
      return "PL_TO_EN";
    default:
      return "EN_TO_PL";
  }
}

/**
 * Kierunek po zmianie typu fiszki.
 *
 * W v1.2.0 zmiana typu zawsze nadpisywała kierunek wartością domyślną, więc
 * świadomy wybór użytkownika (np. EN → PL dla zdania) znikał przy każdej
 * korekcie typu. Teraz nadpisujemy tylko wtedy, gdy dotychczasowy kierunek
 * przestał pasować do typu.
 */
export function directionForTypeChange(
  nextType: CardType,
  currentDirection: ReviewDirection,
): ReviewDirection {
  if (nextType === "pronunciation") return "PRONUNCIATION";
  if (currentDirection === "PRONUNCIATION") return defaultDirection(nextType);
  return currentDirection;
}
