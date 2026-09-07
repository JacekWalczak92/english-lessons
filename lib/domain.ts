// Jedno źródło prawdy dla wartości domenowych i reguł dostępu.
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

/** Rola konta jest przypisana na stałe przy rejestracji. */
export const APP_ROLES = ["teacher", "student"] as const;

/**
 * `lesson` — lekcja ucznia przypisana nauczycielowi albo własna lekcja nauczyciela.
 * `set` — gotowy zestaw słówek przygotowany przez nauczyciela do biblioteki.
 */
export const LESSON_KINDS = ["lesson", "set"] as const;

/**
 * Tryb dostępu do lekcji:
 * `owner`    — konto, które lekcję założyło (zwykle uczeń),
 * `assigned` — nauczyciel przypisany do tej lekcji przez ucznia.
 *
 * Nie ma trybu „z linku”: od v1.7.0 wszystko idzie przez konta w systemie.
 */
export const ACCESS_MODES = ["owner", "assigned"] as const;

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
  student_comment: 4000,
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

/**
 * Kontekst uprawnień w lekcji.
 *
 * Podział obowiązków od v1.7.0: treść fiszek wypełnia nauczyciel, uczeń
 * dopisuje do każdej fiszki własny komentarz. Te same funkcje egzekwuje
 * Edge Function i interfejs, żeby nie pokazywać pól, których zapis i tak
 * zostałby odrzucony.
 */
export type LessonAccessContext = {
  mode: AccessMode;
  viewerRole: AppRole;
  lessonStatus: LessonStatus;
};

/** Treść fiszek (słówka, zdania, wymowa) wypełnia wyłącznie nauczyciel. */
export function canEditCards(context: LessonAccessContext): boolean {
  if (context.viewerRole !== "teacher") return false;
  return context.lessonStatus === "draft" || context.mode === "owner";
}

/** Komentarz ucznia — jedyne pole fiszki, które uzupełnia konto ucznia. */
export function canEditStudentComment(context: LessonAccessContext): boolean {
  if (context.viewerRole !== "student") return false;
  if (context.mode !== "owner") return false;
  return context.lessonStatus === "draft";
}

/** Tytuł, data i nazwa lekcji. */
export function canEditLessonMeta(context: LessonAccessContext): boolean {
  return context.mode === "owner" || context.lessonStatus === "draft";
}

/** Zamknięcie i ponowne otwarcie lekcji — obie strony lekcji. */
export function canChangeStatus(context: LessonAccessContext): boolean {
  return context.mode === "owner" || context.viewerRole === "teacher";
}

/** Zmiana przypisanego nauczyciela i publikacja zestawu należą do właściciela. */
export function canManageLesson(context: LessonAccessContext): boolean {
  return context.mode === "owner";
}

/** Uczeń może przypisać lekcję tylko nauczycielowi, i tylko przy zakładaniu konta lekcji. */
export function canAssignTeacher(role: AppRole): boolean {
  return role === "student";
}
