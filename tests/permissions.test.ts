import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canAddCards,
  canEditCard,
  canEditLessonMeta,
  canManageAccess,
  formatJoinCode,
  isCardVisible,
  isLessonCard,
  normalizeJoinCode,
  type CardAccessContext,
} from "../lib/domain.ts";

const TEACHER = "11111111-1111-1111-1111-111111111111";
const STUDENT_A = "22222222-2222-2222-2222-222222222222";
const STUDENT_B = "33333333-3333-3333-3333-333333333333";

function context(overrides: Partial<CardAccessContext> = {}): CardAccessContext {
  return {
    mode: "member",
    viewerId: STUDENT_A,
    lessonOwnerId: TEACHER,
    lessonStatus: "draft",
    peerVisibility: true,
    ...overrides,
  };
}

describe("widoczność fiszek", () => {
  it("uczeń widzi słówka nauczyciela i swoje", () => {
    const ctx = context({ peerVisibility: false });
    assert.equal(isCardVisible(ctx, TEACHER), true);
    assert.equal(isCardVisible(ctx, null), true);
    assert.equal(isCardVisible(ctx, STUDENT_A), true);
  });

  it("fiszki innych uczniów zależą od ustawienia nauczyciela", () => {
    assert.equal(isCardVisible(context({ peerVisibility: false }), STUDENT_B), false);
    assert.equal(isCardVisible(context({ peerVisibility: true }), STUDENT_B), true);
  });

  it("właściciel i tajny link widzą wszystko", () => {
    for (const mode of ["owner", "shared"] as const) {
      assert.equal(isCardVisible(context({ mode, peerVisibility: false }), STUDENT_B), true);
    }
  });

  it("fiszka bez autora liczy się jako lekcyjna", () => {
    assert.equal(isLessonCard(null, TEACHER), true);
    assert.equal(isLessonCard(TEACHER, TEACHER), true);
    assert.equal(isLessonCard(STUDENT_B, TEACHER), false);
  });
});

describe("edycja fiszek", () => {
  it("uczeń zmienia tylko własne fiszki", () => {
    const ctx = context();
    assert.equal(canEditCard(ctx, STUDENT_A), true);
    assert.equal(canEditCard(ctx, STUDENT_B), false);
    assert.equal(canEditCard(ctx, TEACHER), false);
    assert.equal(canEditCard(ctx, null), false);
  });

  it("zakończona lekcja jest tylko do odczytu poza właścicielem", () => {
    const finished = context({ lessonStatus: "finished" });
    assert.equal(canEditCard(finished, STUDENT_A), false);
    assert.equal(canEditCard({ ...finished, mode: "shared" }, null), false);
    assert.equal(canEditCard({ ...finished, mode: "owner", viewerId: TEACHER }, STUDENT_B), true);
  });

  it("uczeń nie dodaje fiszek po zakończeniu lekcji", () => {
    assert.equal(canAddCards(context()), true);
    assert.equal(canAddCards(context({ lessonStatus: "finished" })), false);
    assert.equal(
      canAddCards(context({ mode: "owner", viewerId: TEACHER, lessonStatus: "finished" })),
      true,
    );
  });
});

describe("uprawnienia do lekcji", () => {
  it("metadane lekcji zmienia nauczyciel, nie uczeń", () => {
    assert.equal(canEditLessonMeta("owner"), true);
    assert.equal(canEditLessonMeta("shared"), true);
    assert.equal(canEditLessonMeta("member"), false);
  });

  it("kodem, publikacją i listą uczniów zarządza wyłącznie właściciel", () => {
    assert.equal(canManageAccess("owner"), true);
    assert.equal(canManageAccess("shared"), false);
    assert.equal(canManageAccess("member"), false);
  });
});

describe("kod dołączenia", () => {
  it("przyjmuje kod przepisany z myślnikiem i małymi literami", () => {
    assert.equal(normalizeJoinCode("abcd-efgh"), "ABCDEFGH");
    assert.equal(normalizeJoinCode(" ab cd ef gh "), "ABCDEFGH");
  });

  it("obcina nadmiarowe znaki zamiast przyjmować dłuższy kod", () => {
    assert.equal(normalizeJoinCode("ABCDEFGHIJKL"), "ABCDEFGH");
  });

  it("formatuje kod w dwie czwórki", () => {
    assert.equal(formatJoinCode("ABCDEFGH"), "ABCD-EFGH");
    assert.equal(formatJoinCode("ABC"), "ABC");
  });
});
