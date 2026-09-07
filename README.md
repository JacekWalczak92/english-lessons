# J-Learner · English Lessons v1.7.0 — GitHub Pages edition

Statyczna miniaplikacja do fiszek z lekcji angielskiego.
Frontend jest publikowany na **GitHub Pages**, dane są trzymane w **Supabase**, a dostęp obsługuje **Supabase Edge Function**. Eksport lekcji na Google Drive pozostaje zgodny z importerem AnkiFiszki v128.

## Jak to działa od v1.7.0

1. **Uczeń zakłada lekcję** i wybiera nauczyciela z listy kont w systemie. Pisze przy tym, czego potrzebuje.
2. **Lekcja pojawia się w panelu nauczyciela**, który wypełnia ją słówkami — sam albo importem listy.
3. **Uczeń dopisuje komentarz** pod każdą fiszką: skojarzenie, kontekst z zajęć, wątpliwość.
4. Obie strony powtarzają materiał w trybie nauki i eksportują go na **swój** Google Drive.

Nie ma już kodów dołączenia ani tajnych linków — dostęp wynika wyłącznie z konta.

## Instruktaż przy pierwszym użyciu

Przy pierwszym wejściu na listę lekcji, do edytora i do nauki uruchamia się
krótki instruktaż: przyciemniony ekran, podświetlony element i dymek z opisem.
Kroki są inne dla nauczyciela i dla ucznia.

- Sterowanie: **Dalej / Wstecz / Pomiń**, strzałki i `Esc`.
- „Widziane” zapisuje się w `localStorage` osobno dla każdego ekranu i konta,
  więc drugi użytkownik na tym samym komputerze zobaczy instruktaż od nowa.
- Wrócić do niego można w każdej chwili przyciskiem **❔ Instrukcja** w pasku górnym.
- Kroki wskazujące na element, którego akurat nie ma (np. „Ucz się” w pustej
  lekcji), są pomijane — instruktaż nie podświetla pustego miejsca.

Treść kroków siedzi w `lib/onboarding.ts` jako zwykłe dane, więc dopisanie kroku
nie wymaga ruszania komponentu. Sam dymek i podświetlenie są w
`components/onboarding/TourOverlay.tsx`.

## Nauka słówek w przeglądarce

Przycisk **🎓 Ucz się** (lista lekcji i edytor) otwiera `/study/?id=…` — powtórkę
słówek z tej jednej lekcji, bez wychodzenia z aplikacji.

- **Kierunek:** jak na fiszce, PL → EN, EN → PL albo mieszany. Fiszki typu
  „wymowa” zawsze pytają o wymowę i pokazują zapis fonetyczny.
- **Zakres:** wszystkie słówka, tylko od nauczyciela, tylko moje, albo
  „do poprawki” (to, co ostatnio poszło źle).
- **Sesja:** „Umiem” zdejmuje fiszkę, „Powtórz” odkłada ją o kilka pozycji dalej —
  sesja kończy się dopiero, gdy każde słówko zostało raz zaliczone. Na końcu jest
  podsumowanie z listą wpadek i przyciskiem „Tylko trudne”.
- **Klawiatura:** spacja odsłania odpowiedź i zalicza, `1` = powtórz, `2` = umiem.
- **Wymowa:** przycisk 🔊 czyta angielską stronę fiszki (Web Speech API, jeśli
  przeglądarka je ma).

Postęp nauki siedzi w `localStorage` tej przeglądarki, nie w bazie. Pełny SRS
z algorytmem SM-2 zostaje po stronie AnkiFiszki na Androidzie — web ma być szybką
powtórką przed lekcją i po niej, a nie drugim, konkurencyjnym systemem powtórek.
Logika sesji siedzi w `lib/study.ts` i jest pokryta testami w `tests/study.test.ts`.

## Role i tryby dostępu

**Konto ma jeden tryb na stałe.** Rolę wybiera się przy rejestracji i nie da się
jej przełączyć w aplikacji; kto potrzebuje obu, zakłada drugie konto. Pilnują tego
trzy rzeczy naraz: interfejs (brak przełącznika), wyzwalacz `english_lock_profile_role`
(odrzuca zmianę roli przychodzącą od zalogowanego użytkownika) oraz
`english_guard_lesson_kind` (zestawy i publikacja tylko z konta nauczyciela).
Administrator poprawi rolę z SQL Editora — tam `auth.uid()` jest puste:

```sql
update public.english_profiles set role = 'student' where user_id = '...';
```

| Kto | Co robi w lekcji | Czego nie może |
| --- | --- | --- |
| Uczeń (właściciel lekcji) | zakłada lekcję, wybiera nauczyciela, opisuje potrzeby, pisze **komentarz ucznia** pod każdą fiszką, uczy się i eksportuje na swój Drive | nie dodaje, nie edytuje i nie usuwa fiszek |
| Nauczyciel (przypisany) | wypełnia fiszki, importuje listy słówek, czyta prośbę i komentarze ucznia, kończy lekcję | nie zmienia przypisania ani nie usuwa cudzej lekcji |
| Nauczyciel (własne lekcje i zestawy) | wszystko powyżej we własnych lekcjach, publikuje zestawy w bibliotece | — |

Podział jest egzekwowany w Edge Function, nie tylko w interfejsie: patch fiszki
od konta ucznia przechodzi przez osobny schemat walidacji, który dopuszcza
wyłącznie pole `student_comment`.

Konto nauczyciela nie zamawia lekcji u innego nauczyciela, a konto ucznia nie
tworzy zestawów do biblioteki — obie granice pilnują wyzwalacze w bazie.

Uczeń edytuje i usuwa wyłącznie fiszki, których jest autorem — pilnuje tego
Edge Function, a interfejs korzysta z tych samych funkcji z `lib/domain.ts`,
żeby nie pokazywać pól, których zapis i tak zostałby odrzucony.

### Przypisanie nauczyciela

Uczeń wybiera nauczyciela z listy na swoim panelu. Na liście są konta z rolą
`teacher`, które mają włączone **Przyjmuję nowych uczniów** — nauczyciel może się
z niej wypisać, a przypisane wcześniej lekcje zostają. Przypisanie sprawdza
wyzwalacz `english_guard_assignment`: lekcję da się przypisać tylko istniejącemu
kontu nauczyciela i nie samemu sobie.

### Gotowe zestawy i biblioteka

Przycisk **+ Nowy zestaw słówek** tworzy lekcję typu `set`. Po włączeniu
**Opublikuj zestaw** widać go w zakładce **Biblioteka**. Uczeń robi tam własną
kopię — z prawem do edycji i eksportu — a oryginał nauczyciela zostaje nietknięty.

## Instruktaż przy pierwszym użyciu

Przy pierwszym wejściu na listę lekcji, do edytora i do nauki uruchamia się
krótki instruktaż: przyciemniony ekran, podświetlony element i dymek z opisem.
Kroki są inne dla nauczyciela i dla ucznia.

- Sterowanie: **Dalej / Wstecz / Pomiń**, strzałki i `Esc`.
- „Widziane” zapisuje się w `localStorage` osobno dla każdego ekranu i konta,
  więc drugi użytkownik na tym samym komputerze zobaczy instruktaż od nowa.
- Wrócić do niego można w każdej chwili przyciskiem **❔ Instrukcja** w pasku górnym.
- Kroki wskazujące na element, którego akurat nie ma (np. „Ucz się” w pustej
  lekcji), są pomijane — instruktaż nie podświetla pustego miejsca.

Treść kroków siedzi w `lib/onboarding.ts` jako zwykłe dane, więc dopisanie kroku
nie wymaga ruszania komponentu. Sam dymek i podświetlenie są w
`components/onboarding/TourOverlay.tsx`.

## Nauka słówek w przeglądarce

Przycisk **🎓 Ucz się** (lista lekcji i edytor) otwiera `/study/?id=…` — powtórkę
słówek z tej jednej lekcji, bez wychodzenia z aplikacji.

- **Kierunek:** jak na fiszce, PL → EN, EN → PL albo mieszany. Fiszki typu
  „wymowa” zawsze pytają o wymowę i pokazują zapis fonetyczny.
- **Zakres:** wszystkie słówka, tylko od nauczyciela, tylko moje, albo
  „do poprawki” (to, co ostatnio poszło źle).
- **Sesja:** „Umiem” zdejmuje fiszkę, „Powtórz” odkłada ją o kilka pozycji dalej —
  sesja kończy się dopiero, gdy każde słówko zostało raz zaliczone. Na końcu jest
  podsumowanie z listą wpadek i przyciskiem „Tylko trudne”.
- **Klawiatura:** spacja odsłania odpowiedź i zalicza, `1` = powtórz, `2` = umiem.
- **Wymowa:** przycisk 🔊 czyta angielską stronę fiszki (Web Speech API, jeśli
  przeglądarka je ma).

Postęp nauki siedzi w `localStorage` tej przeglądarki, nie w bazie. Pełny SRS
z algorytmem SM-2 zostaje po stronie AnkiFiszki na Androidzie — web ma być szybką
powtórką przed lekcją i po niej, a nie drugim, konkurencyjnym systemem powtórek.
Logika sesji siedzi w `lib/study.ts` i jest pokryta testami w `tests/study.test.ts`.

## Role i tryby dostępu

**Konto ma jeden tryb na stałe.** Rolę wybiera się przy rejestracji i nie da się
jej przełączyć w aplikacji; kto potrzebuje obu, zakłada drugie konto. Pilnują tego
trzy rzeczy naraz: interfejs (brak przełącznika), wyzwalacz `english_lock_profile_role`
(odrzuca zmianę roli przychodzącą od zalogowanego użytkownika) oraz
`english_guard_lesson_kind` (zestawy i publikacja tylko z konta nauczyciela).
Administrator poprawi rolę z SQL Editora — tam `auth.uid()` jest puste:

```sql
update public.english_profiles set role = 'student' where user_id = '...';
```

| Kto | Co robi w lekcji | Czego nie może |
| --- | --- | --- |
| Uczeń (właściciel lekcji) | zakłada lekcję, wybiera nauczyciela, opisuje potrzeby, pisze **komentarz ucznia** pod każdą fiszką, uczy się i eksportuje na swój Drive | nie dodaje, nie edytuje i nie usuwa fiszek |
| Nauczyciel (przypisany) | wypełnia fiszki, importuje listy słówek, czyta prośbę i komentarze ucznia, kończy lekcję | nie zmienia przypisania ani nie usuwa cudzej lekcji |
| Nauczyciel (własne lekcje i zestawy) | wszystko powyżej we własnych lekcjach, publikuje zestawy w bibliotece | — |

Podział jest egzekwowany w Edge Function, nie tylko w interfejsie: patch fiszki
od konta ucznia przechodzi przez osobny schemat walidacji, który dopuszcza
wyłącznie pole `student_comment`.

Konto nauczyciela nie zamawia lekcji u innego nauczyciela, a konto ucznia nie
tworzy zestawów do biblioteki — obie granice pilnują wyzwalacze w bazie.

Uczeń edytuje i usuwa wyłącznie fiszki, których jest autorem — pilnuje tego
Edge Function, a interfejs korzysta z tych samych funkcji z `lib/domain.ts`,
żeby nie pokazywać pól, których zapis i tak zostałby odrzucony.

### Przypisanie nauczyciela

Uczeń wybiera nauczyciela z listy na swoim panelu. Na liście są konta z rolą
`teacher`, które mają włączone **Przyjmuję nowych uczniów** — nauczyciel może się
z niej wypisać, a przypisane wcześniej lekcje zostają. Przypisanie sprawdza
wyzwalacz `english_guard_assignment`: lekcję da się przypisać tylko istniejącemu
kontu nauczyciela i nie samemu sobie.

### Gotowe zestawy i biblioteka

Przycisk **+ Nowy zestaw słówek** tworzy lekcję typu `set`. Po włączeniu
**Opublikuj zestaw** widać go w zakładce **Biblioteka**. Uczeń robi tam własną
kopię — z prawem do edycji i eksportu — a oryginał nauczyciela zostaje nietknięty.

### Widoczność fiszek

Przełącznik **Uczniowie widzą nawzajem swoje fiszki** decyduje, czy lekcja jest
wspólnym brudnopisem, czy każdy pracuje na swoim. Nauczyciel widzi wszystko
niezależnie od ustawienia.

## Architektura

```text
GitHub Pages (Next.js static export)
          │
          ├── konta (nauczyciel / uczeń): Supabase Auth + RLS + english_profiles
          │
          ├── lista lekcji, katalog nauczycieli, biblioteka ──> PostgREST + RPC
          │        english_copy_lesson()
          │
          ├── edytor lekcji ──> Supabase Edge Function
          │                       └── JWT właściciela lekcji | JWT przypisanego
          │                           nauczyciela (nic poza tym)
          │
          └── Google Drive OAuth (drive.file) — osobny plik dla każdego konta
                    │
                    └── J-Learner/EnglishLessons/*.json
                                   │
                                   └── AnkiFiszki v128
```

## Co zmieniło się względem wersji Vercel

- `next.config.ts` ma `output: "export"`.
- Nie ma `app/api/*` ani sekretu Supabase w Next.js.
- Trasa lekcji jest statyczna: `/lesson/?id=<uuid>`.
- Backend dostępu do lekcji jest w `supabase/functions/english-lesson-api/`.
- `.github/workflows/deploy-pages.yml` publikuje frontend.
- `.github/workflows/deploy-supabase-function.yml` publikuje Edge Function.
- `NEXT_PUBLIC_BASE_PATH` jest ustawiany automatycznie dla repo typu `username.github.io/nazwa-repo`.

## Struktura kodu

```text
app/            trasy Next.js (logowanie, lista lekcji, edytor, nauka, biblioteka)
components/     Field, components/dashboard/* (lista lekcji, wybór nauczyciela),
                components/lesson/* (nagłówek, fiszka, import, prośba ucznia, pasek narzędzi),
                components/study/* (sesja powtórki),
                components/onboarding/* (instruktaż z podświetleniem)
lib/            domena i reguły dostępu, typy, klient API, konta (account.ts),
                autosave (use-lesson.ts), nauka (study.ts, study-progress.ts),
                instruktaż (onboarding.ts, use-tour.ts), Google Drive
supabase/       migracje SQL + Edge Function (_shared/domain.ts to kopia lib/domain.ts)
tests/          testy jednostkowe na node:test
```

Stan edytora — pobieranie, polling, kolejka autosave i ponawianie — mieszka w
`lib/use-lesson.ts`. Komponenty tylko go konsumują.

## Testy

```bash
npm run check     # tsc --noEmit + testy jednostkowe
npm test          # same testy (node:test, bez dodatkowych zależności)
```

Test `tests/domain-sync.test.ts` porównuje `lib/domain.ts` z kopią dla Deno w
`supabase/functions/_shared/domain.ts` — zarówno listy wartości, jak i treść
funkcji uprawnień. Dodanie typu fiszki albo poluzowanie reguły dostępu po jednej
stronie bez drugiej wywali build, zanim rozjazd trafi na produkcję.
`tests/permissions.test.ts` sprawdza same reguły: co widzi uczeń, czego nie
ruszy i co się zmienia po zakończeniu lekcji.

## 1. Supabase — baza danych

Uruchom w **Supabase → SQL Editor**, w tej kolejności:

```text
supabase/migrations/20260824_english_lessons.sql          # jeśli jeszcze nie było
supabase/migrations/20260904_english_lessons_accounts.sql # konta, kody, biblioteka
supabase/migrations/20260905_english_role_lock.sql        # jeden tryb na konto
supabase/migrations/20260906_english_assignments.sql     # nowość v1.7.0
```

Pierwsza migracja tworzy `english_lessons`, `english_lesson_cards`, RLS i triggery `updated_at`.

Druga dokłada:

- `english_profiles` — rola konta (`teacher` / `student`) i imię widoczne przy fiszkach,
- `english_lesson_members` — zapisy uczniów na lekcje i ich stan eksportu na Drive,
- `english_lesson_cards.author_id` — autor fiszki,
- publikację zestawów i licznik fiszek,
- funkcję `english_copy_lesson(id)` (kod dołączenia z tej migracji wycofuje v1.7.0).

Trzecia przypina rolę do konta na stałe i pilnuje, co wolno w danym trybie.

Czwarta wprowadza model z v1.7.0: katalog nauczycieli (`accepting_students`),
`assigned_teacher_id` i `student_request` w lekcji, `student_comment` w fiszce,
osobną tabelę `english_lesson_exports` na stan eksportu każdego konta.
Przenosi też dotychczasowe zapisy kodem — każdy uczeń dostaje własną lekcję
przypisaną swojemu nauczycielowi razem z kopią fiszek — i wyłącza kody oraz
tajne linki w danych. Funkcja `english_join_lesson` jest usuwana.

Migracje są idempotentne. **Konta założone przed v1.4.0 dostają rolę
nauczyciela** — rolę zmienisz w aplikacji (lista lekcji, selektor obok nazwy konta)
albo ręcznie:

```sql
update public.english_profiles set role = 'student' where user_id = '...';
```

## 2. GitHub — utwórz repo

Wrzuć **zawartość tego folderu** do repozytorium, np.:

```text
english-lessons
```

Przy zwykłym repo adres będzie miał postać:

```text
https://TWOJ_LOGIN.github.io/english-lessons/
```

Jeśli repo nazywa się dokładnie `TWOJ_LOGIN.github.io`, aplikacja zostanie opublikowana pod domeną główną bez `/english-lessons`.

W **Settings → Pages → Build and deployment → Source** wybierz **GitHub Actions**.

## 3. GitHub — Repository variables

W **Settings → Secrets and variables → Actions → Variables** dodaj:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
NEXT_PUBLIC_GOOGLE_CLIENT_ID
```

To są wartości używane w przeglądarce, więc nie są sekretami serwerowymi.

Przykład URL Supabase:

```text
https://YOUR_PROJECT_REF.supabase.co
```

## 4. GitHub — sekrety do wdrażania Edge Function

W **Settings → Secrets and variables → Actions → Secrets** dodaj:

```text
SUPABASE_ACCESS_TOKEN
SUPABASE_PROJECT_ID
```

`SUPABASE_PROJECT_ID` to project ref z adresu projektu Supabase.

`SUPABASE_ACCESS_TOKEN` utwórz jako osobisty token dla Supabase CLI. Jest używany wyłącznie przez GitHub Actions do wdrożenia funkcji; nie trafia do frontendu.

Po pushu do `main` workflow `Deploy Supabase Edge Function` wdroży:

```text
english-lesson-api
```

Funkcja ma `verify_jwt = false` (ustawienie z wcześniejszych wersji), ale sama **nie wpuszcza anonimowych wywołań**: bez JWT właściciela lekcji albo przypisanego nauczyciela zwraca 401. Stare linki z `?key=` przestały cokolwiek otwierać.

## 5. Supabase Auth — adres strony

Po pierwszym wdrożeniu ustaw w **Supabase Auth → URL Configuration**:

```text
Site URL:
https://TWOJ_LOGIN.github.io/english-lessons/
```

oraz dodaj ten sam adres do dozwolonych Redirect URLs.

Jeżeli używasz repo `TWOJ_LOGIN.github.io`, wpisz:

```text
https://TWOJ_LOGIN.github.io/
```

## 6. Google Drive OAuth

W Google Cloud:

1. Włącz **Google Drive API**.
2. Utwórz OAuth Client typu **Web application**.
3. W **Authorized JavaScript origins** dodaj tylko origin, bez ścieżki repo:

```text
https://TWOJ_LOGIN.github.io
```

4. Client ID wpisz jako GitHub Variable `NEXT_PUBLIC_GOOGLE_CLIENT_ID`.

Aplikacja używa zakresu:

```text
https://www.googleapis.com/auth/drive.file
```

Nie potrzebuje Google client secret.

## 7. Publikacja

Push do `main` uruchamia:

- **Deploy GitHub Pages** — typowanie, `next build`, statyczny export `out/`, publikacja Pages;
- **Deploy Supabase Edge Function** — tylko gdy zmieni się funkcja/config Supabase (albo ręcznie przez `workflow_dispatch`).

## 8. Lokalnie

Skopiuj `.env.example` do `.env.local` i uzupełnij trzy publiczne wartości:

```bash
cp .env.example .env.local
npm install
npm run dev
```

Lokalnie `NEXT_PUBLIC_BASE_PATH` zostaw pusty.


## Import słówek

W edytorze lekcji dostępny jest przycisk **Importuj słówka**. Import przyjmuje wiele fiszek naraz w formacie:

```text
POLSKI;ANGIELSKI;TYP;NOTATKA;WYMOWA;PRZYKŁAD
```

Przed wysłaniem widać podgląd: ile fiszek zostanie dodanych, ile duplikatów
pominięto i które wiersze mają błąd (wszystkie naraz, z numerami linii). Pomijane
są nagłówek, puste linie i komentarze `#`; jako separator działa też tabulator,
więc wklejka z arkusza kalkulacyjnego przechodzi bez konwersji.

Przycisk **Pokaż prompt AI** / **Kopiuj prompt** daje gotowy prompt do
przekształcania surowych notatek z lekcji na ten format. Przykładowa lista jest
w `import_examples/stara_lekcja_gotowa_do_importu.txt`.

## Format i Android

Format JSON nie zmienił się względem poprzedniej wersji. Przygotowany wcześniej **AnkiFiszki v128** nie wymaga kolejnej zmiany i nadal importuje pliki z:

```text
J-Learner/EnglishLessons/
```

Ponowny import tej samej lekcji aktualizuje treść bez resetowania postępu SM-2.

## Eksport na Drive przy wielu kontach

Stan eksportu jest per konto i trzymany w `english_lesson_exports`: nauczyciel ma
swój plik na swoim Drive, uczeń własny na swoim. Komentarz ucznia jedzie razem
z fiszką — dopisujemy go do pola `note`, żeby nie zmieniać `schemaVersion: 1`,
które jest kontraktem z importerem AnkiFiszki.

## Ważne bezpieczeństwo

Do repozytorium i do `NEXT_PUBLIC_*` **nie wkładaj** `sb_secret_...`, `service_role` ani innych kluczy administracyjnych Supabase. Edge Function korzysta z wbudowanego `SUPABASE_SERVICE_ROLE_KEY` po stronie Supabase i ten klucz nigdy nie jest wysyłany do GitHub Pages.

Opcjonalnie możesz zawęzić CORS Edge Function do własnej domeny. W **Supabase →
Edge Functions → Secrets** ustaw:

```text
ALLOWED_ORIGINS=https://TWOJ_LOGIN.github.io
```

Bez tego sekretu funkcja odpowiada z `Access-Control-Allow-Origin: *` (jak dotąd);
dostępu i tak pilnuje JWT właściciela lekcji albo przypisanego nauczyciela.
