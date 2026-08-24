import { FIELD_LIMITS, defaultDirection, isCardType, type CardType } from "./domain.ts";
import type { NewCardInput } from "./types.ts";

export const IMPORT_COLUMNS = "POLSKI;ANGIELSKI;TYP;NOTATKA;WYMOWA;PRZYKŁAD";

export const IMPORT_AI_PROMPT = `Przerób moje surowe notatki z lekcji angielskiego na format importu do J-Learner · English Lessons.

Zwróć WYŁĄCZNIE gotowe wiersze danych, bez nagłówka, komentarzy, numeracji ani Markdown.
Każda fiszka ma być w osobnym wierszu w formacie:
${IMPORT_COLUMNS}

Dozwolone wartości TYP:
- word_phrase — słowo albo zwrot,
- translation_sentence — całe zdanie do tłumaczenia,
- pronunciation — fiszka dotycząca wymowy,
- british — wariant British English,
- custom — tylko gdy nic innego nie pasuje.

Zasady:
1. Rozpoznaj, która część notatki jest po polsku, a która po angielsku, i ustaw zawsze POLSKI jako pierwsze pole, ANGIELSKI jako drugie.
2. Jeśli w notatce jest tylko angielski odpowiednik, dopisz naturalne polskie znaczenie.
3. Zachowuj całe zwroty i zdania — nie rozbijaj ich na pojedyncze słowa.
4. Informacje typu "(pronunciation)", "wymowa", zapis fonetyczny lub podpowiedź wymowy przenieś do pola WYMOWA i ustaw TYP=pronunciation, jeśli głównym celem wpisu jest wymowa.
5. Informacje typu "posh", "formal", dodatkowe warianty albo wyjaśnienia przenieś do NOTATKA.
6. Jeśli wpis jest pełnym zdaniem ćwiczącym tłumaczenie lub gramatykę, użyj TYP=translation_sentence. Zwykłe słowa i zwroty mają TYP=word_phrase.
7. PRZYKŁAD wypełnij tylko wtedy, gdy źródło zawiera osobne zdanie przykładowe. W przeciwnym razie zostaw puste.
8. Nie używaj średników wewnątrz pól — średnik jest wyłącznie separatorem kolumn. Jeśli potrzebujesz znaku interpunkcyjnego w treści, użyj przecinka lub myślnika.
9. Nie twórz pustych fiszek. POLSKI i ANGIELSKI muszą być wypełnione.
10. Zachowuj sens oryginalnej notatki i popraw oczywiste literówki tylko wtedy, gdy nie zmienia to znaczenia.

Przykład:
rachunek;bill;word_phrase;;;
Nie jestem pewien, że nadążam;I'm not sure I follow;translation_sentence;;;
równość;equality;pronunciation;;[ikłoliti];

Teraz przerób poniższą listę:`;

const TYPE_ALIASES: Record<string, CardType> = {
  word_phrase: "word_phrase",
  wordphrase: "word_phrase",
  word: "word_phrase",
  phrase: "word_phrase",
  slowo: "word_phrase",
  słowo: "word_phrase",
  zwrot: "word_phrase",
  translation_sentence: "translation_sentence",
  translationsentence: "translation_sentence",
  sentence: "translation_sentence",
  zdanie: "translation_sentence",
  tlumaczenie: "translation_sentence",
  tłumaczenie: "translation_sentence",
  pronunciation: "pronunciation",
  wymowa: "pronunciation",
  akcent: "pronunciation",
  british: "british",
  bre: "british",
  brytyjski: "british",
  custom: "custom",
  inne: "custom",
  other: "custom",
};

export type ImportProblem = { line: number; message: string };

export type ImportParseResult = {
  /** Fiszki gotowe do wysłania na backend. */
  cards: NewCardInput[];
  /** Wiersze odrzucone razem z powodem — pokazujemy je wszystkie naraz. */
  problems: ImportProblem[];
  /** Wiersze pominięte świadomie: nagłówek, komentarze, duplikaty. */
  skipped: number;
  /** Wiersze będące duplikatem istniejącej albo wcześniejszej fiszki. */
  duplicates: number;
};

export type ParseImportOptions = {
  /** `order_index` pierwszej nowej fiszki. */
  startOrder?: number;
  /** Istniejące fiszki — służą do wykrywania duplikatów. */
  existing?: Array<{ polish: string; english: string }>;
  /** Maksymalna liczba fiszek w jednej paczce (limit backendu). */
  maxCards?: number;
};

function normalizeKey(polish: string, english: string) {
  return `${polish.trim().toLowerCase()}\u0000${english.trim().toLowerCase()}`;
}

function normalizeType(raw: string): CardType | null {
  const key = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (!key) return "word_phrase";
  if (TYPE_ALIASES[key]) return TYPE_ALIASES[key];
  if (isCardType(key)) return key;
  return null;
}

function isHeaderRow(parts: string[]) {
  const first = parts[0]?.trim().toLowerCase() ?? "";
  const second = parts[1]?.trim().toLowerCase() ?? "";
  return (
    (first === "polski" || first === "polish" || first === "pl") &&
    (second === "angielski" || second === "english" || second === "en")
  );
}

/**
 * Parsuje listę wklejoną przez użytkownika.
 *
 * W v1.2.0 parser rzucał wyjątkiem przy pierwszym złym wierszu, więc import
 * 300 pozycji trzeba było naprawiać po jednym błędzie na próbę. Teraz zbieramy
 * wszystkie problemy naraz, a poprawne wiersze i tak są gotowe do wysłania.
 * Dodatkowo: pomijamy nagłówek i komentarze `#`, tolerujemy tabulator jako
 * separator i nie duplikujemy fiszek, które już są w lekcji.
 */
export function parseImportRows(text: string, options: ParseImportOptions = {}): ImportParseResult {
  const startOrder = options.startOrder ?? 0;
  const maxCards = options.maxCards ?? FIELD_LIMITS.import_batch;

  const seen = new Set(
    (options.existing ?? []).map((card) => normalizeKey(card.polish, card.english)),
  );

  const cards: NewCardInput[] = [];
  const problems: ImportProblem[] = [];
  let skipped = 0;
  let duplicates = 0;

  const lines = text.split(/\r?\n/);

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    const lineNumber = index + 1;

    if (!line) return;
    if (line.startsWith("#") || line.startsWith("//")) {
      skipped += 1;
      return;
    }

    // Bez średnika, ale z tabulatorami — arkusz kalkulacyjny.
    const separator = !line.includes(";") && line.includes("\t") ? "\t" : ";";
    const parts = line.split(separator).map((part) => part.trim());

    if (isHeaderRow(parts)) {
      skipped += 1;
      return;
    }

    if (parts.length < 2) {
      problems.push({ line: lineNumber, message: `oczekiwany format ${IMPORT_COLUMNS}` });
      return;
    }

    if (parts.length > 6) {
      problems.push({
        line: lineNumber,
        message: `${parts.length} kolumn zamiast 6 — prawdopodobnie średnik w treści pola`,
      });
      return;
    }

    const [polish, english, rawType = "", note = "", pronunciation = "", example = ""] = parts;

    if (!polish || !english) {
      problems.push({ line: lineNumber, message: "pola POLSKI i ANGIELSKI są wymagane" });
      return;
    }

    const cardType = normalizeType(rawType);
    if (!cardType) {
      problems.push({ line: lineNumber, message: `nieznany typ fiszki „${rawType}”` });
      return;
    }

    if (polish.length > FIELD_LIMITS.polish || english.length > FIELD_LIMITS.english) {
      problems.push({ line: lineNumber, message: "treść fiszki przekracza dozwoloną długość" });
      return;
    }

    const key = normalizeKey(polish, english);
    if (seen.has(key)) {
      duplicates += 1;
      skipped += 1;
      return;
    }
    seen.add(key);

    if (cards.length >= maxCards) {
      problems.push({
        line: lineNumber,
        message: `limit ${maxCards} fiszek na jeden import — podziel listę na części`,
      });
      return;
    }

    cards.push({
      card_type: cardType,
      review_direction: defaultDirection(cardType),
      order_index: startOrder + cards.length,
      polish,
      english,
      note: note.slice(0, FIELD_LIMITS.note),
      pronunciation: pronunciation.slice(0, FIELD_LIMITS.pronunciation),
      example: example.slice(0, FIELD_LIMITS.example),
      phonetic: "",
      british_variant: cardType === "british" ? english.slice(0, FIELD_LIMITS.british_variant) : "",
      american_variant: "",
    });
  });

  return { cards, problems, skipped, duplicates };
}

/** Krótkie podsumowanie parsowania pokazywane pod polem importu. */
export function describeImportResult(result: ImportParseResult): string {
  const parts = [`${result.cards.length} do dodania`];
  if (result.duplicates > 0) parts.push(`${result.duplicates} duplikatów pominiętych`);
  if (result.problems.length > 0) parts.push(`${result.problems.length} wierszy z błędem`);
  return parts.join(" · ");
}
