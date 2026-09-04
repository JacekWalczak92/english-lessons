import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultDirection, directionForTypeChange } from "../lib/domain.ts";
import {
  buildLessonExport,
  lessonFileName,
  lessonSyncStamp,
  type Lesson,
  type LessonCard,
} from "../lib/types.ts";

const lesson: Lesson = {
  id: "3f8a1c2d-1111-2222-3333-444455556666",
  lesson_date: "2026-05-12",
  title: "  Lekcja próbna  ",
  teacher_name: "  Mark  ",
  status: "draft",
  lesson_kind: "lesson",
  description: "",
  share_enabled: true,
  join_enabled: true,
  is_published: false,
  peer_visibility: true,
  card_count: 0,
  source_lesson_id: null,
  drive_file_id: null,
  drive_file_name: null,
  last_exported_at: null,
  created_at: "2026-05-12T08:00:00+00:00",
  updated_at: "2026-05-12T09:00:00+00:00",
};

function card(overrides: Partial<LessonCard>): LessonCard {
  return {
    id: "card-1",
    lesson_id: lesson.id,
    author_id: null,
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
    order_index: 0,
    created_at: "2026-05-12T08:00:00+00:00",
    updated_at: "2026-05-12T08:00:00+00:00",
    ...overrides,
  };
}

describe("buildLessonExport", () => {
  it("sortuje po order_index i przycina białe znaki", () => {
    const result = buildLessonExport(
      lesson,
      [
        card({ id: "b", order_index: 2, english: " second " }),
        card({ id: "a", order_index: 1, english: "first" }),
      ],
      new Date("2026-05-12T10:00:00Z"),
    );
    assert.deepEqual(
      result.cards.map((entry) => entry.id),
      ["a", "b"],
    );
    assert.equal(result.cards[1].english, "second");
    assert.equal(result.lesson.title, "Lekcja próbna");
    assert.equal(result.lesson.teacher, "Mark");
    assert.equal(result.lesson.exportedAt, "2026-05-12T10:00:00.000Z");
  });

  it("pomija fiszki bez treści, ale zostawia te z samym polskim", () => {
    const result = buildLessonExport(lesson, [
      card({ id: "pusta", english: "   ", polish: "  " }),
      card({ id: "polska", english: "", polish: "rachunek" }),
    ]);
    assert.deepEqual(
      result.cards.map((entry) => entry.id),
      ["polska"],
    );
  });

  it("trzyma schemaVersion na 1 — to kontrakt z importerem AnkiFiszki", () => {
    assert.equal(buildLessonExport(lesson, []).schemaVersion, 1);
  });

  it("stabilnie sortuje fiszki o tym samym order_index", () => {
    const result = buildLessonExport(lesson, [
      card({ id: "nowsza", order_index: 0, created_at: "2026-05-12T08:30:00+00:00" }),
      card({ id: "starsza", order_index: 0, created_at: "2026-05-12T08:00:00+00:00" }),
    ]);
    assert.deepEqual(
      result.cards.map((entry) => entry.id),
      ["starsza", "nowsza"],
    );
  });
});

describe("lessonFileName", () => {
  it("składa nazwę z daty i skróconego id", () => {
    assert.equal(lessonFileName(lesson), "2026-05-12_3f8a1c2d.json");
  });
});

describe("lessonSyncStamp", () => {
  it("zwraca najnowszy updated_at z lekcji i fiszek", () => {
    const stamp = lessonSyncStamp({
      lesson,
      cards: [
        card({ updated_at: "2026-05-12T08:00:00+00:00" }),
        card({ id: "c2", updated_at: "2026-05-12T11:30:00+00:00" }),
      ],
    });
    assert.equal(stamp, "2026-05-12T11:30:00+00:00");
  });

  it("radzi sobie z lekcją bez fiszek", () => {
    assert.equal(lessonSyncStamp({ lesson, cards: [] }), lesson.updated_at);
  });
});

describe("kierunek powtórki", () => {
  it("wymowa zawsze dostaje PRONUNCIATION", () => {
    assert.equal(defaultDirection("pronunciation"), "PRONUNCIATION");
    assert.equal(directionForTypeChange("pronunciation", "EN_TO_PL"), "PRONUNCIATION");
  });

  it("zmiana typu nie kasuje świadomie wybranego kierunku", () => {
    assert.equal(directionForTypeChange("word_phrase", "EN_TO_PL"), "EN_TO_PL");
  });

  it("po wyjściu z wymowy wraca kierunek domyślny dla nowego typu", () => {
    assert.equal(directionForTypeChange("translation_sentence", "PRONUNCIATION"), "PL_TO_EN");
  });
});
