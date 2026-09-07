import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@4";
import {
  CARD_TYPES,
  FIELD_LIMITS,
  LESSON_STATUSES,
  REVIEW_DIRECTIONS,
  canChangeStatus,
  canEditCards,
  canEditLessonMeta,
  canEditStudentComment,
  canManageLesson,
  type AccessMode,
  type AppRole,
  type LessonAccessContext,
} from "../_shared/domain.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Lista dozwolonych originów. Domyślnie `*`, ale wystarczy ustawić sekret
 * ALLOWED_ORIGINS="https://login.github.io", żeby zawęzić CORS do własnej strony.
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
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
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
    description: z.string().trim().max(FIELD_LIMITS.description).optional(),
    student_request: z.string().trim().max(FIELD_LIMITS.description).optional(),
    status: z.enum(LESSON_STATUSES).optional(),
    is_published: z.boolean().optional(),
    assigned_teacher_id: z.string().regex(UUID_RE).nullable().optional(),
  })
  .strict();

/**
 * Stan eksportu na Drive jest per konto, więc nie jest częścią patcha lekcji —
 * ląduje w english_lesson_exports pod parą (lekcja, użytkownik).
 */
const driveStateSchema = z
  .object({
    drive_file_id: z.string().max(200).nullable(),
    drive_file_name: z.string().max(300).nullable(),
    last_exported_at: z.string().datetime().nullable(),
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

/** Patch nauczyciela: cała treść fiszki. */
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

/**
 * Patch ucznia: wyłącznie komentarz.
 *
 * To osobny schemat, a nie filtr pól po parsowaniu — inaczej uczeń wysyłający
 * `{ english: "…" }` dostałby ciche „zapisano” zamiast odmowy i zobaczyłby
 * swoją zmianę do pierwszego odświeżenia.
 */
const studentCardPatchSchema = z
  .object({ student_comment: z.string().max(FIELD_LIMITS.student_comment) })
  .strict();

// ------------------------------------------------------------------- narzędzia

type LessonRow = {
  id: string;
  owner_id: string;
  assigned_teacher_id: string | null;
  status: "draft" | "finished";
  updated_at: string;
  [key: string]: unknown;
};

type Access = {
  admin: SupabaseClient;
  lesson: LessonRow;
  mode: AccessMode;
  viewerId: string;
  viewerName: string;
  viewerRole: AppRole;
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

function adminClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRole) throw new Error("Brak SUPABASE_URL lub SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type ProfileRow = { role: AppRole; display_name: string };

async function loadProfile(admin: SupabaseClient, userId: string): Promise<ProfileRow> {
  const { data } = await admin
    .from("english_profiles")
    .select("role, display_name")
    .eq("user_id", userId)
    .maybeSingle();
  const row = data as ProfileRow | null;
  return { role: row?.role ?? "student", display_name: row?.display_name ?? "" };
}

/**
 * Dostęp mają dwa konta: właściciel lekcji i przypisany nauczyciel.
 * Kody dołączenia i tajne linki zniknęły w v1.7.0 — jeżeli ktoś ma jeszcze
 * stary link, dostanie zwykłe 401.
 */
async function resolveAccess(request: Request, lessonId: string): Promise<Access> {
  const admin = adminClient();
  const { data: lesson, error } = await admin
    .from("english_lessons")
    .select("*")
    .eq("id", lessonId)
    .maybeSingle();

  if (error) throw error;
  if (!lesson) throw new HttpError(404, "Nie znaleziono lekcji");
  const row = lesson as LessonRow;

  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) throw new HttpError(401, "Zaloguj się, żeby otworzyć lekcję");

  const { data: userData } = await admin.auth.getUser(token);
  const user = userData.user;
  if (!user) throw new HttpError(401, "Sesja wygasła — zaloguj się ponownie");

  const mode: AccessMode | null =
    user.id === row.owner_id ? "owner" : user.id === row.assigned_teacher_id ? "assigned" : null;
  if (!mode) throw new HttpError(403, "Ta lekcja nie należy do Ciebie");

  const profile = await loadProfile(admin, user.id);
  return {
    admin,
    lesson: row,
    mode,
    viewerId: user.id,
    viewerName: profile.display_name || (user.email ?? ""),
    viewerRole: profile.role,
  };
}

function accessContext(access: Access): LessonAccessContext {
  return {
    mode: access.mode,
    viewerRole: access.viewerRole,
    lessonStatus: access.lesson.status,
  };
}

/** Druga strona lekcji: uczeń widzi nauczyciela, nauczyciel — ucznia. */
async function loadCounterpart(access: Access) {
  const { admin, lesson, mode } = access;
  const otherId = mode === "owner" ? lesson.assigned_teacher_id : lesson.owner_id;
  if (!otherId) return null;
  const profile = await loadProfile(admin, otherId);
  return {
    user_id: otherId,
    display_name: profile.display_name || (profile.role === "teacher" ? "Nauczyciel" : "Uczeń"),
    role: profile.role,
  };
}

async function loadDriveState(access: Access, lessonId: string) {
  const { data } = await access.admin
    .from("english_lesson_exports")
    .select("drive_file_id, drive_file_name, last_exported_at")
    .eq("lesson_id", lessonId)
    .eq("user_id", access.viewerId)
    .maybeSingle();
  return {
    drive_file_id: (data?.drive_file_id as string | null) ?? null,
    drive_file_name: (data?.drive_file_name as string | null) ?? null,
    last_exported_at: (data?.last_exported_at as string | null) ?? null,
  };
}

function publicLesson(lesson: LessonRow, mode: AccessMode) {
  if (mode === "owner") return lesson;
  const { share_token: _shareToken, join_code: _joinCode, ...safe } = lesson;
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
 * Klient podaje najnowszy znany `updated_at` i liczbę fiszek. Pobieramy tylko
 * dwie kolumny zamiast całych fiszek i przy braku zmian odsyłamy
 * `{ unchanged: true }` — przy lekcji z 300 fiszkami to różnica między
 * kilkuset kilobajtami a kilkudziesięcioma bajtami na cykl.
 */
async function isUnchangedSince(
  admin: SupabaseClient,
  access: Access,
  lessonId: string,
  since: string,
  expectedCount: number,
) {
  const sinceTime = Date.parse(since);
  if (!Number.isFinite(sinceTime)) return false;
  if (!notNewer(access.lesson.updated_at, sinceTime)) return false;

  const { data, error } = await admin
    .from("english_lesson_cards")
    .select("updated_at")
    .eq("lesson_id", lessonId);
  if (error) throw error;

  const rows = (data ?? []) as Array<{ updated_at: string }>;
  if (rows.length !== expectedCount) return false;
  return rows.every((card) => notNewer(card.updated_at, sinceTime));
}

// ---------------------------------------------------------------------- router

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });

  try {
    const url = new URL(request.url);
    const lessonId = url.searchParams.get("lessonId") ?? "";
    const cardId = url.searchParams.get("cardId") ?? "";
    const action = url.searchParams.get("action") ?? "";
    if (!lessonId) throw new HttpError(400, "Brak lessonId");
    if (!UUID_RE.test(lessonId)) throw new HttpError(400, "Nieprawidłowy identyfikator lekcji");
    if (cardId && !UUID_RE.test(cardId))
      throw new HttpError(400, "Nieprawidłowy identyfikator fiszki");

    const access = await resolveAccess(request, lessonId);
    const { admin, lesson, mode } = access;
    const context = accessContext(access);

    if (request.method === "GET" && !cardId) {
      const since = url.searchParams.get("since");
      const countParam = url.searchParams.get("count");
      if (since && countParam !== null && /^\d+$/.test(countParam)) {
        if (await isUnchangedSince(admin, access, lessonId, since, Number(countParam))) {
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

      return json(request, {
        lesson: publicLesson(lesson, mode),
        cards: cards ?? [],
        access: mode,
        viewer: {
          user_id: access.viewerId,
          display_name: access.viewerName,
          role: access.viewerRole,
          access: mode,
        },
        counterpart: await loadCounterpart(access),
        drive: await loadDriveState(access, lessonId),
      });
    }

    if (request.method === "POST" && action === "drive") {
      const state = driveStateSchema.parse(await parseBody(request));
      const { error } = await admin
        .from("english_lesson_exports")
        .upsert(
          { lesson_id: lessonId, user_id: access.viewerId, ...state },
          { onConflict: "lesson_id,user_id" },
        );
      if (error) throw error;
      return json(request, { drive: state });
    }

    if (request.method === "PATCH" && !cardId) {
      const body = lessonPatchSchema.parse(await parseBody(request));

      if (body.status !== undefined && !canChangeStatus(context)) {
        throw new HttpError(403, "Status lekcji zmienia nauczyciel albo właściciel lekcji.");
      }
      if (
        (body.assigned_teacher_id !== undefined || body.is_published !== undefined) &&
        !canManageLesson(context)
      ) {
        throw new HttpError(403, "Przypisanie i publikację ustawia właściciel lekcji.");
      }
      const touchesMeta =
        body.title !== undefined ||
        body.lesson_date !== undefined ||
        body.teacher_name !== undefined ||
        body.description !== undefined ||
        body.student_request !== undefined;
      if (touchesMeta && !canEditLessonMeta(context)) {
        throw new HttpError(423, "Lekcja jest zakończona.");
      }

      if (Object.keys(body).length === 0) {
        return json(request, { lesson: publicLesson(lesson, mode) });
      }

      const { data, error } = await admin
        .from("english_lessons")
        .update(body)
        .eq("id", lessonId)
        .select("*")
        .single();
      if (error) throw error;
      return json(request, { lesson: publicLesson(data as LessonRow, mode) });
    }

    if (request.method === "POST" && !cardId) {
      if (!canEditCards(context)) {
        throw new HttpError(
          403,
          access.viewerRole === "student"
            ? "Fiszki wypełnia nauczyciel. Ty możesz dopisać komentarz do każdej z nich."
            : "Lekcja jest zakończona. Otwórz ją ponownie, żeby dodawać fiszki.",
        );
      }
      const rawBody = await parseBody(request);
      const author_id = access.viewerId;

      // Rozróżniamy paczkę od pojedynczej fiszki po kształcie żądania.
      // Nieudany `safeParse` paczki nie może cicho spaść do schematu pojedynczej
      // fiszki, bo użytkownik dostałby komunikat o polu `cards` zamiast
      // informacji, który wiersz importu jest zły.
      if (rawBody && typeof rawBody === "object" && "cards" in rawBody) {
        const batch = cardBatchCreateSchema.parse(rawBody);
        const rows = batch.cards.map((card: CardImportItem) => ({
          lesson_id: lessonId,
          author_id,
          ...card,
        }));
        const { data, error } = await admin.from("english_lesson_cards").insert(rows).select("*");
        if (error) throw error;
        return json(request, { cards: data ?? [] }, 201);
      }

      const body = cardCreateSchema.parse(rawBody);
      const { data, error } = await admin
        .from("english_lesson_cards")
        .insert({ lesson_id: lessonId, author_id, ...body })
        .select("*")
        .single();
      if (error) throw error;
      return json(request, { card: data }, 201);
    }

    if (request.method === "DELETE" && cardId) {
      if (!canEditCards(context)) {
        throw new HttpError(403, "Fiszki usuwa nauczyciel prowadzący lekcję.");
      }
      const { error } = await admin
        .from("english_lesson_cards")
        .delete()
        .eq("id", cardId)
        .eq("lesson_id", lessonId);
      if (error) throw error;
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    if (request.method === "PATCH" && cardId) {
      const rawBody = await parseBody(request);
      const teacherMayEdit = canEditCards(context);
      const studentMayComment = canEditStudentComment(context);

      if (!teacherMayEdit && !studentMayComment) {
        throw new HttpError(
          423,
          "Lekcja jest zakończona — treści i komentarzy nie da się już zmieniać.",
        );
      }

      const body = teacherMayEdit
        ? cardPatchSchema.parse(rawBody)
        : studentCardPatchSchema.parse(rawBody);
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
