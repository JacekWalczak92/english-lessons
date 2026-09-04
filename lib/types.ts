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
  JOIN_CODE_ALPHABET,
  JOIN_CODE_LENGTH,
  LESSON_KINDS,
  LESSON_STATUSES,
  REVIEW_DIRECTIONS,
  canAddCards,
  canEditCard,
  canEditLessonMeta,
  canManageAccess,
  defaultDirection,
  directionForTypeChange,
  formatJoinCode,
  isAppRole,
  isCardType,
  isCardVisible,
  isLessonCard,
  normalizeJoinCode,
} from "./domain.ts";
export type { CardAccessContext } from "./domain.ts";

export type Lesson = {
  id: string;
  owner_id?: string;
  lesson_date: string;
  title: string;
  teacher_name: string | null;
  status: LessonStatus;
  lesson_kind: LessonKind;
  description: string;
  share_enabled: boolean;
  share_token?: string;
  /** Kod dołączenia widzi tylko właściciel — uczeń dostaje go od nauczyciela. */
  join_code?: string;
  join_enabled: boolean;
  /** Zestaw opublikowany w bibliotece jest widoczny dla wszystkich uczniów. */
  is_published: boolean;
  /** Czy uczniowie widzą nawzajem swoje fiszki. */
  peer_visibility: boolean;
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
};

export type LessonMember = {
  lesson_id: string;
  user_id: string;
  member_role: AppRole;
  display_name: string;
  joined_at: string;
  /** Liczba fiszek dodanych przez tego ucznia — dla panelu nauczyciela. */
  card_count: number;
};

/** Stan eksportu na Drive jest per konto: nauczyciel i każdy uczeń mają własny plik. */
export type DriveState = {
  drive_file_id: string | null;
  drive_file_name: string | null;
  last_exported_at: string | null;
};

export type LessonCard = {
  id: string;
  lesson_id: string;
  /** `null` = fiszka lekcyjna dodana tajnym linkiem nauczyciela. */
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
  order_index: number;
  created_at: string;
  updated_at: string;
};

export type LessonAccess = AccessMode;

export type LessonViewer = {
  user_id: string | null;
  display_name: string;
  access: LessonAccess;
};

export type LessonPayload = {
  lesson: Lesson;
  cards: LessonCard[];
  access: LessonAccess;
  /** Id właściciela lekcji — po nim rozpoznajemy fiszki „od nauczyciela”. */
  teacher_id: string;
  viewer: LessonViewer;
  /** Mapa `user_id -> nazwa`, żeby pokazać autora fiszki bez pytania o profile. */
  authors: Record<string, string>;
  /** Lista uczniów — wypełniana tylko dla właściciela lekcji. */
  members: LessonMember[];
  /** Stan eksportu na Drive dla oglądającego (właściciela albo ucznia). */
  drive: DriveState;
};

/** Odpowiedź szybkiej ścieżki pollingu, gdy nic się nie zmieniło. */
export type LessonUnchanged = { unchanged: true };

export type LessonPollResult = LessonPayload | LessonUnchanged;

export function isUnchanged(result: LessonPollResult): result is LessonUnchanged {
  return (result as LessonUnchanged).unchanged === true;
}

/** Pola fiszki, które klient może modyfikować. Autor jest ustalany po stronie serwera. */
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
    | "share_enabled"
    | "join_enabled"
    | "is_published"
    | "peer_visibility"
  >
> & { rotate_share_token?: true; rotate_join_code?: true };

export type NewCardInput = Pick<LessonCard, "card_type" | "review_direction" | "order_index"> &
  Partial<Omit<CardPatch, "card_type" | "review_direction" | "order_index">>;

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
        note: card.note.trim(),
        example: card.example.trim(),
        britishVariant: card.british_variant.trim(),
        americanVariant: card.american_variant.trim(),
      })),
  };
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
