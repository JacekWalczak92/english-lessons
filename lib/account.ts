"use client";

import { getSupabaseBrowser } from "@/lib/supabase-browser";
import type { LibraryEntry } from "@/lib/types";
import { isAppRole, normalizeJoinCode, type AppProfile, type AppRole, type Lesson } from "@/lib/types";

const LESSON_COLUMNS = "*";

/**
 * Profil roli. Wiersz zakłada trigger na `auth.users`, ale konta z v1.3.0
 * powstały przed jego istnieniem — dlatego przy braku wiersza zakładamy go
 * z poziomu przeglądarki (RLS pozwala tylko na własny `user_id`).
 */
export async function loadProfile(): Promise<AppProfile | null> {
  const supabase = getSupabaseBrowser();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;

  const { data, error } = await supabase
    .from("english_profiles")
    .select("user_id, role, display_name")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;

  if (data) {
    return {
      user_id: data.user_id,
      role: isAppRole(data.role) ? data.role : "student",
      display_name: data.display_name ?? "",
    };
  }

  const metaRole = (user.user_metadata?.app_role as string | undefined) ?? "student";
  const role: AppRole = isAppRole(metaRole) ? metaRole : "student";
  const displayName =
    (user.user_metadata?.display_name as string | undefined) ?? user.email?.split("@")[0] ?? "";

  const { data: created, error: insertError } = await supabase
    .from("english_profiles")
    .insert({ user_id: user.id, role, display_name: displayName })
    .select("user_id, role, display_name")
    .single();
  if (insertError) throw insertError;

  return {
    user_id: created.user_id,
    role: isAppRole(created.role) ? created.role : "student",
    display_name: created.display_name ?? "",
  };
}

export async function updateProfile(patch: { role?: AppRole; display_name?: string }) {
  const supabase = getSupabaseBrowser();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("Sesja wygasła — zaloguj się ponownie.");
  const { error } = await supabase
    .from("english_profiles")
    .update(patch)
    .eq("user_id", userData.user.id);
  if (error) throw error;
}

/** Lekcje i zestawy, których jestem właścicielem. */
export async function listOwnedLessons(): Promise<Lesson[]> {
  const supabase = getSupabaseBrowser();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return [];
  const { data, error } = await supabase
    .from("english_lessons")
    .select(LESSON_COLUMNS)
    .eq("owner_id", userData.user.id)
    .order("lesson_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Lesson[];
}

/** Lekcje, do których dołączyłem kodem. */
export async function listJoinedLessons(): Promise<Lesson[]> {
  const supabase = getSupabaseBrowser();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return [];
  const { data, error } = await supabase
    .from("english_lesson_members")
    .select("lesson_id, joined_at, english_lessons(*)")
    .eq("user_id", userData.user.id)
    .order("joined_at", { ascending: false });
  if (error) throw error;

  type Joined = { english_lessons: Lesson | Lesson[] | null };
  return ((data ?? []) as unknown as Joined[])
    .map((row) => (Array.isArray(row.english_lessons) ? row.english_lessons[0] : row.english_lessons))
    .filter((lesson): lesson is Lesson => !!lesson);
}

/** Gotowe zestawy opublikowane przez nauczycieli. */
export async function listLibrary(): Promise<LibraryEntry[]> {
  const supabase = getSupabaseBrowser();
  const { data, error } = await supabase
    .from("english_lessons")
    .select("id, title, description, teacher_name, card_count, lesson_date, updated_at")
    .eq("lesson_kind", "set")
    .eq("is_published", true)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as LibraryEntry[];
}

export async function createLesson(options: {
  title: string;
  lessonDate: string;
  kind: "lesson" | "set";
  teacherName?: string | null;
}): Promise<string> {
  const supabase = getSupabaseBrowser();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("Sesja wygasła — zaloguj się ponownie.");
  const { data, error } = await supabase
    .from("english_lessons")
    .insert({
      owner_id: userData.user.id,
      lesson_date: options.lessonDate,
      title: options.title,
      lesson_kind: options.kind,
      teacher_name: options.teacherName ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function deleteLesson(lessonId: string) {
  const { error } = await getSupabaseBrowser()
    .from("english_lessons")
    .delete()
    .eq("id", lessonId);
  if (error) throw error;
}

/** Wypisanie się z lekcji. Fiszki zostają u nauczyciela — usuwamy tylko dostęp. */
export async function leaveLesson(lessonId: string) {
  const supabase = getSupabaseBrowser();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("Sesja wygasła — zaloguj się ponownie.");
  const { error } = await supabase
    .from("english_lesson_members")
    .delete()
    .eq("lesson_id", lessonId)
    .eq("user_id", userData.user.id);
  if (error) throw error;
}

export type JoinResult = {
  lesson_id: string;
  title: string;
  teacher_name: string | null;
  already_member: boolean;
};

/**
 * Dołączenie kodem. Kod jest zaproszeniem, więc zapisu dokonuje funkcja
 * `security definer` w bazie — uczeń nie widzi lekcji, zanim do niej nie wejdzie.
 */
export async function joinLessonByCode(rawCode: string): Promise<JoinResult> {
  const code = normalizeJoinCode(rawCode);
  if (code.length < 4) throw new Error("Kod jest za krótki.");
  const { data, error } = await getSupabaseBrowser().rpc("english_join_lesson", { p_code: code });
  if (error) throw new Error(error.message);
  const result = (data ?? [])[0];
  if (!result) throw new Error("Nie ma lekcji o tym kodzie.");
  return result;
}

/** Kopia gotowego zestawu na własne konto — z prawem do edycji i eksportu. */
export async function copyLessonToMyAccount(sourceId: string, title?: string): Promise<string> {
  const { data, error } = await getSupabaseBrowser().rpc("english_copy_lesson", {
    p_source: sourceId,
    p_title: title ?? null,
  });
  if (error) throw new Error(error.message);
  return data as string;
}
