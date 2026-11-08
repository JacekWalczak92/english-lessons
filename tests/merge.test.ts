import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MERGE_LIMIT,
  defaultMergeTitle,
  mergeCards,
  mergeKey,
  parseLessonIds,
  studyHref,
} from "../lib/merge.ts";
import type { LessonCard } from "../lib/types.ts";

let seq = 0;
function card(overrides: Partial<LessonCard> = {}): LessonCard {
  seq += 1;
  return {
    id: `card-${seq}`,
    lesson_id: "l1",
    author_id: null,
    card_type: "word_phrase",
    english: "apple",
    polish: "jabłko",
    review_direction: "EN_TO_PL",
    phonetic: "",
    pronunciation: "",
    note: "",
    example: "",
    british_variant: "",
    american_variant: "",
    student_comment: "",
    order_index: 0,
    created_at: "2026-11-01T10:00:00Z",
    updated_at: "2026-11-01T10:00:00Z",
    ...overrides,
  };
}

describe("mergeKey", () => {
  it("ignoruje wielkość liter i nadmiarowe spacje", () => {
    assert.equal(mergeKey(card({ english: "  Look   UP " })), "look up");
  });
  it("odróżnia fiszkę wymowy od zwykłej", () => {
    assert.notEqual(
      mergeKey(card({ english: "schedule", card_type: "pronunciation" })),
      mergeKey(card({ english: "schedule" })),
    );
  });
});

describe("mergeCards", () => {
  it("zostawia pierwsze wystąpienie słówka i liczy duplikaty", () => {
    const a = card({ english: "apple", polish: "jabłko (A)" });
    const b = card({ english: "Apple ", polish: "jabłko (B)" });
    const c = card({ english: "pear" });
    const merged = mergeCards([
      { id: "A", title: "A", cards: [a] },
      { id: "B", title: "B", cards: [b, c] },
    ]);
    assert.deepEqual(
      merged.cards.map((item) => item.id),
      [a.id, c.id],
    );
    assert.equal(merged.duplicates, 1);
    assert.deepEqual(merged.origin, { [a.id]: "A", [c.id]: "B" });
  });

  it("sortuje fiszki lekcji po order_index", () => {
    const late = card({ english: "late", order_index: 5 });
    const early = card({ english: "early", order_index: 1 });
    const merged = mergeCards([{ id: "A", title: "A", cards: [late, early] }]);
    assert.deepEqual(
      merged.cards.map((item) => item.english),
      ["early", "late"],
    );
  });

  it("nie porównuje fiszek bez angielskiej strony", () => {
    const merged = mergeCards([
      { id: "A", title: "A", cards: [card({ english: "" }), card({ english: " " })] },
    ]);
    assert.equal(merged.cards.length, 2);
    assert.equal(merged.duplicates, 0);
  });
});

describe("adresy nauki", () => {
  it("parsuje ids i stare id bez powtórzeń", () => {
    assert.deepEqual(parseLessonIds("a, b,,a", null), ["a", "b"]);
    assert.deepEqual(parseLessonIds(null, "x"), ["x"]);
    assert.deepEqual(parseLessonIds(null, null), []);
  });
  it("przycina do limitu", () => {
    const many = Array.from({ length: MERGE_LIMIT + 5 }, (_, i) => `id${i}`).join(",");
    assert.equal(parseLessonIds(many, null).length, MERGE_LIMIT);
  });
  it("buduje link: jedna lekcja zostaje przy ?id=", () => {
    assert.equal(studyHref(["a"]), "/study/?id=a");
    assert.equal(studyHref(["a", "b"], true), "/study/?ids=a%2Cb&words=1");
  });
});

describe("defaultMergeTitle", () => {
  it("podaje zakres dat", () => {
    assert.equal(defaultMergeTitle(["2026-11-02", "2026-10-12"]), "Powtórka: 12.10–02.11");
    assert.equal(defaultMergeTitle(["2026-11-02", "2026-11-02"]), "Powtórka: 02.11");
    assert.equal(defaultMergeTitle([]), "Powtórka");
  });
});
