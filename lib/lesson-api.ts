"use client";

import { authHeaders } from "@/lib/browser-auth";

function apiConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Brak konfiguracji Supabase");
  return {
    endpoint: `${url.replace(/\/$/, "")}/functions/v1/english-lesson-api`,
    key,
  };
}

export async function lessonApi<T>(options: {
  lessonId: string;
  cardId?: string;
  lessonKey?: string;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
}): Promise<T> {
  const { endpoint, key } = apiConfig();
  const url = new URL(endpoint);
  url.searchParams.set("lessonId", options.lessonId);
  if (options.cardId) url.searchParams.set("cardId", options.cardId);

  const headers: Record<string, string> = {
    apikey: key,
    "Content-Type": "application/json",
    ...(await authHeaders().catch(() => ({}))),
  };
  if (options.lessonKey) headers["x-lesson-key"] = options.lessonKey;

  const response = await fetch(url.toString(), {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: "no-store",
  });

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const parsed = await response.json();
      message = parsed?.error || message;
    } catch {}
    throw new Error(message);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
