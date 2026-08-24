// Kopia lib/domain.ts dla środowiska Deno (Edge Function nie może importować
// z drzewa Next.js). Test tests/domain-sync.test.ts porównuje oba pliki i
// wywala się, jeśli listy wartości albo limity pól się rozjadą.

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
