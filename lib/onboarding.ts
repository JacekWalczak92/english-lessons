import type { AppRole } from "./types.ts";

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
      title: "Witaj w panelu nauczyciela",
      body: "Uczniowie przypisują Ci lekcje, a Ty je wypełniasz słówkami. Pokażę ekran w pół minuty — instruktaż można pominąć i wrócić do niego przyciskiem „Instrukcja”.",
    },
    {
      target: "availability",
      title: "Widoczność na liście",
      body: "Dopóki przyjmujesz uczniów, widzą Cię przy zakładaniu lekcji. Po wyłączeniu znikasz z listy, ale przypisane lekcje zostają.",
    },
    {
      target: "lesson-row",
      title: "Lekcje od uczniów",
      body: "Każda pozycja to prośba konkretnego ucznia. Otwórz ją, przeczytaj, czego potrzebuje, i wypełnij fiszkami.",
    },
    {
      target: "new-lesson",
      title: "Własna lekcja",
      body: "Materiał przygotowany bez konkretnego ucznia — na przykład szkic na najbliższe zajęcia.",
    },
    {
      target: "new-set",
      title: "Gotowy zestaw słówek",
      body: "Zestaw przygotowujesz raz i publikujesz w bibliotece. Uczniowie kopiują go na swoje konta, kiedy chcą.",
    },
    {
      target: "library",
      title: "Biblioteka",
      body: "Tu trafiają opublikowane zestawy — Twoje i innych nauczycieli.",
    },
  ],
  "dashboard-student": [
    {
      target: null,
      title: "Witaj w trybie ucznia",
      body: "Zakładasz lekcję i przypisujesz ją nauczycielowi, on wypełnia ją słówkami, a Ty dopisujesz komentarze i powtarzasz materiał.",
    },
    {
      target: "new-lesson",
      title: "Wybierz nauczyciela",
      body: "Nauczyciel z listy dostanie tę lekcję w swoim panelu. W polu „Czego potrzebujesz” napisz, co ma być na zajęciach.",
    },
    {
      target: "lesson-row",
      title: "Twoje lekcje",
      body: "„Czeka na nauczyciela” znaczy, że fiszek jeszcze nie ma. Gdy się pojawią, otwórz lekcję i dopisz swoje komentarze.",
    },
    {
      target: "study-button",
      title: "Powtórka",
      body: "Nauka pyta o słówka z lekcji: w obie strony, z osobnym trybem „do poprawki” dla tego, co ostatnio poszło źle.",
    },
    {
      target: "library",
      title: "Biblioteka",
      body: "Gotowe zestawy od nauczycieli. „Skopiuj do moich lekcji” robi Twoją własną kopię do nauki.",
    },
    {
      target: "my-words",
      title: "Moje słówka",
      body: "Słówka wyszukane w aplikacji J-Learner Vocabulary na telefonie. Wyślij je z telefonu przyciskiem „Wyślij do J-Learner” i powtarzaj tutaj.",
    },
  ],
  "lesson-teacher": [
    {
      target: "student-request",
      title: "Prośba ucznia",
      body: "Zanim zaczniesz wypełniać, sprawdź, czego uczeń oczekuje od tej lekcji.",
    },
    {
      target: "quick-add",
      title: "Dodawanie fiszek",
      body: "Cztery typy fiszek pod ręką, także skrótami Alt+1…Alt+4. Zmiany zapisują się same i pojawiają u ucznia po kilku sekundach.",
    },
    {
      target: "import",
      title: "Import listy słówek",
      body: "Wklejasz gotową listę w formacie POLSKI;ANGIELSKI;TYP;… Podgląd pokaże duplikaty i błędne wiersze przed dodaniem.",
    },
    {
      target: "toolbar",
      title: "Eksport i zakończenie",
      body: "Eksport na Twój Google Drive zasila aplikację AnkiFiszki. „Zakończ lekcję” zamyka edycję obu stronom.",
    },
  ],
  "lesson-student": [
    {
      target: "student-request",
      title: "Czego potrzebujesz",
      body: "Napisz tu, co ma być na lekcji. Nauczyciel przeczyta to przed przygotowaniem fiszek.",
    },
    {
      target: "student-comment-hint",
      title: "Podział ról",
      body: "Treść fiszek wypełnia nauczyciel. Twoje miejsce to pole „Komentarz ucznia” pod każdą fiszką — skojarzenia, kontekst, wątpliwości.",
    },
    {
      target: "toolbar",
      title: "Eksport na Twój Drive",
      body: "Eksportujesz lekcję na swój Google Drive — stamtąd wczytasz materiał do AnkiFiszki na telefonie. Komentarz jedzie razem z fiszką.",
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
      body: "Całą lekcję, tylko fiszki z Twoim komentarzem albo „do poprawki” — czyli to, co ostatnio poszło źle.",
    },
  ],
};

export function dashboardTour(role: AppRole): TourId {
  return role === "teacher" ? "dashboard-teacher" : "dashboard-student";
}

export function lessonTour(role: AppRole): TourId {
  return role === "student" ? "lesson-student" : "lesson-teacher";
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
