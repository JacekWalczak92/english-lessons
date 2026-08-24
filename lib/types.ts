export const CARD_TYPES = [
  "translation_sentence",
  "word_phrase",
  "pronunciation",
  "british",
  "custom",
] as const;

export type CardType = (typeof CARD_TYPES)[number];
export type ReviewDirection = "EN_TO_PL" | "PL_TO_EN" | "PRONUNCIATION";
export type LessonStatus = "draft" | "finished";

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

export type LessonPayload = {
  lesson: Lesson;
  cards: LessonCard[];
  access: "owner" | "shared";
};

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

export function buildLessonExport(lesson: Lesson, cards: LessonCard[]): LessonExportV1 {
  const exportedAt = new Date().toISOString();
  return {
    schemaVersion: 1,
    lesson: {
      id: lesson.id,
      date: lesson.lesson_date,
      title: lesson.title,
      teacher: lesson.teacher_name ?? "",
      exportedAt,
    },
    cards: [...cards]
      .sort((a, b) => a.order_index - b.order_index)
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

export function lessonFileName(lesson: Lesson) {
  return `${lesson.lesson_date}_${lesson.id.slice(0, 8)}.json`;
}

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
