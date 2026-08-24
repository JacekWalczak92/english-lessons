# J-Learner · English Lessons v1.3.0

Wydanie refaktorowe. **Migracja SQL i format eksportu JSON są niezmienione** —
AnkiFiszki v128 działa dalej bez żadnych zmian, a baza nie wymaga nowego SQL-a.

## Naprawione błędy

- **Utrata niezapisanych zmian.** Zmiany czekające w debouncerze nie były wypychane
  przy wyjściu z edytora ani zamknięciu karty. Teraz: flush przy odmontowaniu
  komponentu, obsługa `pagehide` (usypianie karty na telefonie) i ostrzeżenie
  `beforeunload`, gdy coś jeszcze czeka w kolejce.
- **Polling nadpisywał świeższy stan lokalny.** Odpowiedź GET, która wystartowała
  przed lokalnym zapisem, potrafiła przywrócić starą treść fiszki. Dodany licznik
  mutacji i `AbortController` odrzucają nieaktualne odpowiedzi.
- **Eksport na Drive mógł zawisnąć na zawsze.** Brak `error_callback` w Google
  Identity Services powodował, że zamknięcie okienka logowania zostawiało wiszącą
  obietnicę i przycisk na stałe w stanie „Eksportuję…”.
- **Autosave po błędzie milczał.** Nieudany patch wracał do kolejki, ale nic go nie
  ponawiało — zapis stawał do następnej edycji. Dodane ponawianie z narastającym
  odstępem, stan „brak połączenia” i przycisk „Ponów zapis”.
- **Skróty Alt+1…Alt+4 wystrzeliwały przy AltGr.** Przeglądarka zgłasza AltGr jako
  Ctrl+Alt, więc skrót potrafił zadziałać podczas normalnego pisania po polsku.
  Dodatkowo `useEffect` bez tablicy zależności przepinał listener przy każdym
  renderze.
- **Import przerywał na pierwszym błędnym wierszu.** Przy liście kilkuset pozycji
  poprawiało się po jednym błędzie na próbę. Teraz parser zbiera wszystkie problemy
  naraz i pokazuje je z numerami wierszy.
- **Kopiowanie do schowka wywalało nieobsłużony wyjątek** poza kontekstem
  bezpiecznym (`navigator.clipboard` nie istnieje) — jest metoda zapasowa i komunikat.
- **Pobieranie JSON-a bywało przerywane w Firefoksie** — `revokeObjectURL`
  wykonywał się w tej samej klatce co `click()`.
- **Błędy 500 zwracały treść komunikatów Postgresa.** Teraz trafiają do logów
  serwera, a klient dostaje neutralny komunikat.
- **Nieudana walidacja paczki importu dawała mylący komunikat** o polu `cards`
  zamiast informacji, który wiersz jest zły — paczka i pojedyncza fiszka są teraz
  rozróżniane po kształcie żądania.
- **Zmiana typu fiszki kasowała świadomie wybrany kierunek powtórki.**
- Etykiety pól nie były powiązane z kontrolkami (`htmlFor`), brakowało widocznego
  fokusu klawiaturowego.

## Nowe

- **Zarządzanie tajnym linkiem.** Kolumny `share_enabled` i `share_token` istniały od
  pierwszej wersji, ale interfejs nie pozwalał ani wyłączyć udostępniania, ani
  unieważnić linku, który wyciekł. Panel „Link dla nauczyciela” robi jedno i drugie.
- **Zmiana kolejności fiszek** (`order_index` też był dotąd nieużywany w UI).
- **Podgląd importu przed wysłaniem**: licznik fiszek do dodania, pominięte duplikaty
  (także względem fiszek już w lekcji), pomijanie nagłówka i komentarzy `#`,
  tolerancja tabulatora jako separatora.
- **Tańszy polling.** Klient wysyła `?since=&count=`, a funkcja odpowiada
  `{ unchanged: true }`, gdy nic się nie zmieniło. Przy lekcji z 300 fiszkami to
  różnica między setkami kilobajtów a kilkudziesięcioma bajtami na cykl. Interwał
  wydłuża się przy bezczynności i zatrzymuje na nieaktywnej karcie.
- **Opcjonalne zawężenie CORS** przez sekret `ALLOWED_ORIGINS` w Supabase.

## Refaktor

- `components/LessonEditor.tsx`: 552 → ~230 linii. Stan i synchronizacja wyniesione
  do `lib/use-lesson.ts`, interfejs do `components/lesson/*`.
- Logika czysta wydzielona i przetestowana: `lib/import-format.ts`,
  `lib/card-labels.ts`, `lib/clipboard.ts`, `lib/use-card-shortcuts.ts`.
- Stałe domenowe w jednym miejscu (`lib/domain.ts`), z kopią dla Deno w
  `supabase/functions/_shared/domain.ts` i testem pilnującym, żeby się nie rozjechały.
- Typowany klient Supabase (`lib/database.types.ts`) zamiast `any` w każdym zapytaniu.
- `memo` na komponencie fiszki — przy 300 fiszkach każde naciśnięcie klawisza
  przerysowywało całą listę.
- 26 testów jednostkowych na `node:test`, bez nowych zależności: `npm test`.
