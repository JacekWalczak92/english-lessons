import type { AppRole, LessonCard, LessonKind, LessonStatus } from "./types.ts";

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
  lesson_kind: LessonKind;
  description: string;
  assigned_teacher_id: string | null;
  assigned_at: string | null;
  student_request: string;
  is_published: boolean;
  card_count: number;
  source_lesson_id: string | null;
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
  lesson_kind?: LessonKind;
  description?: string;
  assigned_teacher_id?: string | null;
  student_request?: string;
  is_published?: boolean;
};

export type LessonUpdate = Partial<Omit<LessonRow, "id" | "owner_id" | "created_at">>;

export type CardRow = LessonCard;
export type CardInsert = Omit<LessonCard, "id" | "created_at" | "updated_at"> & { id?: string };
export type CardUpdate = Partial<Omit<LessonCard, "id" | "lesson_id" | "created_at">>;

export type ProfileRow = {
  user_id: string;
  role: AppRole;
  display_name: string;
  accepting_students: boolean;
  created_at: string;
  updated_at: string;
};

export type ProfileInsert = {
  user_id: string;
  role?: AppRole;
  display_name?: string;
  accepting_students?: boolean;
};

export type ProfileUpdate = Partial<
  Pick<ProfileRow, "display_name" | "accepting_students">
>;

export type ExportRow = {
  lesson_id: string;
  user_id: string;
  drive_file_id: string | null;
  drive_file_name: string | null;
  last_exported_at: string | null;
  updated_at: string;
};

export type ExportInsert = Omit<ExportRow, "updated_at"> & { updated_at?: string };
export type ExportUpdate = Partial<Omit<ExportRow, "lesson_id" | "user_id">>;

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
      english_profiles: {
        Row: ProfileRow;
        Insert: ProfileInsert;
        Update: ProfileUpdate;
        Relationships: [];
      };
      english_lesson_exports: {
        Row: ExportRow;
        Insert: ExportInsert;
        Update: ExportUpdate;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      english_copy_lesson: {
        Args: { p_source: string; p_title?: string | null };
        Returns: string;
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
};
