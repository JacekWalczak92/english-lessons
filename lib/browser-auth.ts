"use client";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

export async function authHeaders(): Promise<Record<string, string>> {
  const supabase = getSupabaseBrowser();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}
