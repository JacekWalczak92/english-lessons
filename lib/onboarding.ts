import type { AccessMode, AppRole } from "./types.ts";

/**
 * Instruktaż przy pierwszym użyciu.
 *
 * Kroki są zwykłymi danymi, a nie JSX-em, żeby dało się je przetestować i żeby
 * dopisanie kroku nie wymagało ruszania komponentu. `target` to selektor
 * atrybutu `data-tour`; krok bez celu wyświetla się na środku ekranu.
 */

export const TOUR_IDS = [
  "dashboard-teacher",
  "dashboard-student",
  "lesson-teacher",
  "lesson-student",
  "study",
] as const;

export type TourId = (typeof TOUR_IDS)[number];

export type TourStep = {
  /** Wartość atrybutu `data-tour` elementu do podświetlenia. */
  target: string | null;
  title: string;
  body: string;
};

export const TOURS: Record<TourId, TourStep[]> = {
  "dashboard-teacher": [
    {
      target: null,
      title: "Witaj w trybie nauczyciela",
      body: "Trzy ekrany: lista lekcji, edytor fiszek i nauka. Pokażę je w pół minuty — instruktaż można w każdej chwili pominąć i wrócić do niego przyciskiem „Instrukcja”.",
    },
    {
      target: "new-lesson",
      title: "Lekcja na żywo",
      body: "Tworzysz ją przed zajęciami. W trakcie lekcji dopisujesz słówka, a uczniowie dołączają kodem i dokładają własne fiszki.",
    },
    {
      target: "new-set",
      title: "Gotowy zestaw słówek",
      body: "Zestaw przygotowujesz raz i publikujesz w bibliotece. Uczniowie kopiują go na swoje konta, kiedy chcą — Twój oryginał zostaje nietknięty.",
    },
    {
      target: "lesson-row",
      title: "Kod dołączenia",
      body: "Przy lekcji widać kod w formacie ABCD-EFGH. Podajesz go uczniom na zajęciach; pełne ustawienia dostępu są w otwartej lekcji.",
    },
    {
      target: "study-button",
      title: "Nauka",
      body: "Powtórka słówek w przeglądarce — także dla Ciebie, gdy chcesz sprawdzić, jak wygląda materiał z lekcji.",
    },
    {
      target: "library",
      title: "Biblioteka",
      body: "Tu trafiają opublikowane zestawy. Zobaczysz je tak samo jak uczniowie.",
    },
  ],
  "dashboard-student": [
    {
      target: null,
      title: "Witaj w trybie ucznia",
      body: "Dołączasz do lekcji nauczyciela, dodajesz własne fiszki i powtarzasz słówka. Instruktaż możesz pominąć i wrócić do niego przyciskiem „Instrukcja”.",
    },
    {
      target: "join-code",
      title: "Kod od nauczyciela",
      body: "Wpisz tu kod z tablicy albo z wiadomości (ABCD-EFGH). Po dołączeniu lekcja pojawi się na Twojej liście.",
    },
    {
      target: "lesson-row",
      title: "Twoje lekcje",
      body: "Otwórz lekcję, żeby zobaczyć słówka nauczyciela i dopisać własne. Edytujesz tylko swoje fiszki.",
    },
    {
      target: "study-button",
      title: "Powtórka",
      body: "Nauka pyta o słówka z tej lekcji: w obie strony, z osobnym trybem „do poprawki” dla tego, co ostatnio poszło źle.",
    },
    {
      target: "library",
      title: "Biblioteka",
      body: "Gotowe zestawy od nauczycieli. „Skopiuj do moich lekcji” robi Twoją własną kopię, którą możesz edytować.",
    },
  ],
  "lesson-teacher": [
    {
      target: "quick-add",
      title: "Dodawanie fiszek",
      body: "Cztery typy fiszek pod ręką, także skrótami Alt+1…Alt+4. Zmiany zapisują się same i pojawiają u uczniów po kilku sekundach.",
    },
    {
      target: "import",
      title: "Import listy słówek",
      body: "Wklejasz gotową listę w formacie POLSKI;ANGIELSKI;TYP;… Podgląd pokaże duplikaty i błędne wiersze przed dodaniem.",
    },
    {
      target: "access",
      title: "Dostęp i uczniowie",
      body: "Kod dołączenia, widoczność fiszek między uczniami, publikacja zestawu i lista uczniów z licznikiem dodanych fiszek.",
    },
    {
      target: "toolbar",
      title: "Eksport i zakończenie",
      body: "Eksport na Twój Google Drive zasila aplikację AnkiFiszki. „Zakończ lekcję” blokuje edycję uczniom, Tobie nie.",
    },
  ],
  "lesson-student": [
    {
      target: "quick-add",
      title: "Twoje fiszki",
      body: "Dodajesz własne fiszki do tej lekcji. Słówka nauczyciela widzisz z podpisem „od nauczyciela” i ich nie zmieniasz.",
    },
    {
      target: "import",
      title: "Import listy",
      body: "Masz notatki z lekcji? Wklej je jako listę zamiast przepisywać fiszka po fiszce.",
    },
    {
      target: "toolbar",
      title: "Eksport na Twój Drive",
      body: "Eksportujesz to, co widzisz w lekcji, na swój Google Drive — stamtąd wczytasz materiał do AnkiFiszki na telefonie.",
    },
    {
      target: "study-link",
      title: "Nauka",
      body: "Powtórka słówek z tej lekcji, bez wychodzenia z aplikacji.",
    },
  ],
  study: [
    {
      target: "study-direction",
      title: "Kierunek pytania",
      body: "PL → EN ćwiczy mówienie i pisanie, EN → PL rozumienie. „Mieszany” losuje stronę przy każdej fiszce.",
    },
    {
      target: "study-scope",
      title: "Co powtarzasz",
      body: "Całą lekcję, tylko słówka nauczyciela, tylko swoje albo „do poprawki” — czyli to, co ostatnio poszło źle.",
    },
  ],
};

export function dashboardTour(role: AppRole): TourId {
  return role === "teacher" ? "dashboard-teacher" : "dashboard-student";
}

export function lessonTour(access: AccessMode): TourId {
  return access === "member" ? "lesson-student" : "lesson-teacher";
}

/**
 * Kroki wskazujące na nieobecny element (np. „Ucz się” w pustej lekcji)
 * są pomijane — instruktaż nie ma podświetlać pustego miejsca.
 */
export function visibleSteps(steps: TourStep[], hasTarget: (target: string) => boolean): TourStep[] {
  return steps.filter((step) => step.target === null || hasTarget(step.target));
}

/** Klucz w localStorage. Wersja w kluczu pozwala pokazać instruktaż po dużej zmianie. */
export const TOUR_STORAGE_VERSION = "v1";

export function tourStorageKey(tourId: TourId, userId: string | null): string {
  return `jlearner.tour.${TOUR_STORAGE_VERSION}.${tourId}.${userId ?? "anon"}`;
}
