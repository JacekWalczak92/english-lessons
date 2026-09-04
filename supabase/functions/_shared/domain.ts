// Kopia lib/domain.ts dla Deno (Edge Function nie importuje z drzewa Next.js).
// Test tests/domain-sync.test.ts pilnuje, żeby obie kopie się nie rozjechały.

export const CARD_TYPES = [
  "translation_sentence",
  "word_phrase",
  "pronunciation",
  "british",
  "custom",
] as const;

export const REVIEW_DIRECTIONS = ["EN_TO_PL", "PL_TO_EN", "PRONUNCIATION"] as const;

export const LESSON_STATUSES = ["draft", "finished"] as const;

/** Rola konta: nauczyciel zakłada lekcje i zestawy, uczeń dołącza i robi własne fiszki. */
export const APP_ROLES = ["teacher", "student"] as const;

/**
 * `lesson` — lekcja na żywo, do której uczniowie dołączają kodem.
 * `set` — gotowy zestaw słówek przygotowany przez nauczyciela do udostępnienia.
 */
export const LESSON_KINDS = ["lesson", "set"] as const;

/**
 * Tryb dostępu do lekcji:
 * `owner`  — właściciel (JWT),
 * `member` — uczeń zapisany na lekcję (JWT + wpis w english_lesson_members),
 * `shared` — wejście tajnym linkiem, bez konta (zgodność z v1.3.0).
 */
export const ACCESS_MODES = ["owner", "member", "shared"] as const;

/** Bez I, O, 0 i 1 — kod bywa przepisywany z ekranu nauczyciela. */
export const JOIN_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const JOIN_CODE_LENGTH = 8;

export const FIELD_LIMITS = {
  title: 200,
  teacher_name: 120,
  display_name: 80,
  description: 500,
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
export type AppRole = (typeof APP_ROLES)[number];
export type LessonKind = (typeof LESSON_KINDS)[number];
export type AccessMode = (typeof ACCESS_MODES)[number];

export function isCardType(value: string): value is CardType {
  return (CARD_TYPES as readonly string[]).includes(value);
}

export function isAppRole(value: string): value is AppRole {
  return (APP_ROLES as readonly string[]).includes(value);
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

/** Format kodu dołączenia pokazywany na ekranie: ABCD-EFGH. */
export function formatJoinCode(code: string): string {
  const clean = normalizeJoinCode(code);
  if (clean.length <= 4) return clean;
  return `${clean.slice(0, 4)}-${clean.slice(4)}`;
}

/** Kod wpisany ręcznie: małe litery, spacje i myślniki nie mogą przeszkadzać. */
export function normalizeJoinCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, JOIN_CODE_LENGTH);
}

/**
 * Kontekst uprawnień jednej fiszki. Trzymamy go w domenie, bo dokładnie te same
 * reguły muszą obowiązywać w Edge Function (autorytatywnie) i w interfejsie
 * (żeby nie pokazywać pól, których zapis i tak zostanie odrzucony).
 */
export type CardAccessContext = {
  mode: AccessMode;
  viewerId: string | null;
  lessonOwnerId: string | null;
  lessonStatus: LessonStatus;
  peerVisibility: boolean;
};

/** Fiszka „lekcyjna” — dodana przez właściciela albo przez tajny link nauczyciela. */
export function isLessonCard(authorId: string | null, lessonOwnerId: string | null): boolean {
  return authorId === null || (lessonOwnerId !== null && authorId === lessonOwnerId);
}

/**
 * Czy fiszka jest widoczna dla oglądającego.
 *
 * Uczeń zawsze widzi słówka od nauczyciela i swoje własne. Fiszki innych uczniów
 * pokazujemy tylko wtedy, gdy nauczyciel włączył `peer_visibility` — inaczej
 * lekcja z ośmiorgiem uczniów zamienia się we wspólny, nieczytelny worek.
 */
export function isCardVisible(context: CardAccessContext, authorId: string | null): boolean {
  if (context.mode !== "member") return true;
  if (isLessonCard(authorId, context.lessonOwnerId)) return true;
  if (context.viewerId !== null && authorId === context.viewerId) return true;
  return context.peerVisibility;
}

/** Czy oglądający może edytować/usunąć konkretną fiszkę. */
export function canEditCard(context: CardAccessContext, authorId: string | null): boolean {
  if (context.mode === "owner") return true;
  if (context.lessonStatus === "finished") return false;
  if (context.mode === "shared") return true;
  return context.viewerId !== null && authorId === context.viewerId;
}

/** Czy oglądający może dodawać nowe fiszki (własne). */
export function canAddCards(context: CardAccessContext): boolean {
  if (context.mode === "owner") return true;
  return context.lessonStatus !== "finished";
}

/** Nazwa, tytuł, data, status — metadane lekcji. Uczeń ich nie zmienia. */
export function canEditLessonMeta(mode: AccessMode): boolean {
  return mode === "owner" || mode === "shared";
}

/** Kod dołączenia, tajny link, publikacja zestawu, usuwanie uczniów. */
export function canManageAccess(mode: AccessMode): boolean {
  return mode === "owner";
}
