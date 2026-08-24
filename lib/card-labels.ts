import type { CardType } from "./domain.ts";

export const TYPE_LABELS: Record<CardType, string> = {
  translation_sentence: "Zdanie do tłumaczenia",
  word_phrase: "Słowo / zwrot",
  pronunciation: "Wymowa / akcent",
  british: "British English",
  custom: "Inne",
};

/**
 * Etykiety dwóch głównych pól zależą od typu fiszki. W v1.2.0 były zapisane
 * jako zagnieżdżone wyrażenia warunkowe w JSX; tutaj są jedną tabelą, którą
 * da się przeczytać i przetestować.
 */
export const FIELD_LABELS: Record<CardType, { polish: string; english: string }> = {
  translation_sentence: {
    polish: "Zdanie po polsku — pytanie",
    english: "Poprawne zdanie po angielsku",
  },
  word_phrase: {
    polish: "Polskie znaczenie",
    english: "Angielskie słowo / zwrot",
  },
  pronunciation: {
    polish: "Polskie znaczenie (opcjonalnie)",
    english: "Słowo / zwrot do wymówienia",
  },
  british: {
    polish: "Polskie znaczenie",
    english: "Zwrot brytyjski",
  },
  custom: {
    polish: "Polski / odpowiedź",
    english: "Angielski / pytanie",
  },
};

export const QUICK_ADD: Array<{ type: CardType; label: string; hint: string }> = [
  { type: "translation_sentence", label: "+ Zdanie", hint: "Alt+1" },
  { type: "word_phrase", label: "+ Słowo / zwrot", hint: "Alt+2" },
  { type: "pronunciation", label: "+ Wymowa", hint: "Alt+3" },
  { type: "british", label: "+ British", hint: "Alt+4" },
];

/** Mapowanie skrótów Alt+1…Alt+4 na typy fiszek. */
export const SHORTCUT_TYPES: Record<string, CardType> = Object.fromEntries(
  QUICK_ADD.map((entry, index) => [String(index + 1), entry.type]),
);
