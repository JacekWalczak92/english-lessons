import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  decodeBase64Url,
  dedupeKey,
  localDay,
  parseWordsInput,
  readImportFromHash,
  wordAsCard,
} from "../lib/word-export-format.ts";
import { buildStudyItems } from "../lib/study.ts";

const sample = {
  format: "slownik-words",
  schemaVersion: 1,
  exportedAt: "2026-10-19T07:00:00.000Z",
  source: { app: "SlownikApp", version: "21.0" },
  words: [
    { id: 1, english: "bias", polish: "stronniczość", sourceLang: "en", kind: "word", favorite: true, lookedUpAt: "2026-10-18T19:22:05.000Z" },
    { id: 2, english: "to look forward to", polish: "czekać z niecierpliwością", sourceLang: "pl", lookedUpAt: "2026-10-18T20:00:00.000Z" },
  ],
};

/** Tak samo jak Android: Base64.URL_SAFE | NO_PADDING | NO_WRAP z UTF-8. */
function encodeLikeAndroid(text: string) {
  return Buffer.from(text, "utf8").toString("base64url");
}

describe("parseWordsInput — JSON ze Słownika", () => {
  it("czyta eksport w wersji 1", () => {
    const result = parseWordsInput(JSON.stringify(sample));
    assert.equal(result.format, "json");
    assert.equal(result.problems.length, 0);
    assert.deepEqual(result.words[0], {
      externalId: "1",
      english: "bias",
      polish: "stronniczość",
      sourceLang: "en",
      kind: "word",
      favorite: true,
      lookedUpAt: "2026-10-18T19:22:05.000Z",
    });
    assert.equal(result.words[1].sourceLang, "pl");
    assert.equal(result.words[1].kind, "sentence", "brak `kind` — zgadujemy po liczbie słów");
  });

  it("odrzuca nowszą wersję formatu zamiast zgadywać", () => {
    const result = parseWordsInput(JSON.stringify({ ...sample, schemaVersion: 2 }));
    assert.equal(result.words.length, 0);
    assert.match(result.problems[0].message, /nowszej wersji/);
  });

  it("odrzuca obcy format", () => {
    const result = parseWordsInput(JSON.stringify({ format: "coś-innego", words: [] }));
    assert.equal(result.words.length, 0);
    assert.equal(result.problems.length, 1);
  });

  it("zgłasza pozycje bez jednej ze stron i liczy powtórzenia", () => {
    const result = parseWordsInput(
      JSON.stringify({ ...sample, words: [...sample.words, { english: "BIAS ", polish: "x" }, { english: "", polish: "pusto" }] }),
    );
    assert.equal(result.words.length, 2);
    assert.equal(result.duplicates, 1);
    assert.deepEqual(result.problems.map((p) => p.line), [4]);
  });

  it("zepsuty JSON daje czytelny błąd", () => {
    const result = parseWordsInput("{ nie json");
    assert.equal(result.words.length, 0);
    assert.match(result.problems[0].message, /JSON/);
  });
});

describe("parseWordsInput — linie ze schowka", () => {
  it("czyta „angielski;polski” i tabulatory, pomija komentarze Anki", () => {
    const result = parseWordsInput("#separator:tab\nbias\tstronniczość\tslowo\nrun out;skończyć się\n\nzły wiersz");
    assert.equal(result.format, "lines");
    assert.deepEqual(result.words.map((w) => [w.english, w.polish]), [
      ["bias", "stronniczość"],
      ["run out", "skończyć się"],
    ]);
    assert.deepEqual(result.problems.map((p) => p.line), [5]);
  });

  it("pusta wklejka to nie błąd", () => {
    assert.equal(parseWordsInput("  \n ").format, "empty");
  });
});

describe("fragment adresu z telefonu", () => {
  it("odkodowuje base64url z polskimi znakami", () => {
    const json = JSON.stringify(sample);
    assert.equal(decodeBase64Url(encodeLikeAndroid(json)), json);
  });

  it("czyta `#import=` i ignoruje adres bez ładunku", () => {
    const json = JSON.stringify(sample);
    assert.equal(readImportFromHash(`#import=${encodeLikeAndroid(json)}`), json);
    assert.equal(readImportFromHash(""), null);
    assert.equal(readImportFromHash("#cos=1"), null);
  });
});

describe("pomocnicze", () => {
  it("klucz duplikatu ignoruje wielkość liter i spacje", () => {
    assert.equal(dedupeKey("  To  Look Forward "), "to look forward");
  });

  it("brak daty grupuje pod „bez daty”", () => {
    assert.equal(localDay(null), "bez daty");
    assert.equal(localDay("nie-data"), "bez daty");
  });

  it("słówko da się powtarzać tą samą logiką co fiszki z lekcji", () => {
    const card = wordAsCard({ id: "w1", english: "bias", polish: "stronniczość", kind: "word", created_at: "2026-10-19T00:00:00Z" });
    const [item] = buildStudyItems([card], { scope: "all", direction: "EN_TO_PL", context: {} });
    assert.equal(item.question, "bias");
    assert.equal(item.answer, "stronniczość");
  });
});
