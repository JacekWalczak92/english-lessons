import type { LessonCard, LessonStatus } from "./types.ts";

/**
 * Minimalny opis schematu dla `createClient<Database>`.
 *
 * W v1.2.0 klient był nietypowany, więc `data` z każdego zapytania było `any`
 * i literówka w nazwie kolumny przechodziła przez `tsc` bez słowa.
 */
export type LessonRow = {
  id: string;
  owner_id: string;
  lesson_date: string;
  title: string;
  teacher_name: string | null;
  status: LessonStatus;
  share_enabled: boolean;
  share_token: string;
  drive_file_id: string | null;
  drive_file_name: string | null;
  last_exported_at: string | null;
  created_at: string;
  updated_at: string;
};

export type LessonInsert = {
  id?: string;
  owner_id: string;
  lesson_date?: string;
  title?: string;
  teacher_name?: string | null;
  status?: LessonStatus;
  share_enabled?: boolean;
};

export type LessonUpdate = Partial<Omit<LessonRow, "id" | "owner_id" | "created_at">>;

export type CardRow = LessonCard;
export type CardInsert = Omit<LessonCard, "id" | "created_at" | "updated_at"> & { id?: string };
export type CardUpdate = Partial<Omit<LessonCard, "id" | "lesson_id" | "created_at">>;

export type Database = {
  public: {
    Tables: {
      english_lessons: {
        Row: LessonRow;
        Insert: LessonInsert;
        Update: LessonUpdate;
        Relationships: [];
      };
      english_lesson_cards: {
        Row: CardRow;
        Insert: CardInsert;
        Update: CardUpdate;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
