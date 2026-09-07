import type {
  AccessMode,
  AppRole,
  CardType,
  LessonKind,
  LessonStatus,
  ReviewDirection,
} from "./domain.ts";

export type { AccessMode, AppRole, CardType, LessonKind, LessonStatus, ReviewDirection };
export {
  ACCESS_MODES,
  APP_ROLES,
  CARD_TYPES,
  FIELD_LIMITS,
  LESSON_KINDS,
  LESSON_STATUSES,
  REVIEW_DIRECTIONS,
  canAssignTeacher,
  canChangeStatus,
  canEditCards,
  canEditLessonMeta,
  canEditStudentComment,
  canManageLesson,
  defaultDirection,
  directionForTypeChange,
  isAppRole,
  isCardType,
} from "./domain.ts";
export type { LessonAccessContext } from "./domain.ts";

export type Lesson = {
  id: string;
  owner_id?: string;
  lesson_date: string;
  title: string;
  teacher_name: string | null;
  status: LessonStatus;
  lesson_kind: LessonKind;
  description: string;
  /** Nauczyciel przypisany przez ucznia. `null` = własna lekcja nauczyciela. */
  assigned_teacher_id: string | null;
  assigned_at: string | null;
  /** Czego uczeń oczekuje od tej lekcji — nauczyciel czyta to przed wypełnieniem. */
  student_request: string;
  /** Zestaw opublikowany w bibliotece jest widoczny dla wszystkich uczniów. */
  is_published: boolean;
  card_count: number;
  source_lesson_id: string | null;
  drive_file_id: string | null;
  drive_file_name: string | null;
  last_exported_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AppProfile = {
  user_id: string;
  role: AppRole;
  display_name: string;
  /** Nauczyciel może zniknąć z listy wyboru, gdy nie przyjmuje nowych uczniów. */
  accepting_students: boolean;
};

/** Pozycja w katalogu nauczycieli, z którego uczeń wybiera prowadzącego. */
export type TeacherDirectoryEntry = {
  user_id: string;
  display_name: string;
  accepting_students: boolean;
};

/** Druga strona lekcji: dla ucznia — nauczyciel, dla nauczyciela — uczeń. */
export type LessonCounterpart = {
  user_id: string;
  display_name: string;
  role: AppRole;
} | null;

/** Stan eksportu na Drive jest per konto: nauczyciel i uczeń mają własne pliki. */
export type DriveState = {
  drive_file_id: string | null;
  drive_file_name: string | null;
  last_exported_at: string | null;
};

export type LessonCard = {
  id: string;
  lesson_id: string;
  /** Konto, które fiszkę utworzyło — od v1.7.0 zawsze nauczyciel. */
  author_id: string | null;
  card_type: CardType;
  english: string;
  polish: string;
  review_direction: ReviewDirection;
  phonetic: string;
  pronunciation: string;
  note: string;
  example: string;
  british_variant: string;
  american_variant: string;
  /** Jedyne pole fiszki, które wypełnia uczeń. */
  student_comment: string;
  order_index: number;
  created_at: string;
  updated_at: string;
};

export type LessonAccess = AccessMode;

export type LessonViewer = {
  user_id: string;
  display_name: string;
  role: AppRole;
  access: LessonAccess;
};

export type LessonPayload = {
  lesson: Lesson;
  cards: LessonCard[];
  access: LessonAccess;
  viewer: LessonViewer;
  /** Druga strona lekcji — pokazywana w nagłówku zamiast surowego identyfikatora. */
  counterpart: LessonCounterpart;
  /** Stan eksportu na Drive dla oglądającego. */
  drive: DriveState;
};

/** Odpowiedź szybkiej ścieżki pollingu, gdy nic się nie zmieniło. */
export type LessonUnchanged = { unchanged: true };

export type LessonPollResult = LessonPayload | LessonUnchanged;

export function isUnchanged(result: LessonPollResult): result is LessonUnchanged {
  return (result as LessonUnchanged).unchanged === true;
}

/**
 * Pola fiszki, które klient może modyfikować. Serwer i tak dzieli je po roli:
 * nauczyciel zapisuje treść, uczeń wyłącznie `student_comment`.
 */
export type CardPatch = Partial<
  Omit<LessonCard, "id" | "lesson_id" | "author_id" | "created_at" | "updated_at">
>;

/** Pola lekcji, które klient może modyfikować. */
export type LessonPatch = Partial<
  Pick<
    Lesson,
    | "lesson_date"
    | "title"
    | "teacher_name"
    | "status"
    | "description"
    | "student_request"
    | "assigned_teacher_id"
    | "is_published"
  >
>;

export type NewCardInput = Pick<LessonCard, "card_type" | "review_direction" | "order_index"> &
  Partial<Omit<CardPatch, "card_type" | "review_direction" | "order_index" | "student_comment">>;

/** Nazwa lekcji-zestawu w bibliotece razem z licznikiem fiszek. */
export type LibraryEntry = Pick<
  Lesson,
  "id" | "title" | "description" | "teacher_name" | "card_count" | "lesson_date" | "updated_at"
>;

export type LessonExportV1 = {
  schemaVersion: 1;
  lesson: {
    id: string;
    date: string;
    title: string;
    teacher: string;
    exportedAt: string;
  };
  cards: Array<{
    id: string;
    type: CardType;
    english: string;
    polish: string;
    reviewDirection: ReviewDirection;
    phonetic: string;
    pronunciation: string;
    note: string;
    example: string;
    britishVariant: string;
    americanVariant: string;
  }>;
};

/**
 * Format eksportu jest kontraktem z importerem AnkiFiszki — nie zmieniamy go
 * bez podbicia `schemaVersion` po obu stronach.
 */
export function buildLessonExport(
  lesson: Lesson,
  cards: LessonCard[],
  now: Date = new Date(),
): LessonExportV1 {
  return {
    schemaVersion: 1,
    lesson: {
      id: lesson.id,
      date: lesson.lesson_date,
      title: lesson.title.trim(),
      teacher: lesson.teacher_name?.trim() ?? "",
      exportedAt: now.toISOString(),
    },
    cards: [...cards]
      .sort((a, b) => a.order_index - b.order_index || a.created_at.localeCompare(b.created_at))
      .filter((card) => card.english.trim() || card.polish.trim())
      .map((card) => ({
        id: card.id,
        type: card.card_type,
        english: card.english.trim(),
        polish: card.polish.trim(),
        reviewDirection: card.review_direction,
        phonetic: card.phonetic.trim(),
        pronunciation: card.pronunciation.trim(),
        note: noteWithComment(card),
        example: card.example.trim(),
        britishVariant: card.british_variant.trim(),
        americanVariant: card.american_variant.trim(),
      })),
  };
}

/**
 * Komentarz ucznia doklejamy do notatki zamiast dodawać pole do formatu.
 * `schemaVersion: 1` jest kontraktem z importerem AnkiFiszki v128 i nowy klucz
 * mógłby wysadzić parser po tamtej stronie; notatka przechodzi bez zmian w kodzie.
 */
function noteWithComment(card: LessonCard): string {
  const note = card.note.trim();
  const comment = card.student_comment.trim();
  if (!comment) return note;
  return note ? `${note}\n\nKomentarz ucznia: ${comment}` : `Komentarz ucznia: ${comment}`;
}

/** Nazwa pliku na Drive — stabilna dla danej lekcji, żeby eksport nadpisywał, a nie duplikował. */
export function lessonFileName(lesson: Pick<Lesson, "id" | "lesson_date">) {
  return `${lesson.lesson_date}_${lesson.id.slice(0, 8)}.json`;
}

/**
 * Znacznik stanu lekcji używany przez polling: najnowszy `updated_at`
 * w lekcji i fiszkach. Pozwala serwerowi odpowiedzieć `{ unchanged: true }`
 * zamiast przesyłać kilkaset fiszek co kilka sekund.
 */
export function lessonSyncStamp(payload: Pick<LessonPayload, "lesson" | "cards">): string {
  return payload.cards.reduce(
    (newest, card) => (card.updated_at > newest ? card.updated_at : newest),
    payload.lesson.updated_at,
  );
}
