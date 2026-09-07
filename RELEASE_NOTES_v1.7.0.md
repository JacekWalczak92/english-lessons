# J-Learner · English Lessons v1.7.0

Zmiana modelu pracy: koniec z kodami i linkami, jasny podział ról w lekcji.

## 1. Uczeń przypisuje lekcję nauczycielowi

- Na panelu ucznia jest formularz **Nowa lekcja z nauczycielem**: wybór nauczyciela
  z listy kont w systemie, temat, data i pole „czego potrzebuję”.
- Lekcja od razu pojawia się w panelu tego nauczyciela, w sekcji
  **Lekcje przypisane przez uczniów**, razem z imieniem ucznia.
- Nauczyciel steruje swoją widocznością przełącznikiem **Przyjmuję nowych uczniów**.
  Po wyłączeniu znika z listy wyboru, ale przypisane lekcje zostają.
- **Zniknęły kody dołączenia i tajne linki.** Adres lekcji to samo `?id=`,
  a dostęp wynika z konta: właściciel lekcji albo przypisany nauczyciel.
  Stary link z `?key=` dostaje teraz 401.

Przypisania pilnuje baza: `english_guard_assignment` odrzuca przypisanie do konta,
które nie jest nauczycielem, oraz przypisanie lekcji samemu sobie.

## 2. Nauczyciel wypełnia, uczeń komentuje

- Fiszki — treść, typy, import listy, kolejność, usuwanie — należą wyłącznie
  do nauczyciela. Uczeń nie widzi paska dodawania, tylko wyjaśnienie podziału ról.
- Każda fiszka ma nowe pole **Komentarz ucznia**: skojarzenie, kontekst z zajęć,
  wątpliwość. Uczeń je wypełnia, nauczyciel widzi je przy fiszce (i tylko czyta).
- To nie jest wyłącznie filtr w interfejsie: patch fiszki od konta ucznia
  przechodzi w Edge Function przez osobny schemat, który dopuszcza jedno pole.
  Żądanie z `english` odbija się błędem walidacji zamiast cichego „zapisano”.
- Komentarze wchodzą do trybu nauki: zakres **„Z moim komentarzem”** i komentarz
  pokazywany po odsłonięciu odpowiedzi.
- W eksporcie komentarz dopisujemy do pola `note`, a nie jako nowy klucz JSON —
  `schemaVersion: 1` jest kontraktem z importerem **AnkiFiszki v128** i nowe pole
  mogłoby wysadzić parser po tamtej stronie.

Instruktaż przy pierwszym użyciu został przepisany pod nowe ekrany: uczeń dostaje
kroki o wyborze nauczyciela i komentarzu, nauczyciel — o lekcjach od uczniów.

## Migracja

```text
supabase/migrations/20260906_english_assignments.sql
```

Idempotentna. Dokłada `accepting_students` w profilu, `assigned_teacher_id`,
`assigned_at` i `student_request` w lekcji, `student_comment` w fiszce oraz
tabelę `english_lesson_exports` (stan eksportu każdego konta, przeniesiony
z lekcji i z członkostw).

**Dane z v1.4–v1.6 są przenoszone automatycznie:** każdy uczeń zapisany kodem na
lekcję dostaje własną lekcję przypisaną temu samemu nauczycielowi, razem z kopią
fiszek. Lekcja nauczyciela zostaje jego. Kody i tajne linki są wyłączane w danych,
a funkcja `english_join_lesson` usuwana.

Tabela `english_lesson_members` nie jest już używana przez aplikację. Migracja jej
nie kasuje — po sprawdzeniu, że wszystko działa, możesz usunąć ją ręcznie:

```sql
drop table if exists public.english_lesson_members;
```

## Zgodność

- Format eksportu JSON bez zmian — **AnkiFiszki v128 bez przeróbek**.
- Żadnych nowych zależności npm ani zmiennych środowiskowych.

## Sprawdzone przed pakowaniem

```text
npx tsc --noEmit     # bez błędów
npm test             # 69 testów (przepisane permissions.test.ts i study.test.ts)
npx next build       # static export: /, /dashboard, /lesson, /study, /library
```
