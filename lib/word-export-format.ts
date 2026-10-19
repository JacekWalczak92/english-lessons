import type { LessonCard } from "./types.ts";

/**
 * Format wymiany słówek z J-Learner Vocabulary (aplikacja na Androida, dawniej „Słownik”) do karty
 * „Moje słówka”. Pełny opis: `docs/slownik-words-format.md`.
 *
 * Czysty moduł bez Reacta i Supabase — parsuje to, co przyszło z telefonu
 * (plik, wklejka albo fragment adresu), i da się go przetestować w node:test.
 */

export const WORDS_FORMAT = "slownik-words";
export const WORDS_SCHEMA_VERSION = 1;

/** Parametr we fragmencie adresu: `/words/#import=<base64url(JSON)>`. */
export const IMPORT_HASH_KEY = "import";

export const WORD_LIMITS = { english: 2000, polish: 2000, maxWords: 20000 } as const;

export type WordKind = "word" | "sentence";
export type WordLang = "en" | "pl";

/** Jedno słówko po normalizacji — przód zawsze po angielsku, tył po polsku. */
export type ImportedWord = {
  externalId: string | null;
  english: string;
  polish: string;
  sourceLang: WordLang;
  kind: WordKind;
  favorite: boolean;
  lookedUpAt: string | null;
};

export type WordsExportV1 = {
  format: typeof WORDS_FORMAT;
  schemaVersion: 1;
  exportedAt: string;
  source?: { app?: string; version?: string };
  words: Array<{
    id?: string | number;
    english: string;
    polish: string;
    sourceLang?: WordLang;
    kind?: WordKind;
    favorite?: boolean;
    lookedUpAt?: string;
  }>;
};

export type WordsParseResult = {
  words: ImportedWord[];
  /** Wiersze/pozycje, których nie dało się odczytać — numerowane od 1. */
  problems: Array<{ line: number; message: string }>;
  /** Pozycje pominięte, bo powtarzały się w samym imporcie. */
  duplicates: number;
  format: "json" | "lines" | "empty";
};

/** Klucz duplikatu: angielska strona bez wielkości liter i nadmiarowych spacji. */
export function dedupeKey(english: string): string {
  return english.trim().replace(/\s+/g, " ").toLowerCase();
}

function clean(value: unknown, limit: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, limit);
}

function guessKind(english: string): WordKind {
  return english.split(/\s+/).filter(Boolean).length <= 2 ? "word" : "sentence";
}

function normalizeDate(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function finish(
  raw: Array<{ line: number; word: ImportedWord | null; message?: string }>,
  format: WordsParseResult["format"],
): WordsParseResult {
  const seen = new Set<string>();
  const words: ImportedWord[] = [];
  const problems: WordsParseResult["problems"] = [];
  let duplicates = 0;

  for (const entry of raw) {
    if (!entry.word) {
      problems.push({ line: entry.line, message: entry.message ?? "Nie da się odczytać." });
      continue;
    }
    const key = dedupeKey(entry.word.english);
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.add(key);
    words.push(entry.word);
  }

  if (words.length > WORD_LIMITS.maxWords) {
    problems.push({
      line: 0,
      message: `Za dużo słówek naraz (${words.length}). Limit to ${WORD_LIMITS.maxWords} — podziel eksport.`,
    });
    return { words: words.slice(0, WORD_LIMITS.maxWords), problems, duplicates, format };
  }
  return { words, problems, duplicates, format };
}

function parseJson(text: string): WordsParseResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { words: [], problems: [{ line: 0, message: "To nie jest poprawny JSON." }], duplicates: 0, format: "json" };
  }

  const root = data as Partial<WordsExportV1> | null;
  const list = Array.isArray(data) ? data : root?.words;
  if (!Array.isArray(list)) {
    return {
      words: [],
      problems: [{ line: 0, message: "Brak listy „words” — to nie wygląda na eksport z J-Learner Vocabulary." }],
      duplicates: 0,
      format: "json",
    };
  }
  if (!Array.isArray(data) && root?.format && root.format !== WORDS_FORMAT) {
    return {
      words: [],
      problems: [{ line: 0, message: `Nieznany format „${String(root.format)}”.` }],
      duplicates: 0,
      format: "json",
    };
  }
  if (!Array.isArray(data) && typeof root?.schemaVersion === "number" && root.schemaVersion > WORDS_SCHEMA_VERSION) {
    return {
      words: [],
      problems: [
        {
          line: 0,
          message: `Plik jest z nowszej wersji formatu (${root.schemaVersion}). Zaktualizuj aplikację webową.`,
        },
      ],
      duplicates: 0,
      format: "json",
    };
  }

  const raw = list.map((item, index) => {
    const line = index + 1;
    if (!item || typeof item !== "object") return { line, word: null, message: "Pozycja nie jest obiektem." };
    const entry = item as Record<string, unknown>;
    const english = clean(entry.english, WORD_LIMITS.english);
    const polish = clean(entry.polish, WORD_LIMITS.polish);
    if (!english || !polish) return { line, word: null, message: "Brakuje strony angielskiej albo polskiej." };
    const word: ImportedWord = {
      externalId: entry.id === undefined || entry.id === null ? null : String(entry.id).slice(0, 64),
      english,
      polish,
      sourceLang: entry.sourceLang === "pl" ? "pl" : "en",
      kind: entry.kind === "sentence" || entry.kind === "word" ? entry.kind : guessKind(english),
      favorite: entry.favorite === true,
      lookedUpAt: normalizeDate(entry.lookedUpAt),
    };
    return { line, word };
  });
  return finish(raw, "json");
}

/**
 * Starszy eksport aplikacji „Kopiuj do schowka”: `angielski;polski`, jedna para
 * w linii. Tabulator też działa, więc przechodzi także plik TSV dla Anki.
 */
function parseLines(text: string): WordsParseResult {
  const raw: Array<{ line: number; word: ImportedWord | null; message?: string }> = [];
  text.split(/\r?\n/).forEach((rawLine, index) => {
    const line = index + 1;
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const parts = trimmed.includes("\t") ? trimmed.split("\t") : trimmed.split(";");
    const english = clean(parts[0], WORD_LIMITS.english);
    const polish = clean(parts[1], WORD_LIMITS.polish);
    if (!english || !polish) {
      raw.push({ line, word: null, message: "Oczekiwano „angielski;polski”." });
      return;
    }
    raw.push({
      line,
      word: {
        externalId: null,
        english,
        polish,
        sourceLang: "en",
        kind: guessKind(english),
        favorite: false,
        lookedUpAt: null,
      },
    });
  });
  return finish(raw, "lines");
}

/** Plik, wklejka albo odkodowany fragment adresu — format rozpoznajemy po treści. */
export function parseWordsInput(text: string): WordsParseResult {
  const trimmed = text.replace(/^﻿/, "").trim();
  if (!trimmed) return { words: [], problems: [], duplicates: 0, format: "empty" };
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return parseJson(trimmed);
  return parseLines(trimmed);
}

/** base64url → tekst UTF-8 (tak koduje aplikacja na Androida). */
export function decodeBase64Url(value: string): string {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Wyciąga ładunek z `#import=…`. Zwraca `null`, gdy w adresie nic nie ma. */
export function readImportFromHash(hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const value = params.get(IMPORT_HASH_KEY);
  if (!value) return null;
  try {
    return decodeBase64Url(value);
  } catch {
    return null;
  }
}

/** Data w strefie przeglądarki — do grupowania listy po dniach. */
export function localDay(iso: string | null): string {
  if (!iso) return "bez daty";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "bez daty";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Słówko w kształcie fiszki lekcji — dzięki temu karta „Moje słówka” używa tej
 * samej logiki powtórki co `lib/study.ts`, zamiast drugiej, równoległej.
 */
export function wordAsCard(word: {
  id: string;
  english: string;
  polish: string;
  kind: WordKind;
  created_at: string;
}): LessonCard {
  return {
    id: word.id,
    lesson_id: "my-words",
    author_id: null,
    card_type: word.kind === "sentence" ? "translation_sentence" : "word_phrase",
    english: word.english,
    polish: word.polish,
    review_direction: "EN_TO_PL",
    phonetic: "",
    pronunciation: "",
    note: "",
    example: "",
    british_variant: "",
    american_variant: "",
    student_comment: "",
    order_index: 0,
    created_at: word.created_at,
    updated_at: word.created_at,
  };
}
