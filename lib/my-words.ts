"use client";

import type { MyWordInsert, MyWordRow } from "@/lib/database.types";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import type { ImportedWord } from "@/lib/word-export-format";

export type MyWord = MyWordRow;

/** Paczka jednego zapisu — PostgREST znosi więcej, ale tak błąd nie kasuje całego importu. */
const INSERT_CHUNK = 500;

/** Klucz w localStorage na import, który przyszedł przed zalogowaniem. */
export const PENDING_IMPORT_KEY = "jlearner.pendingWordImport";

async function currentUserId(): Promise<string> {
  const { data } = await getSupabaseBrowser().auth.getUser();
  if (!data.user) throw new Error("Sesja wygasła — zaloguj się ponownie.");
  return data.user.id;
}

export async function listMyWords(): Promise<MyWord[]> {
  const userId = await currentUserId();
  const { data, error } = await getSupabaseBrowser()
    .from("english_my_words")
    .select("*")
    .eq("user_id", userId)
    .order("looked_up_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(20000);
  if (error) throw error;
  return (data ?? []) as MyWord[];
}

/**
 * Zapis importu. Słówko, które już jest na koncie (ten sam angielski tekst),
 * zostaje nietknięte — `ignoreDuplicates` opiera się na unikalnym indeksie
 * `(user_id, dedupe_key)` w bazie.
 */
export async function saveImportedWords(words: ImportedWord[]): Promise<number> {
  const userId = await currentUserId();
  const supabase = getSupabaseBrowser();
  let added = 0;
  for (let start = 0; start < words.length; start += INSERT_CHUNK) {
    const rows: MyWordInsert[] = words.slice(start, start + INSERT_CHUNK).map((word) => ({
      user_id: userId,
      english: word.english,
      polish: word.polish,
      source_lang: word.sourceLang,
      kind: word.kind,
      favorite: word.favorite,
      looked_up_at: word.lookedUpAt,
      source: "slownik-app",
      external_id: word.externalId,
    }));
    const { data, error } = await supabase
      .from("english_my_words")
      .upsert(rows, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true })
      .select("id");
    if (error) throw error;
    added += data?.length ?? 0;
  }
  return added;
}

export async function deleteMyWords(ids: string[]) {
  if (ids.length === 0) return;
  const { error } = await getSupabaseBrowser().from("english_my_words").delete().in("id", ids);
  if (error) throw error;
}

export async function setFavorite(id: string, favorite: boolean) {
  const { error } = await getSupabaseBrowser()
    .from("english_my_words")
    .update({ favorite })
    .eq("id", id);
  if (error) throw error;
}

export function readPendingImport(): string | null {
  try {
    return window.localStorage.getItem(PENDING_IMPORT_KEY);
  } catch {
    return null;
  }
}

export function storePendingImport(payload: string) {
  try {
    window.localStorage.setItem(PENDING_IMPORT_KEY, payload);
  } catch {
    // Bez localStorage import po zalogowaniu po prostu nie wróci — użytkownik wyśle go jeszcze raz.
  }
}

export function clearPendingImport() {
  try {
    window.localStorage.removeItem(PENDING_IMPORT_KEY);
  } catch {
    // jw.
  }
}
