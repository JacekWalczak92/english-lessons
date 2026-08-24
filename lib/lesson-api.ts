"use client";

import { authHeaders } from "@/lib/browser-auth";
import { MISSING_CONFIG_MESSAGE, readPublicConfig } from "@/lib/supabase-browser";
import type {
  CardPatch,
  LessonCard,
  LessonPatch,
  LessonPayload,
  LessonPollResult,
  NewCardInput,
} from "@/lib/types";

/** Błąd HTTP z zachowanym kodem — pozwala odróżnić 401 od chwilowej awarii sieci. */
export class LessonApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "LessonApiError";
  }

  /** Ponawianie ma sens tylko przy błędach przejściowych. */
  get retryable() {
    return this.status === 0 || this.status === 408 || this.status === 429 || this.status >= 500;
  }
}

type RequestOptions = {
  lessonId: string;
  lessonKey?: string;
  cardId?: string;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  query?: Record<string, string>;
  body?: unknown;
  signal?: AbortSignal;
};

async function request<T>(options: RequestOptions): Promise<T> {
  const config = readPublicConfig();
  if (!config) throw new LessonApiError(0, MISSING_CONFIG_MESSAGE);

  const url = new URL(`${config.supabaseUrl}/functions/v1/english-lesson-api`);
  url.searchParams.set("lessonId", options.lessonId);
  if (options.cardId) url.searchParams.set("cardId", options.cardId);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value) url.searchParams.set(key, value);
  }

  const headers: Record<string, string> = {
    apikey: config.supabaseKey,
    "Content-Type": "application/json",
    ...(await authHeaders()),
  };
  if (options.lessonKey) headers["x-lesson-key"] = options.lessonKey;

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: "no-store",
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new LessonApiError(0, "Brak połączenia z serwerem. Zmiany czekają w kolejce.");
  }

  if (!response.ok) {
    let message = `Błąd serwera (HTTP ${response.status})`;
    try {
      const parsed = (await response.json()) as { error?: string };
      if (parsed?.error) message = parsed.error;
    } catch {
      // Odpowiedź bez JSON-a — zostawiamy komunikat domyślny.
    }
    throw new LessonApiError(response.status, message);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export type LessonScope = { lessonId: string; lessonKey?: string };

export const lessonApi = {
  /**
   * Pobiera lekcję. Gdy podamy `since` i `count`, serwer może odpowiedzieć
   * `{ unchanged: true }` — polling nie ściąga wtedy setek fiszek co kilka sekund.
   */
  get(
    scope: LessonScope,
    options: { since?: string; count?: number; signal?: AbortSignal } = {},
  ): Promise<LessonPollResult> {
    return request<LessonPollResult>({
      ...scope,
      query: {
        ...(options.since ? { since: options.since } : {}),
        ...(options.count === undefined ? {} : { count: String(options.count) }),
      },
      signal: options.signal,
    });
  },

  patchLesson(scope: LessonScope, patch: LessonPatch) {
    return request<{ lesson: LessonPayload["lesson"] }>({ ...scope, method: "PATCH", body: patch });
  },

  createCard(scope: LessonScope, card: NewCardInput) {
    return request<{ card: LessonCard }>({ ...scope, method: "POST", body: card });
  },

  createCards(scope: LessonScope, cards: NewCardInput[]) {
    return request<{ cards: LessonCard[] }>({ ...scope, method: "POST", body: { cards } });
  },

  patchCard(scope: LessonScope, cardId: string, patch: CardPatch) {
    return request<{ card: LessonCard }>({ ...scope, cardId, method: "PATCH", body: patch });
  },

  deleteCard(scope: LessonScope, cardId: string) {
    return request<void>({ ...scope, cardId, method: "DELETE" });
  },
};
