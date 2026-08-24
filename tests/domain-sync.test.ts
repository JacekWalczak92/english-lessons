import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * Edge Function działa w Deno i nie może importować z drzewa Next.js, więc
 * stałe domenowe są zduplikowane. Ten test pilnuje, żeby duplikat nie stał się
 * rozjazdem: dodanie typu fiszki po jednej stronie bez drugiej wywala build.
 */
const FRONTEND = readFileSync(new URL("../lib/domain.ts", import.meta.url), "utf8");
const EDGE = readFileSync(new URL("../supabase/functions/_shared/domain.ts", import.meta.url), "utf8");

function extractBlock(source: string, name: string) {
  const match = source.match(new RegExp(`export const ${name} = ([\\s\\S]*?)as const;`));
  assert.ok(match, `nie znaleziono stałej ${name}`);
  return match[1].replace(/\s+/g, "");
}

describe("stałe domenowe frontend ↔ edge function", () => {
  for (const name of ["CARD_TYPES", "REVIEW_DIRECTIONS", "LESSON_STATUSES", "FIELD_LIMITS"]) {
    it(`${name} są identyczne po obu stronach`, () => {
      assert.equal(extractBlock(FRONTEND, name), extractBlock(EDGE, name));
    });
  }
});
