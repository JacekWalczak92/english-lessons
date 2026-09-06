# J-Learner · English Lessons v1.6.0

Dwie zmiany w aplikacji — instruktaż przy pierwszym użyciu i jeden tryb na konto —
plus instrukcja wdrożeniowa dla szkoły w PDF (osobny plik, poza paczką z kodem).

## 1. Instruktaż z podświetlaniem

Przy pierwszym wejściu na listę lekcji, do edytora i do nauki uruchamia się
przewodnik: przyciemniony ekran, podświetlony element i dymek z opisem.

- Osobne ścieżki dla nauczyciela i dla ucznia (`lib/onboarding.ts`).
- Sterowanie: **Dalej / Wstecz / Pomiń**, strzałki, `Esc`.
- Powrót w każdej chwili przyciskiem **❔ Instrukcja** w pasku górnym.
- Stan „widziane” w `localStorage`, osobno dla każdego ekranu i konta —
  drugi użytkownik na tym samym komputerze dostanie instruktaż od nowa.
- Kroki wskazujące na nieobecny element (np. „Ucz się” w pustej lekcji) są
  pomijane, więc przewodnik nigdy nie podświetla pustego miejsca.
- Podświetlenie to jedna ramka z wielkim `box-shadow`, nie cztery nakładki —
  dzięki temu nic się nie rozjeżdża przy przewijaniu i zmianie rozmiaru okna.

## 2. Jeden tryb na konto

Rola (**uczeń** albo **nauczyciel**) jest wybierana przy rejestracji i zostaje
przypisana do konta na stałe. Przełącznik roli z v1.4.0 zniknął.

Granice są egzekwowane w bazie, nie tylko w interfejsie:

- `english_lock_profile_role` — odrzuca zmianę roli przychodzącą od zalogowanego
  użytkownika. Administrator poprawi ją z SQL Editora, gdzie `auth.uid()` jest puste.
- `english_join_lesson` — kodem dołącza wyłącznie konto ucznia.
- `english_guard_lesson_kind` — gotowe zestawy i publikacja w bibliotece tylko
  z konta nauczyciela. Uczeń dalej ma własne lekcje i kopie z biblioteki.

Wyzwalacz przy `UPDATE` odpala się tylko na realnej zmianie `lesson_kind` albo
`is_published`, więc licznik fiszek nie odpytuje bazy o rolę przy każdym imporcie.

## Migracja

```text
supabase/migrations/20260905_english_role_lock.sql
```

Idempotentna, bez zmian w danych. Konta założone wcześniej zachowują dotychczasową
rolę — jeśli któreś zostało po backfillu nauczycielem, a miało być uczniem:

```sql
update public.english_profiles set role = 'student' where user_id = '...';
```

## Zgodność

- Format eksportu JSON bez zmian — **AnkiFiszki v128 bez przeróbek**.
- Żadnych nowych zależności npm ani zmiennych środowiskowych.

## Sprawdzone przed pakowaniem

```text
npx tsc --noEmit     # bez błędów
npm test             # 73 testy, w tym nowy tests/onboarding.test.ts
npx next build       # static export: /, /dashboard, /lesson, /study, /library, /join
```
