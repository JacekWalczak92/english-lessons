import type { CardType, LessonStatus, ReviewDirection } from "./domain.ts";

export type { CardType, LessonStatus, ReviewDirection };
export {
  CARD_TYPES,
  REVIEW_DIRECTIONS,
  LESSON_STATUSES,
  FIELD_LIMITS,
  defaultDirection,
  directionForTypeChange,
  isCardType,
} from "./domain.ts";

export type Lesson = {
  id: string;
  owner_id?: string;
  lesson_date: string;
  title: string;
  teacher_name: string | null;
  status: LessonStatus;
  share_enabled: boolean;
  share_token?: string;
  drive_file_id: string | null;
  drive_file_name: string | null;
  last_exported_at: string | null;
  created_at: string;
  updated_at: string;
};

export type LessonCard = {
  id: string;
  lesson_id: string;
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

export type LessonAccess = "owner" | "shared";

export type LessonPayload = {
  lesson: Lesson;
  cards: LessonCard[];
  access: LessonAccess;
};

/** Odpowiedź szybkiej ścieżki pollingu, gdy nic się nie zmieniło. */
export type LessonUnchanged = { unchanged: true };

export type LessonPollResult = LessonPayload | LessonUnchanged;

export function isUnchanged(result: LessonPollResult): result is LessonUnchanged {
  return (result as LessonUnchanged).unchanged === true;
}

/** Pola fiszki, które klient może modyfikować. */
export type CardPatch = Partial<Omit<LessonCard, "id" | "lesson_id" | "created_at" | "updated_at">>;

/** Pola lekcji, które klient może modyfikować. */
export type LessonPatch = Partial<
  Pick<
    Lesson,
    | "lesson_date"
    | "title"
    | "teacher_name"
    | "status"
    | "share_enabled"
    | "drive_file_id"
    | "drive_file_name"
    | "last_exported_at"
  >
> & { rotate_share_token?: true };

export type NewCardInput = Pick<LessonCard, "card_type" | "review_direction" | "order_index"> &
  Partial<Omit<CardPatch, "card_type" | "review_direction" | "order_index">>;

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
export function lessonSyncStamp(payload: LessonPayload): string {
  return payload.cards.reduce(
    (newest, card) => (card.updated_at > newest ? card.updated_at : newest),
    payload.lesson.updated_at,
  );
}
