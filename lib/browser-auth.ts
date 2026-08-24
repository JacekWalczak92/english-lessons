"use client";

import { getSupabaseBrowser } from "@/lib/supabase-browser";

/**
 * Nagłówek `Authorization` właściciela lekcji.
 * Nauczyciel wchodzący tajnym linkiem nie ma sesji — wtedy zwracamy pustkę,
 * a dostęp weryfikuje nagłówek `x-lesson-key` po stronie Edge Function.
 */
export async function authHeaders(): Promise<Record<string, string>> {
  try {
    const supabase = getSupabaseBrowser();
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}
