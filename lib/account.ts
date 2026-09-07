"use client";

import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { isAppRole } from "@/lib/types";
import type {
  AppProfile,
  AppRole,
  Lesson,
  LibraryEntry,
  TeacherDirectoryEntry,
} from "@/lib/types";

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
    .select("user_id, role, display_name, accepting_students")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;

  if (data) {
    return {
      user_id: data.user_id,
      role: isAppRole(data.role) ? data.role : "student",
      display_name: data.display_name ?? "",
      accepting_students: data.accepting_students ?? true,
    };
  }

  const metaRole = (user.user_metadata?.app_role as string | undefined) ?? "student";
  const role: AppRole = isAppRole(metaRole) ? metaRole : "student";
  const displayName =
    (user.user_metadata?.display_name as string | undefined) ?? user.email?.split("@")[0] ?? "";

  const { data: created, error: insertError } = await supabase
    .from("english_profiles")
    .insert({ user_id: user.id, role, display_name: displayName })
    .select("user_id, role, display_name, accepting_students")
    .single();
  if (insertError) throw insertError;

  return {
    user_id: created.user_id,
    role: isAppRole(created.role) ? created.role : "student",
    display_name: created.display_name ?? "",
    accepting_students: created.accepting_students ?? true,
  };
}

/**
 * Zmienić da się imię i gotowość przyjmowania uczniów. Rola jest przypisana
 * do konta na stałe — pilnuje tego również wyzwalacz w bazie.
 */
export async function updateProfileSettings(patch: {
  display_name?: string;
  accepting_students?: boolean;
}) {
  const supabase = getSupabaseBrowser();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("Sesja wygasła — zaloguj się ponownie.");
  const { error } = await supabase
    .from("english_profiles")
    .update({
      ...(patch.display_name === undefined
        ? {}
        : { display_name: patch.display_name.trim().slice(0, 80) }),
      ...(patch.accepting_students === undefined
        ? {}
        : { accepting_students: patch.accepting_students }),
    })
    .eq("user_id", userData.user.id);
  if (error) throw error;
}

/** Katalog nauczycieli — z niego uczeń wybiera prowadzącego lekcję. */
export async function listTeachers(): Promise<TeacherDirectoryEntry[]> {
  const { data, error } = await getSupabaseBrowser()
    .from("english_profiles")
    .select("user_id, display_name, accepting_students")
    .eq("role", "teacher")
    .order("display_name", { ascending: true })
    .limit(200);
  if (error) throw error;
  return (data ?? []) as TeacherDirectoryEntry[];
}

/** Lekcje i zestawy, których jestem właścicielem. */
export async function listOwnedLessons(): Promise<Lesson[]> {
  const supabase = getSupabaseBrowser();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return [];
  const { data, error } = await supabase
    .from("english_lessons")
    .select("*")
    .eq("owner_id", userData.user.id)
    .order("lesson_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Lesson[];
}

/** Lekcje, które uczniowie przypisali mnie jako nauczycielowi. */
export async function listAssignedLessons(): Promise<Lesson[]> {
  const supabase = getSupabaseBrowser();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return [];
  const { data, error } = await supabase
    .from("english_lessons")
    .select("*")
    .eq("assigned_teacher_id", userData.user.id)
    .order("lesson_date", { ascending: false })
    .order("assigned_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Lesson[];
}

/**
 * Imiona kont powiązanych z lekcjami (nauczyciel ucznia, uczeń nauczyciela).
 * RLS wpuszcza tu tylko profile nauczycieli i osób, z którymi dzielę lekcję.
 */
export async function loadDisplayNames(userIds: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return {};
  const { data, error } = await getSupabaseBrowser()
    .from("english_profiles")
    .select("user_id, display_name")
    .in("user_id", unique);
  if (error) throw error;
  return Object.fromEntries(
    ((data ?? []) as Array<{ user_id: string; display_name: string }>).map((row) => [
      row.user_id,
      row.display_name,
    ]),
  );
}

/** Gotowe zestawy opublikowane przez nauczycieli. */
export async function listLibrary(): Promise<LibraryEntry[]> {
  const { data, error } = await getSupabaseBrowser()
    .from("english_lessons")
    .select("id, title, description, teacher_name, card_count, lesson_date, updated_at")
    .eq("lesson_kind", "set")
    .eq("is_published", true)
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as LibraryEntry[];
}

/**
 * Nowa lekcja. Uczeń zawsze wskazuje nauczyciela z katalogu — to zastąpiło
 * kody dołączenia. Nauczyciel zakłada lekcję albo zestaw bez przypisania.
 */
export async function createLesson(options: {
  title: string;
  lessonDate: string;
  kind: "lesson" | "set";
  teacherId?: string | null;
  teacherName?: string | null;
  studentRequest?: string;
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
      assigned_teacher_id: options.teacherId ?? null,
      teacher_name: options.teacherName ?? null,
      student_request: options.studentRequest?.trim() ?? "",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function deleteLesson(lessonId: string) {
  const { error } = await getSupabaseBrowser().from("english_lessons").delete().eq("id", lessonId);
  if (error) throw error;
}

/** Kopia gotowego zestawu na własne konto — bez przypisanego nauczyciela. */
export async function copyLessonToMyAccount(sourceId: string, title?: string): Promise<string> {
  const { data, error } = await getSupabaseBrowser().rpc("english_copy_lesson", {
    p_source: sourceId,
    p_title: title ?? null,
  });
  if (error) throw new Error(error.message);
  return data as string;
}
