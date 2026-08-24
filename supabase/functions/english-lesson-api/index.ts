import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@4";
import {
  CARD_TYPES,
  FIELD_LIMITS,
  LESSON_STATUSES,
  REVIEW_DIRECTIONS,
} from "../_shared/domain.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Lista dozwolonych originów. Domyślnie `*` (jak w v1.2.0), ale wystarczy
 * ustawić sekret ALLOWED_ORIGINS="https://login.github.io", żeby zawęzić CORS
 * do własnej strony.
 */
const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin") ?? "";
  const allowOrigin =
    allowedOrigins.length === 0 ? "*" : allowedOrigins.includes(origin) ? origin : "null";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-lesson-key",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
}

// --------------------------------------------------------------------- schematy

const cardTypeSchema = z.enum(CARD_TYPES);
const directionSchema = z.enum(REVIEW_DIRECTIONS);

const lessonPatchSchema = z
  .object({
    lesson_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    title: z.string().trim().min(1).max(FIELD_LIMITS.title).optional(),
    teacher_name: z.string().trim().max(FIELD_LIMITS.teacher_name).nullable().optional(),
    status: z.enum(LESSON_STATUSES).optional(),
    share_enabled: z.boolean().optional(),
    drive_file_id: z.string().max(200).nullable().optional(),
    drive_file_name: z.string().max(300).nullable().optional(),
    last_exported_at: z.string().datetime().nullable().optional(),
    /** Unieważnia dotychczasowy tajny link i wystawia nowy. Tylko właściciel. */
    rotate_share_token: z.literal(true).optional(),
  })
  .strict();

const cardFieldsSchema = {
  english: z.string().max(FIELD_LIMITS.english),
  polish: z.string().max(FIELD_LIMITS.polish),
  phonetic: z.string().max(FIELD_LIMITS.phonetic),
  pronunciation: z.string().max(FIELD_LIMITS.pronunciation),
  note: z.string().max(FIELD_LIMITS.note),
  example: z.string().max(FIELD_LIMITS.example),
  british_variant: z.string().max(FIELD_LIMITS.british_variant),
  american_variant: z.string().max(FIELD_LIMITS.american_variant),
};

const orderIndexSchema = z.number().int().min(0).max(FIELD_LIMITS.order_index);

const cardCreateSchema = z
  .object({
    card_type: cardTypeSchema,
    review_direction: directionSchema,
    order_index: orderIndexSchema,
  })
  .strict();

const cardImportItemSchema = z
  .object({
    card_type: cardTypeSchema,
    review_direction: directionSchema,
    order_index: orderIndexSchema,
    english: cardFieldsSchema.english,
    polish: cardFieldsSchema.polish,
    phonetic: cardFieldsSchema.phonetic.default(""),
    pronunciation: cardFieldsSchema.pronunciation.default(""),
    note: cardFieldsSchema.note.default(""),
    example: cardFieldsSchema.example.default(""),
    british_variant: cardFieldsSchema.british_variant.default(""),
    american_variant: cardFieldsSchema.american_variant.default(""),
  })
  .strict();

const cardBatchCreateSchema = z
  .object({ cards: z.array(cardImportItemSchema).min(1).max(FIELD_LIMITS.import_batch) })
  .strict();

type CardImportItem = z.infer<typeof cardImportItemSchema>;

const cardPatchSchema = z
  .object({
    card_type: cardTypeSchema.optional(),
    review_direction: directionSchema.optional(),
    order_index: orderIndexSchema.optional(),
    english: cardFieldsSchema.english.optional(),
    polish: cardFieldsSchema.polish.optional(),
    phonetic: cardFieldsSchema.phonetic.optional(),
    pronunciation: cardFieldsSchema.pronunciation.optional(),
    note: cardFieldsSchema.note.optional(),
    example: cardFieldsSchema.example.optional(),
    british_variant: cardFieldsSchema.british_variant.optional(),
    american_variant: cardFieldsSchema.american_variant.optional(),
  })
  .strict();

// ------------------------------------------------------------------- narzędzia

type AccessMode = "owner" | "shared";
type LessonRow = {
  id: string;
  owner_id: string;
  share_enabled: boolean;
  share_token: string;
  status: "draft" | "finished";
  updated_at: string;
  [key: string]: unknown;
};

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Rozpoznaje błąd walidacji po kształcie, a nie przez `instanceof z.ZodError`.
 * Gdy w grafie zależności wyląduje druga kopia zoda, `instanceof` przestaje
 * działać i błąd walidacji zwróciłby 500 zamiast 400 z listą problemów.
 */
function zodIssuesOf(error: unknown): unknown[] | null {
  if (!error || typeof error !== "object") return null;
  const candidate = error as { name?: unknown; issues?: unknown };
  if (candidate.name !== "ZodError" || !Array.isArray(candidate.issues)) return null;
  return candidate.issues;
}

function json(request: Request, data: unknown, status = 200) {
  return Response.json(data, { status, headers: corsHeaders(request) });
}

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** 32 losowe bajty w hexie — ten sam format co domyślna wartość kolumny w SQL. */
function newShareToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function adminClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRole) throw new Error("Brak SUPABASE_URL lub SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function resolveAccess(request: Request, lessonId: string) {
  const admin = adminClient();
  const { data: lesson, error } = await admin
    .from("english_lessons")
    .select("*")
    .eq("id", lessonId)
    .maybeSingle();

  if (error) throw error;
  if (!lesson) throw new HttpError(404, "Nie znaleziono lekcji");
  const row = lesson as LessonRow;

  const shareKey = request.headers.get("x-lesson-key") ?? "";
  if (
    row.share_enabled &&
    shareKey &&
    row.share_token &&
    constantTimeEqual(shareKey, row.share_token)
  ) {
    return { admin, lesson: row, mode: "shared" as AccessMode };
  }

  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (token) {
    const { data } = await admin.auth.getUser(token);
    if (data.user?.id === row.owner_id) {
      return { admin, lesson: row, mode: "owner" as AccessMode };
    }
  }

  throw new HttpError(401, "Brak dostępu do tej lekcji");
}

function assertCanEdit(mode: AccessMode, lesson: LessonRow) {
  if (mode === "shared" && lesson.status === "finished") {
    throw new HttpError(423, "Lekcja jest zakończona. Właściciel może ją ponownie otworzyć.");
  }
}

function publicLesson(lesson: LessonRow, mode: AccessMode) {
  if (mode === "owner") return lesson;
  const { owner_id: _ownerId, share_token: _shareToken, ...safe } = lesson;
  return safe;
}

async function parseBody(request: Request) {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "Nieprawidłowy JSON");
  }
}

function notNewer(value: string | null | undefined, since: number) {
  if (!value) return true;
  const time = Date.parse(value);
  return Number.isFinite(time) && time <= since;
}

/**
 * Szybka ścieżka pollingu.
 *
 * Klient podaje najnowszy znany `updated_at` i liczbę fiszek. Jeśli nic się nie
 * zmieniło, odpowiadamy `{ unchanged: true }` zamiast wysyłać całą lekcję.
 * Przy lekcji z 300 fiszkami i odpytywaniu co kilka sekund to różnica między
 * kilkuset kilobajtami a kilkudziesięcioma bajtami na cykl.
 */
async function isUnchangedSince(
  admin: SupabaseClient,
  lesson: LessonRow,
  lessonId: string,
  since: string,
  expectedCount: number,
) {
  const sinceTime = Date.parse(since);
  if (!Number.isFinite(sinceTime)) return false;
  if (!notNewer(lesson.updated_at, sinceTime)) return false;

  const { count, error: countError } = await admin
    .from("english_lesson_cards")
    .select("id", { count: "exact", head: true })
    .eq("lesson_id", lessonId);
  if (countError) throw countError;
  if (count !== expectedCount) return false;

  const { data: newest, error: newestError } = await admin
    .from("english_lesson_cards")
    .select("updated_at")
    .eq("lesson_id", lessonId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (newestError) throw newestError;

  return notNewer(newest?.updated_at as string | undefined, sinceTime);
}

// ---------------------------------------------------------------------- router

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });

  try {
    const url = new URL(request.url);
    const lessonId = url.searchParams.get("lessonId") ?? "";
    const cardId = url.searchParams.get("cardId") ?? "";
    if (!lessonId) throw new HttpError(400, "Brak lessonId");
    if (!UUID_RE.test(lessonId)) throw new HttpError(400, "Nieprawidłowy identyfikator lekcji");
    if (cardId && !UUID_RE.test(cardId)) throw new HttpError(400, "Nieprawidłowy identyfikator fiszki");

    const { admin, lesson, mode } = await resolveAccess(request, lessonId);

    if (request.method === "GET" && !cardId) {
      const since = url.searchParams.get("since");
      const countParam = url.searchParams.get("count");
      if (since && countParam !== null && /^\d+$/.test(countParam)) {
        if (await isUnchangedSince(admin, lesson, lessonId, since, Number(countParam))) {
          return json(request, { unchanged: true });
        }
      }

      const { data: cards, error } = await admin
        .from("english_lesson_cards")
        .select("*")
        .eq("lesson_id", lessonId)
        .order("order_index", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return json(request, { lesson: publicLesson(lesson, mode), cards: cards ?? [], access: mode });
    }

    if (request.method === "PATCH" && !cardId) {
      assertCanEdit(mode, lesson);
      const body = lessonPatchSchema.parse(await parseBody(request));

      if (mode === "shared") {
        // Nauczyciel może poprawiać treść lekcji, ale nie zarządza udostępnianiem
        // ani stanem eksportu na Drive właściciela.
        delete body.share_enabled;
        delete body.drive_file_id;
        delete body.drive_file_name;
        delete body.last_exported_at;
        delete body.rotate_share_token;
        if (body.status === "draft") delete body.status;
      }

      const { rotate_share_token: rotate, ...patch } = body;
      const update: Record<string, unknown> = { ...patch };
      if (rotate) update.share_token = newShareToken();

      if (Object.keys(update).length === 0) {
        return json(request, { lesson: publicLesson(lesson, mode) });
      }

      const { data, error } = await admin
        .from("english_lessons")
        .update(update)
        .eq("id", lessonId)
        .select("*")
        .single();
      if (error) throw error;
      return json(request, { lesson: publicLesson(data as LessonRow, mode) });
    }

    if (request.method === "POST" && !cardId) {
      assertCanEdit(mode, lesson);
      const rawBody = await parseBody(request);

      // Rozróżniamy paczkę od pojedynczej fiszki po kształcie żądania.
      // W v1.2.0 nieudany `safeParse` paczki cicho spadał do schematu
      // pojedynczej fiszki i użytkownik dostawał komunikat o polu `cards`
      // zamiast informacji, który wiersz importu jest zły.
      if (rawBody && typeof rawBody === "object" && "cards" in rawBody) {
        const batch = cardBatchCreateSchema.parse(rawBody);
        const rows = batch.cards.map((card: CardImportItem) => ({ lesson_id: lessonId, ...card }));
        const { data, error } = await admin.from("english_lesson_cards").insert(rows).select("*");
        if (error) throw error;
        return json(request, { cards: data ?? [] }, 201);
      }

      const body = cardCreateSchema.parse(rawBody);
      const { data, error } = await admin
        .from("english_lesson_cards")
        .insert({ lesson_id: lessonId, ...body })
        .select("*")
        .single();
      if (error) throw error;
      return json(request, { card: data }, 201);
    }

    if (request.method === "PATCH" && cardId) {
      assertCanEdit(mode, lesson);
      const body = cardPatchSchema.parse(await parseBody(request));
      if (Object.keys(body).length === 0) throw new HttpError(400, "Pusty patch fiszki");

      const { data, error } = await admin
        .from("english_lesson_cards")
        .update(body)
        .eq("id", cardId)
        .eq("lesson_id", lessonId)
        .select("*")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new HttpError(404, "Fiszka nie istnieje — mogła zostać usunięta.");
      return json(request, { card: data });
    }

    if (request.method === "DELETE" && cardId) {
      assertCanEdit(mode, lesson);
      const { error } = await admin
        .from("english_lesson_cards")
        .delete()
        .eq("id", cardId)
        .eq("lesson_id", lessonId);
      if (error) throw error;
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    throw new HttpError(405, "Nieobsługiwana metoda");
  } catch (error) {
    const zodIssues = zodIssuesOf(error);
    if (zodIssues) {
      return json(request, { error: "Nieprawidłowe dane", details: zodIssues }, 400);
    }
    if (error instanceof HttpError) return json(request, { error: error.message }, error.status);
    // Komunikaty z Postgresa potrafią zawierać nazwy kolumn i treść zapytania —
    // logujemy je po stronie serwera, a klientowi zwracamy neutralny błąd.
    console.error("english-lesson-api", error);
    return json(request, { error: "Błąd serwera. Spróbuj ponownie za chwilę." }, 500);
  }
});
