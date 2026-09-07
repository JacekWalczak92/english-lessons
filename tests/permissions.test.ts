import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canAssignTeacher,
  canChangeStatus,
  canEditCards,
  canEditLessonMeta,
  canEditStudentComment,
  canManageLesson,
  type LessonAccessContext,
} from "../lib/domain.ts";

function context(overrides: Partial<LessonAccessContext> = {}): LessonAccessContext {
  return { mode: "owner", viewerRole: "student", lessonStatus: "draft", ...overrides };
}

const TEACHER_ASSIGNED = context({ mode: "assigned", viewerRole: "teacher" });
const TEACHER_OWN = context({ mode: "owner", viewerRole: "teacher" });
const STUDENT = context();

describe("kto wypełnia fiszki", () => {
  it("treść fiszek należy do nauczyciela", () => {
    assert.equal(canEditCards(TEACHER_ASSIGNED), true);
    assert.equal(canEditCards(TEACHER_OWN), true);
    assert.equal(canEditCards(STUDENT), false);
  });

  it("uczeń nie odzyskuje edycji przez tryb właściciela", () => {
    // Lekcję zakłada uczeń, więc jest jej właścicielem — to nie może
    // oznaczać prawa do pisania w fiszkach.
    assert.equal(canEditCards(context({ mode: "owner", viewerRole: "student" })), false);
  });

  it("zakończona lekcja blokuje przypisanego nauczyciela, właścicielowi zostawia edycję", () => {
    assert.equal(canEditCards({ ...TEACHER_ASSIGNED, lessonStatus: "finished" }), false);
    assert.equal(canEditCards({ ...TEACHER_OWN, lessonStatus: "finished" }), true);
  });
});

describe("komentarz ucznia", () => {
  it("wypełnia go wyłącznie uczeń w swojej lekcji", () => {
    assert.equal(canEditStudentComment(STUDENT), true);
    assert.equal(canEditStudentComment(TEACHER_ASSIGNED), false);
    assert.equal(canEditStudentComment(TEACHER_OWN), false);
  });

  it("po zakończeniu lekcji komentarza już nie da się zmienić", () => {
    assert.equal(canEditStudentComment({ ...STUDENT, lessonStatus: "finished" }), false);
  });

  it("uczeń nie komentuje cudzej lekcji", () => {
    assert.equal(canEditStudentComment(context({ mode: "assigned" })), false);
  });
});

describe("ustawienia lekcji", () => {
  it("nagłówek lekcji edytowalny do jej zakończenia", () => {
    assert.equal(canEditLessonMeta(STUDENT), true);
    assert.equal(canEditLessonMeta(TEACHER_ASSIGNED), true);
    assert.equal(canEditLessonMeta({ ...TEACHER_ASSIGNED, lessonStatus: "finished" }), false);
    assert.equal(canEditLessonMeta({ ...STUDENT, lessonStatus: "finished" }), true);
  });

  it("status zmienia obie strony lekcji", () => {
    assert.equal(canChangeStatus(STUDENT), true);
    assert.equal(canChangeStatus(TEACHER_ASSIGNED), true);
  });

  it("przypisanie i publikację zmienia właściciel lekcji", () => {
    assert.equal(canManageLesson(STUDENT), true);
    assert.equal(canManageLesson(TEACHER_ASSIGNED), false);
    assert.equal(canManageLesson(TEACHER_OWN), true);
  });

  it("nauczyciela przypisuje konto ucznia", () => {
    assert.equal(canAssignTeacher("student"), true);
    assert.equal(canAssignTeacher("teacher"), false);
  });
});
