import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyAnswer,
  buildStudyItem,
  buildStudyItems,
  countStats,
  emptyStats,
  filterByScope,
  isStudyable,
  resolveDirection,
  shuffle,
} from "../lib/study.ts";
import { hardCardIds, type LessonProgress } from "../lib/study-progress.ts";
import type { LessonCard } from "../lib/types.ts";

const TEACHER = "11111111-1111-1111-1111-111111111111";

function card(overrides: Partial<LessonCard> = {}): LessonCard {
  return {
    id: "card-1",
    lesson_id: "lesson-1",
    author_id: TEACHER,
    card_type: "word_phrase",
    english: "bill",
    polish: "rachunek",
    review_direction: "PL_TO_EN",
    phonetic: "",
    pronunciation: "",
    note: "",
    example: "",
    british_variant: "",
    american_variant: "",
    student_comment: "",
    order_index: 0,
    created_at: "2026-09-01T08:00:00+00:00",
    updated_at: "2026-09-01T08:00:00+00:00",
    ...overrides,
  };
}

describe("kolejka powtórek", () => {
  it("„umiem” zdejmuje fiszkę z kolejki", () => {
    assert.deepEqual(applyAnswer(["a", "b", "c"], true), ["b", "c"]);
  });

  it("„powtórz” odkłada fiszkę dalej, a nie usuwa", () => {
    assert.deepEqual(applyAnswer(["a", "b", "c", "d", "e", "f"], false, 3), [
      "b",
      "c",
      "d",
      "a",
      "e",
      "f",
    ]);
  });

  it("przy krótkiej kolejce fiszka ląduje na końcu", () => {
    assert.deepEqual(applyAnswer(["a", "b"], false, 4), ["b", "a"]);
  });

  it("sesja kończy się dopiero po zaliczeniu każdej fiszki", () => {
    let queue = ["a", "b"];
    queue = applyAnswer(queue, false); // a wraca
    queue = applyAnswer(queue, true); // b umiem
    assert.deepEqual(queue, ["a"]);
    queue = applyAnswer(queue, true);
    assert.deepEqual(queue, []);
  });

  it("pusta kolejka nie wybucha", () => {
    assert.deepEqual(applyAnswer([], true), []);
  });
});

describe("kierunek pytania", () => {
  it("„jak na fiszce” bierze ustawienie fiszki", () => {
    assert.equal(resolveDirection(card({ review_direction: "EN_TO_PL" }), "card"), "EN_TO_PL");
  });

  it("wymowa zawsze pyta o wymowę", () => {
    const pron = card({ card_type: "pronunciation", review_direction: "PL_TO_EN" });
    assert.equal(resolveDirection(pron, "EN_TO_PL"), "PRONUNCIATION");
  });

  it("tryb mieszany losuje obie strony", () => {
    assert.equal(resolveDirection(card(), "mixed", () => 0.1), "PL_TO_EN");
    assert.equal(resolveDirection(card(), "mixed", () => 0.9), "EN_TO_PL");
  });
});

describe("treść pytania", () => {
  it("PL → EN pyta po polsku", () => {
    const item = buildStudyItem(card(), "PL_TO_EN");
    assert.equal(item.question, "rachunek");
    assert.equal(item.answer, "bill");
  });

  it("British bierze wariant brytyjski jako odpowiedź", () => {
    const item = buildStudyItem(
      card({ card_type: "british", british_variant: "at the weekend", english: "at the weekend" }),
      "PL_TO_EN",
    );
    assert.equal(item.answer, "at the weekend");
  });

  it("fiszka wymowy pokazuje zapis fonetyczny", () => {
    const item = buildStudyItem(
      card({ card_type: "pronunciation", english: "photography", phonetic: "/fəˈtɒɡrəfi/" }),
      "PRONUNCIATION",
    );
    assert.equal(item.question, "photography");
    assert.match(item.answer, /fəˈtɒɡrəfi/);
  });
});

describe("dobór fiszek", () => {
  it("pomija fiszki z pustą stroną", () => {
    assert.equal(isStudyable(card({ polish: "   " })), false);
    assert.equal(isStudyable(card()), true);
    assert.equal(isStudyable(card({ card_type: "pronunciation", phonetic: "", pronunciation: "" })), false);
  });

  it("zakres „z moim komentarzem” bierze tylko skomentowane fiszki", () => {
    const cards = [
      card({ id: "a", student_comment: "mylę z bill" }),
      card({ id: "b" }),
      card({ id: "c", student_comment: "   " }),
    ];
    assert.deepEqual(
      filterByScope(cards, "commented", {}).map((entry) => entry.id),
      ["a"],
    );
    assert.equal(filterByScope(cards, "all", {}).length, 3);
  });

  it("zakres „do poprawki” bierze tylko wskazane fiszki", () => {
    const cards = [card({ id: "a" }), card({ id: "b" })];
    const filtered = filterByScope(cards, "hard", { hardCardIds: ["b"] });
    assert.deepEqual(filtered.map((entry) => entry.id), ["b"]);
  });

  it("buduje pozycje sesji bez ruszania wejściowej listy", () => {
    const cards = [card({ id: "a" }), card({ id: "b", polish: "" })];
    const items = buildStudyItems(cards, {
      scope: "all",
      direction: "card",
      context: {},
      shuffled: false,
    });
    assert.deepEqual(items.map((item) => item.cardId), ["a"]);
    assert.equal(cards.length, 2);
  });

  it("tasowanie zwraca kopię z tym samym zestawem", () => {
    const input = ["a", "b", "c", "d"];
    const output = shuffle(input, () => 0.42);
    assert.deepEqual([...output].sort(), [...input].sort());
    assert.deepEqual(input, ["a", "b", "c", "d"]);
  });
});

describe("historia nauki", () => {
  it("do poprawki trafia ostatnio nietrafione i częściej mylone", () => {
    const progress: LessonProgress = {
      updatedAt: "2026-09-04T10:00:00.000Z",
      cards: {
        ok: { correct: 3, wrong: 0, lastResult: "ok", lastAt: "2026-09-04T10:00:00.000Z" },
        again: { correct: 2, wrong: 1, lastResult: "again", lastAt: "2026-09-04T10:00:00.000Z" },
        mylone: { correct: 1, wrong: 4, lastResult: "ok", lastAt: "2026-09-04T10:00:00.000Z" },
      },
    };
    assert.deepEqual(hardCardIds(progress).sort(), ["again", "mylone"]);
  });
});

describe("statystyki sesji", () => {
  it("liczy trafienia i powtórki", () => {
    let stats = emptyStats();
    stats = countStats(stats, true);
    stats = countStats(stats, false);
    assert.deepEqual(stats, { answered: 2, correct: 1, again: 1 });
  });
});
