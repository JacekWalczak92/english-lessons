import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@4";
import {
  CARD_TYPES,
  FIELD_LIMITS,
  LESSON_STATUSES,
  REVIEW_DIRECTIONS,
  canAddCards,
  canEditCard,
  canEditLessonMeta,
  canManageAccess,
  isCardVisible,
  type AccessMode,
  type CardAccessContext,
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
    description: z.string().trim().max(FIELD_LIMITS.description).optional(),
    status: z.enum(LESSON_STATUSES).optional(),
    share_enabled: z.boolean().optional(),
    join_enabled: z.boolean().optional(),
    is_published: z.boolean().optional(),
    peer_visibility: z.boolean().optional(),
    /** Unieważnia dotychczasowy tajny link i wystawia nowy. Tylko właściciel. */
    rotate_share_token: z.literal(true).optional(),
    /** Unieważnia kod dołączenia — zapisani uczniowie zostają. Tylko właściciel. */
    rotate_join_code: z.literal(true).optional(),
  })
  .strict();

/**
 * Stan eksportu na Drive jest per konto, więc nie jest częścią patcha lekcji:
 * właścicielowi zapisujemy go w wierszu lekcji, uczniowi w jego członkostwie.
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

type LessonRow = {
  id: string;
  owner_id: string;
  share_enabled: boolean;
  share_token: string;
  join_code: string;
  peer_visibility: boolean;
  status: "draft" | "finished";
  updated_at: string;
  drive_file_id: string | null;
  drive_file_name: string | null;
  last_exported_at: string | null;
  [key: string]: unknown;
};

type MemberRow = {
  lesson_id: string;
  user_id: string;
  member_role: "teacher" | "student";
  display_name: string;
  drive_file_id: string | null;
  drive_file_name: string | null;
  last_exported_at: string | null;
  joined_at: string;
};

type Access = {
  admin: SupabaseClient;
  lesson: LessonRow;
  mode: AccessMode;
  viewerId: string | null;
  viewerName: string;
  membership: MemberRow | null;
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

/** Kod dołączenia losujemy w bazie, żeby unikalność sprawdzał jeden mechanizm. */
async function newJoinCode(admin: SupabaseClient) {
  const { data, error } = await admin.rpc("english_new_join_code");
  if (error) throw error;
  return data as string;
}

function adminClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRole) throw new Error("Brak SUPABASE_URL lub SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Kolejność ma znaczenie: najpierw sprawdzamy konto (właściciel, potem uczeń
 * zapisany na lekcję), a dopiero na końcu tajny link z v1.3.0. Dzięki temu
 * zalogowany nauczyciel, który kliknął własny link, nadal działa jako właściciel.
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
  if (token) {
    const { data } = await admin.auth.getUser(token);
    const user = data.user;
    if (user) {
      const { data: profile } = await admin
        .from("english_profiles")
        .select("display_name")
        .eq("user_id", user.id)
        .maybeSingle();
      const profileName = (profile?.display_name as string | undefined) ?? "";
      const fallbackName = user.email ?? "";

      if (user.id === row.owner_id) {
        return {
          admin,
          lesson: row,
          mode: "owner",
          viewerId: user.id,
          viewerName: profileName || fallbackName,
          membership: null,
        };
      }

      const { data: membership } = await admin
        .from("english_lesson_members")
        .select("*")
        .eq("lesson_id", lessonId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (membership) {
        const member = membership as MemberRow;
        return {
          admin,
          lesson: row,
          mode: "member",
          viewerId: user.id,
          viewerName: member.display_name || profileName || fallbackName,
          membership: member,
        };
      }
    }
  }

  const shareKey = request.headers.get("x-lesson-key") ?? "";
  if (
    row.share_enabled &&
    shareKey &&
    row.share_token &&
    constantTimeEqual(shareKey, row.share_token)
  ) {
    return {
      admin,
      lesson: row,
      mode: "shared",
      viewerId: null,
      viewerName: "",
      membership: null,
    };
  }

  throw new HttpError(401, "Brak dostępu do tej lekcji");
}

function accessContext(access: Access): CardAccessContext {
  return {
    mode: access.mode,
    viewerId: access.viewerId,
    lessonOwnerId: access.lesson.owner_id,
    lessonStatus: access.lesson.status,
    peerVisibility: access.lesson.peer_visibility !== false,
  };
}

/** Autor nowej fiszki: uczeń podpisuje swoją, tajny link tworzy fiszkę lekcyjną. */
function authorForNewCard(access: Access): string | null {
  if (access.mode === "shared") return null;
  return access.viewerId;
}

function assertCanAddCards(access: Access) {
  if (!canAddCards(accessContext(access))) {
    throw new HttpError(423, "Lekcja jest zakończona. Właściciel może ją ponownie otworzyć.");
  }
}

function publicLesson(lesson: LessonRow, mode: AccessMode) {
  if (mode === "owner") return lesson;
  const { owner_id: _ownerId, share_token: _shareToken, join_code: _joinCode, ...safe } = lesson;
  // Stan eksportu właściciela nie jest stanem ucznia — uczeń dostaje swój w `drive`.
  return { ...safe, drive_file_id: null, drive_file_name: null, last_exported_at: null };
}

function driveStateFor(access: Access) {
  const source = access.mode === "member" ? access.membership : access.lesson;
  return {
    drive_file_id: source?.drive_file_id ?? null,
    drive_file_name: source?.drive_file_name ?? null,
    last_exported_at: source?.last_exported_at ?? null,
  };
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

type CardStamp = { author_id: string | null; updated_at: string };

/**
 * Szybka ścieżka pollingu.
 *
 * Klient podaje najnowszy znany `updated_at` i liczbę widocznych dla siebie
 * fiszek. Pobieramy tylko trzy kolumny (a nie całe fiszki), liczymy to samo po
 * stronie serwera i przy braku zmian odsyłamy `{ unchanged: true }`. Przy lekcji
 * z 300 fiszkami i odpytywaniu co kilka sekund to różnica między kilkuset
 * kilobajtami a kilkudziesięcioma bajtami na cykl.
 *
 * Filtrowanie widoczności musi być tu identyczne jak w GET — inaczej uczeń,
 * któremu przybyła niewidoczna fiszka kolegi, dostawałby w kółko pełny payload.
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
    .select("author_id, updated_at")
    .eq("lesson_id", lessonId);
  if (error) throw error;

  const context = accessContext(access);
  const visible = ((data ?? []) as CardStamp[]).filter((card) =>
    isCardVisible(context, card.author_id),
  );
  if (visible.length !== expectedCount) return false;
  return visible.every((card) => notNewer(card.updated_at, sinceTime));
}

/** Nazwy autorów: właściciel + zapisani uczniowie. Bez tego fiszka byłaby anonimowa. */
async function loadAuthors(access: Access, lessonId: string) {
  const { admin, lesson } = access;
  const authors: Record<string, string> = {};

  const { data: ownerProfile } = await admin
    .from("english_profiles")
    .select("display_name")
    .eq("user_id", lesson.owner_id)
    .maybeSingle();
  const ownerName =
    (ownerProfile?.display_name as string | undefined) ||
    ((lesson.teacher_name as string | null) ?? "") ||
    "Nauczyciel";
  authors[lesson.owner_id] = ownerName;

  const { data: members, error } = await admin
    .from("english_lesson_members")
    .select("*")
    .eq("lesson_id", lessonId)
    .order("joined_at", { ascending: true });
  if (error) throw error;

  const rows = (members ?? []) as MemberRow[];
  for (const member of rows) {
    authors[member.user_id] = member.display_name || "Uczeń";
  }
  return { authors, members: rows };
}

// ---------------------------------------------------------------------- router

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });

  try {
    const url = new URL(request.url);
    const lessonId = url.searchParams.get("lessonId") ?? "";
    const cardId = url.searchParams.get("cardId") ?? "";
    const memberId = url.searchParams.get("memberId") ?? "";
    const action = url.searchParams.get("action") ?? "";
    if (!lessonId) throw new HttpError(400, "Brak lessonId");
    if (!UUID_RE.test(lessonId)) throw new HttpError(400, "Nieprawidłowy identyfikator lekcji");
    if (cardId && !UUID_RE.test(cardId)) throw new HttpError(400, "Nieprawidłowy identyfikator fiszki");
    if (memberId && !UUID_RE.test(memberId)) throw new HttpError(400, "Nieprawidłowy identyfikator ucznia");

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

      const { authors, members } = await loadAuthors(access, lessonId);
      const visibleCards = ((cards ?? []) as Array<{ author_id: string | null }>).filter((card) =>
        isCardVisible(context, card.author_id),
      );

      // Licznik fiszek ucznia przyda się nauczycielowi w panelu lekcji.
      const roster =
        mode === "owner"
          ? members.map((member) => ({
              lesson_id: member.lesson_id,
              user_id: member.user_id,
              member_role: member.member_role,
              display_name: member.display_name,
              joined_at: member.joined_at,
              card_count: ((cards ?? []) as Array<{ author_id: string | null }>).filter(
                (card) => card.author_id === member.user_id,
              ).length,
            }))
          : [];

      return json(request, {
        lesson: publicLesson(lesson, mode),
        cards: visibleCards,
        access: mode,
        teacher_id: lesson.owner_id,
        viewer: { user_id: access.viewerId, display_name: access.viewerName, access: mode },
        authors,
        members: roster,
        drive: driveStateFor(access),
      });
    }

    if (request.method === "POST" && action === "drive") {
      const state = driveStateSchema.parse(await parseBody(request));
      if (mode === "member" && access.viewerId) {
        const { error } = await admin
          .from("english_lesson_members")
          .update(state)
          .eq("lesson_id", lessonId)
          .eq("user_id", access.viewerId);
        if (error) throw error;
      } else {
        const { error } = await admin.from("english_lessons").update(state).eq("id", lessonId);
        if (error) throw error;
      }
      return json(request, { drive: state });
    }

    if (request.method === "PATCH" && !cardId) {
      if (!canEditLessonMeta(mode)) {
        throw new HttpError(403, "Ustawienia lekcji zmienia tylko nauczyciel.");
      }
      if (mode === "shared" && lesson.status === "finished") {
        throw new HttpError(423, "Lekcja jest zakończona. Właściciel może ją ponownie otworzyć.");
      }
      const body = lessonPatchSchema.parse(await parseBody(request));

      if (!canManageAccess(mode)) {
        // Nauczyciel z tajnego linku poprawia treść lekcji, ale nie zarządza
        // udostępnianiem, publikacją ani listą uczniów.
        delete body.share_enabled;
        delete body.join_enabled;
        delete body.is_published;
        delete body.peer_visibility;
        delete body.rotate_share_token;
        delete body.rotate_join_code;
        if (body.status === "draft") delete body.status;
      }

      const { rotate_share_token: rotateShare, rotate_join_code: rotateJoin, ...patch } = body;
      const update: Record<string, unknown> = { ...patch };
      if (rotateShare) update.share_token = newShareToken();
      if (rotateJoin) update.join_code = await newJoinCode(admin);

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
      assertCanAddCards(access);
      const rawBody = await parseBody(request);
      const author_id = authorForNewCard(access);

      // Rozróżniamy paczkę od pojedynczej fiszki po kształcie żądania.
      // W v1.2.0 nieudany `safeParse` paczki cicho spadał do schematu
      // pojedynczej fiszki i użytkownik dostawał komunikat o polu `cards`
      // zamiast informacji, który wiersz importu jest zły.
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

    if ((request.method === "PATCH" || request.method === "DELETE") && cardId) {
      const { data: existing, error: findError } = await admin
        .from("english_lesson_cards")
        .select("author_id")
        .eq("id", cardId)
        .eq("lesson_id", lessonId)
        .maybeSingle();
      if (findError) throw findError;
      if (!existing) throw new HttpError(404, "Fiszka nie istnieje — mogła zostać usunięta.");

      const authorId = (existing as { author_id: string | null }).author_id;
      if (!isCardVisible(context, authorId)) {
        throw new HttpError(404, "Fiszka nie istnieje — mogła zostać usunięta.");
      }
      if (!canEditCard(context, authorId)) {
        throw new HttpError(
          403,
          lesson.status === "finished"
            ? "Lekcja jest zakończona. Nauczyciel może ją ponownie otworzyć."
            : "Możesz zmieniać tylko własne fiszki.",
        );
      }

      if (request.method === "DELETE") {
        const { error } = await admin
          .from("english_lesson_cards")
          .delete()
          .eq("id", cardId)
          .eq("lesson_id", lessonId);
        if (error) throw error;
        return new Response(null, { status: 204, headers: corsHeaders(request) });
      }

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

    if (request.method === "DELETE" && memberId) {
      if (!canManageAccess(mode)) throw new HttpError(403, "Listą uczniów zarządza nauczyciel.");
      const { error } = await admin
        .from("english_lesson_members")
        .delete()
        .eq("lesson_id", lessonId)
        .eq("user_id", memberId);
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
