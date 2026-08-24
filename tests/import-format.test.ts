import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describeImportResult, parseImportRows } from "../lib/import-format.ts";

describe("parseImportRows", () => {
  it("parsuje podstawowy wiersz i ustawia domyślny kierunek powtórki", () => {
    const result = parseImportRows("rachunek;bill;word_phrase;;;");
    assert.equal(result.problems.length, 0);
    assert.equal(result.cards.length, 1);
    assert.deepEqual(
      {
        polish: result.cards[0].polish,
        english: result.cards[0].english,
        type: result.cards[0].card_type,
        direction: result.cards[0].review_direction,
      },
      { polish: "rachunek", english: "bill", type: "word_phrase", direction: "PL_TO_EN" },
    );
  });

  it("numeruje fiszki od podanego order_index", () => {
    const result = parseImportRows("a;b;;;;\nc;d;;;;", { startOrder: 7 });
    assert.deepEqual(
      result.cards.map((card) => card.order_index),
      [7, 8],
    );
  });

  it("zbiera wszystkie błędne wiersze zamiast przerywać na pierwszym", () => {
    const result = parseImportRows(["ok;fine;;;;", "brak_drugiego_pola", ";pusty;;;;"].join("\n"));
    assert.equal(result.cards.length, 1);
    assert.deepEqual(
      result.problems.map((problem) => problem.line),
      [2, 3],
    );
  });

  it("pomija nagłówek, puste linie i komentarze", () => {
    const text = ["POLSKI;ANGIELSKI;TYP;NOTATKA;WYMOWA;PRZYKŁAD", "", "# komentarz", "a;b;;;;"].join(
      "\n",
    );
    const result = parseImportRows(text);
    assert.equal(result.cards.length, 1);
    assert.equal(result.problems.length, 0);
    assert.equal(result.skipped, 2);
  });

  it("wykrywa duplikaty względem istniejących fiszek i wewnątrz wklejki", () => {
    const result = parseImportRows("Rachunek;Bill;;;;\nrachunek;bill;;;;\nnowe;new;;;;", {
      existing: [{ polish: "rachunek", english: "bill" }],
    });
    assert.equal(result.cards.length, 1);
    assert.equal(result.cards[0].english, "new");
    assert.equal(result.duplicates, 2);
  });

  it("rozpoznaje aliasy typów i odrzuca nieznane", () => {
    const result = parseImportRows(["a;b;zdanie;;;", "c;d;WYMOWA;;;", "e;f;bzdura;;;"].join("\n"));
    assert.deepEqual(
      result.cards.map((card) => card.card_type),
      ["translation_sentence", "pronunciation"],
    );
    assert.equal(result.problems.length, 1);
    assert.match(result.problems[0].message, /nieznany typ/);
  });

  it("ustawia PRONUNCIATION jako kierunek dla fiszek wymowy", () => {
    const result = parseImportRows("równość;equality;pronunciation;;[ikłoliti];");
    assert.equal(result.cards[0].review_direction, "PRONUNCIATION");
    assert.equal(result.cards[0].pronunciation, "[ikłoliti]");
  });

  it("kopiuje angielski do british_variant dla typu british", () => {
    const result = parseImportRows("winda;lift;british;;;");
    assert.equal(result.cards[0].british_variant, "lift");
  });

  it("odrzuca wiersz z nadmiarową liczbą kolumn zamiast obcinać dane", () => {
    const result = parseImportRows("a;b;word_phrase;nota;wym;przyk;nadmiar");
    assert.equal(result.cards.length, 0);
    assert.match(result.problems[0].message, /kolumn/);
  });

  it("obsługuje tabulator jako separator (wklejka z arkusza)", () => {
    const result = parseImportRows("rachunek\tbill\tword_phrase");
    assert.equal(result.cards.length, 1);
    assert.equal(result.cards[0].english, "bill");
  });

  it("pilnuje limitu paczki", () => {
    const text = Array.from({ length: 5 }, (_, i) => `pl${i};en${i};;;;`).join("\n");
    const result = parseImportRows(text, { maxCards: 3 });
    assert.equal(result.cards.length, 3);
    assert.equal(result.problems.length, 2);
  });

  it("podsumowanie wymienia duplikaty i błędy", () => {
    const result = parseImportRows("a;b;;;;\nzly_wiersz\na;b;;;;");
    assert.equal(describeImportResult(result), "1 do dodania · 1 duplikatów pominiętych · 1 wierszy z błędem");
  });
});
