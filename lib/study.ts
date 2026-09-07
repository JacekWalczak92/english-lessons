import type { LessonCard, ReviewDirection } from "./types.ts";

/**
 * Logika trybu nauki. Czysta i bez Reacta, żeby dało się ją przetestować —
 * kolejka powtórek jest najłatwiejszym miejscem na cichy błąd (fiszka, która
 * znika mimo „powtórz”, albo sesja, która nigdy się nie kończy).
 */

export const STUDY_DIRECTIONS = ["card", "PL_TO_EN", "EN_TO_PL", "mixed"] as const;
export const STUDY_SCOPES = ["all", "commented", "hard"] as const;

export type StudyDirection = (typeof STUDY_DIRECTIONS)[number];
export type StudyScope = (typeof STUDY_SCOPES)[number];

/** Ile fiszek czeka, zanim wróci ta oznaczona „powtórz”. */
export const REPEAT_GAP = 4;

export type StudyItem = {
  cardId: string;
  card: LessonCard;
  direction: ReviewDirection;
  question: string;
  answer: string;
  /** Angielski tekst do przeczytania na głos (jeśli przeglądarka ma syntezator). */
  speakText: string | null;
};

export type StudyScopeContext = {
  hardCardIds?: string[];
};

/** Fiszka bez treści po którejś stronie nie nadaje się do odpytywania. */
export function isStudyable(card: LessonCard): boolean {
  if (card.card_type === "pronunciation") {
    return !!card.english.trim() && !!(card.phonetic.trim() || card.pronunciation.trim());
  }
  return !!card.english.trim() && !!card.polish.trim();
}

export function filterByScope(
  cards: LessonCard[],
  scope: StudyScope,
  context: StudyScopeContext,
): LessonCard[] {
  switch (scope) {
    case "commented":
      return cards.filter((card) => card.student_comment.trim().length > 0);
    case "hard": {
      const hard = new Set(context.hardCardIds ?? []);
      return cards.filter((card) => hard.has(card.id));
    }
    default:
      return cards;
  }
}

/**
 * Kierunek pytania. `card` bierze ustawienie z fiszki, `mixed` losuje — dzięki
 * temu da się przećwiczyć produkcję (PL → EN) nawet dla fiszek zapisanych
 * odwrotnie.
 */
export function resolveDirection(
  card: LessonCard,
  mode: StudyDirection,
  random: () => number = Math.random,
): ReviewDirection {
  if (card.card_type === "pronunciation") return "PRONUNCIATION";
  if (mode === "card") return card.review_direction === "PRONUNCIATION" ? "PL_TO_EN" : card.review_direction;
  if (mode === "mixed") return random() < 0.5 ? "PL_TO_EN" : "EN_TO_PL";
  return mode;
}

/** Angielska strona fiszki — brytyjski wariant ma pierwszeństwo przy typie `british`. */
function englishSide(card: LessonCard): string {
  if (card.card_type === "british" && card.british_variant.trim()) return card.british_variant.trim();
  return card.english.trim();
}

export function buildStudyItem(card: LessonCard, direction: ReviewDirection): StudyItem {
  const english = englishSide(card);
  const polish = card.polish.trim();

  if (direction === "PRONUNCIATION") {
    const spoken = [card.phonetic.trim(), card.pronunciation.trim()].filter(Boolean).join("  ·  ");
    return {
      cardId: card.id,
      card,
      direction,
      question: english,
      answer: spoken || polish,
      speakText: english || null,
    };
  }

  const askingForEnglish = direction === "PL_TO_EN";
  return {
    cardId: card.id,
    card,
    direction,
    question: askingForEnglish ? polish : english,
    answer: askingForEnglish ? english : polish,
    speakText: english || null,
  };
}

/** Tasowanie Fishera–Yatesa na kopii — wejściowa lista zostaje nietknięta. */
export function shuffle<T>(items: T[], random: () => number = Math.random): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function buildStudyItems(
  cards: LessonCard[],
  options: {
    scope: StudyScope;
    direction: StudyDirection;
    context: StudyScopeContext;
    shuffled?: boolean;
    random?: () => number;
  },
): StudyItem[] {
  const random = options.random ?? Math.random;
  const scoped = filterByScope(cards, options.scope, options.context).filter(isStudyable);
  const ordered = options.shuffled === false ? scoped : shuffle(scoped, random);
  return ordered.map((card) =>
    buildStudyItem(card, resolveDirection(card, options.direction, random)),
  );
}

/**
 * Kolejka sesji. „Umiem” zdejmuje fiszkę na dobre, „powtórz” odkłada ją
 * o `gap` pozycji dalej — sesja kończy się dopiero wtedy, gdy każda fiszka
 * została raz zaliczona.
 */
export function applyAnswer(queue: string[], correct: boolean, gap = REPEAT_GAP): string[] {
  if (queue.length === 0) return queue;
  const [current, ...rest] = queue;
  if (correct) return rest;
  const position = Math.min(gap, rest.length);
  return [...rest.slice(0, position), current, ...rest.slice(position)];
}

export type StudyStats = { answered: number; correct: number; again: number };

export function emptyStats(): StudyStats {
  return { answered: 0, correct: 0, again: 0 };
}

export function countStats(stats: StudyStats, correct: boolean): StudyStats {
  return {
    answered: stats.answered + 1,
    correct: stats.correct + (correct ? 1 : 0),
    again: stats.again + (correct ? 0 : 1),
  };
}
