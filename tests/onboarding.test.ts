import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  TOURS,
  TOUR_IDS,
  dashboardTour,
  lessonTour,
  tourStorageKey,
  visibleSteps,
} from "../lib/onboarding.ts";

describe("dobór instruktażu", () => {
  it("lista lekcji zależy od roli konta", () => {
    assert.equal(dashboardTour("teacher"), "dashboard-teacher");
    assert.equal(dashboardTour("student"), "dashboard-student");
  });

  it("edytor zależy od roli konta", () => {
    assert.equal(lessonTour("student"), "lesson-student");
    assert.equal(lessonTour("teacher"), "lesson-teacher");
  });
});

describe("kroki instruktażu", () => {
  it("każdy instruktaż ma kroki z tytułem i treścią", () => {
    for (const id of TOUR_IDS) {
      const steps = TOURS[id];
      assert.ok(steps.length > 0, `instruktaż ${id} jest pusty`);
      for (const step of steps) {
        assert.ok(step.title.length > 0, `krok bez tytułu w ${id}`);
        assert.ok(step.body.length > 0, `krok bez treści w ${id}`);
      }
    }
  });

  it("pomija kroki wskazujące na nieobecne elementy", () => {
    const steps = [
      { target: null, title: "start", body: "…" },
      { target: "jest", title: "a", body: "…" },
      { target: "nie-ma", title: "b", body: "…" },
    ];
    const result = visibleSteps(steps, (target) => target === "jest");
    assert.deepEqual(result.map((step) => step.title), ["start", "a"]);
  });

  it("krok bez celu zostaje nawet przy pustym ekranie", () => {
    const result = visibleSteps([{ target: null, title: "start", body: "…" }], () => false);
    assert.equal(result.length, 1);
  });
});

describe("zapamiętywanie instruktażu", () => {
  it("klucz rozdziela instruktaże i konta", () => {
    assert.notEqual(
      tourStorageKey("dashboard-teacher", "user-1"),
      tourStorageKey("dashboard-teacher", "user-2"),
    );
    assert.notEqual(
      tourStorageKey("dashboard-teacher", "user-1"),
      tourStorageKey("lesson-teacher", "user-1"),
    );
    assert.match(tourStorageKey("study", null), /anon$/);
  });
});
