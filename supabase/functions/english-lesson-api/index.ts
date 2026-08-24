import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-lesson-key",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const lessonPatchSchema = z.object({
  lesson_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  title: z.string().trim().min(1).max(200).optional(),
  teacher_name: z.string().trim().max(120).nullable().optional(),
  status: z.enum(["draft", "finished"]).optional(),
  share_enabled: z.boolean().optional(),
  drive_file_id: z.string().max(200).nullable().optional(),
  drive_file_name: z.string().max(300).nullable().optional(),
  last_exported_at: z.string().datetime().nullable().optional(),
}).strict();

const cardCreateSchema = z.object({
  card_type: z.enum(["translation_sentence", "word_phrase", "pronunciation", "british", "custom"]),
  review_direction: z.enum(["EN_TO_PL", "PL_TO_EN", "PRONUNCIATION"]),
  order_index: z.number().int().min(0).max(100000),
}).strict();

const cardPatchSchema = z.object({
  card_type: z.enum(["translation_sentence", "word_phrase", "pronunciation", "british", "custom"]).optional(),
  english: z.string().max(8000).optional(),
  polish: z.string().max(8000).optional(),
  review_direction: z.enum(["EN_TO_PL", "PL_TO_EN", "PRONUNCIATION"]).optional(),
  phonetic: z.string().max(1000).optional(),
  pronunciation: z.string().max(1000).optional(),
  note: z.string().max(12000).optional(),
  example: z.string().max(12000).optional(),
  british_variant: z.string().max(4000).optional(),
  american_variant: z.string().max(4000).optional(),
  order_index: z.number().int().min(0).max(100000).optional(),
}).strict();

type AccessMode = "owner" | "shared";
type LessonRow = {
  id: string;
  owner_id: string;
  share_enabled: boolean;
  share_token: string;
  status: "draft" | "finished";
  [key: string]: unknown;
};

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: corsHeaders });
}

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function adminClient() {
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
    .single();

  if (error || !lesson) throw new HttpError(404, "Nie znaleziono lekcji");
  const row = lesson as LessonRow;

  const shareKey = request.headers.get("x-lesson-key") ?? "";
  if (row.share_enabled && shareKey && row.share_token && constantTimeEqual(shareKey, row.share_token)) {
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

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(request.url);
    const lessonId = url.searchParams.get("lessonId") ?? "";
    const cardId = url.searchParams.get("cardId") ?? "";
    if (!lessonId) throw new HttpError(400, "Brak lessonId");

    const { admin, lesson, mode } = await resolveAccess(request, lessonId);

    if (request.method === "GET" && !cardId) {
      const { data: cards, error } = await admin
        .from("english_lesson_cards")
        .select("*")
        .eq("lesson_id", lessonId)
        .order("order_index", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return json({ lesson: publicLesson(lesson, mode), cards: cards ?? [], access: mode });
    }

    if (request.method === "PATCH" && !cardId) {
      assertCanEdit(mode, lesson);
      const body = lessonPatchSchema.parse(await parseBody(request));

      if (mode === "shared") {
        delete body.share_enabled;
        delete body.drive_file_id;
        delete body.drive_file_name;
        delete body.last_exported_at;
        if (body.status === "draft") delete body.status;
      }

      const { data, error } = await admin
        .from("english_lessons")
        .update(body)
        .eq("id", lessonId)
        .select("*")
        .single();
      if (error) throw error;
      return json({ lesson: publicLesson(data as LessonRow, mode) });
    }

    if (request.method === "POST" && !cardId) {
      assertCanEdit(mode, lesson);
      const body = cardCreateSchema.parse(await parseBody(request));
      const { data, error } = await admin
        .from("english_lesson_cards")
        .insert({ lesson_id: lessonId, ...body })
        .select("*")
        .single();
      if (error) throw error;
      return json({ card: data }, 201);
    }

    if (request.method === "PATCH" && cardId) {
      assertCanEdit(mode, lesson);
      const body = cardPatchSchema.parse(await parseBody(request));
      const { data, error } = await admin
        .from("english_lesson_cards")
        .update(body)
        .eq("id", cardId)
        .eq("lesson_id", lessonId)
        .select("*")
        .single();
      if (error) throw error;
      return json({ card: data });
    }

    if (request.method === "DELETE" && cardId) {
      assertCanEdit(mode, lesson);
      const { error } = await admin
        .from("english_lesson_cards")
        .delete()
        .eq("id", cardId)
        .eq("lesson_id", lessonId);
      if (error) throw error;
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    throw new HttpError(405, "Nieobsługiwana metoda");
  } catch (error) {
    if (error instanceof z.ZodError) {
      return json({ error: "Nieprawidłowe dane", details: error.issues }, 400);
    }
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    console.error(error);
    return json({ error: error instanceof Error ? error.message : "Nieznany błąd serwera" }, 500);
  }
});
