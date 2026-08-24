"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export const MISSING_CONFIG_MESSAGE =
  "Brak konfiguracji Supabase. Uzupełnij NEXT_PUBLIC_SUPABASE_URL i NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY w .env.local (lokalnie) albo w GitHub Actions Variables (produkcja).";

export type PublicConfig = {
  supabaseUrl: string;
  supabaseKey: string;
  googleClientId: string | null;
};

/**
 * Konfiguracja publiczna czytana z NEXT_PUBLIC_* w czasie builda.
 * Zwraca `null` zamiast rzucać — dzięki temu ekran logowania potrafi pokazać
 * czytelny komunikat zamiast pustej strony po wyjątku w `useEffect`.
 */
export function readPublicConfig(): PublicConfig | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey) return null;
  return {
    supabaseUrl: supabaseUrl.replace(/\/$/, ""),
    supabaseKey,
    googleClientId: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || null,
  };
}

let client: SupabaseClient<Database> | null = null;

export function getSupabaseBrowser(): SupabaseClient<Database> {
  if (client) return client;
  const config = readPublicConfig();
  if (!config) throw new Error(MISSING_CONFIG_MESSAGE);
  client = createClient<Database>(config.supabaseUrl, config.supabaseKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return client;
}
