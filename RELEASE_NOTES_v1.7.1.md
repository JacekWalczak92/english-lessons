# J-Learner · English Lessons v1.7.1

Poprawka migracji z v1.7.0. Kod aplikacji jest bez zmian.

## Co było zepsute

`supabase/migrations/20260906_english_assignments.sql` tworzył funkcję
`english_shares_lesson_with()` **przed** `ALTER TABLE`, które dodaje kolumnę
`assigned_teacher_id`. Postgres sprawdza ciało funkcji `language sql` już przy
`CREATE FUNCTION`, więc migracja przerywała się komunikatem:

```text
ERROR: 42703: column l.assigned_teacher_id does not exist
```

Migracja jest transakcyjna, więc nic się nie zapisało — po prostu nie przeszła.

## Co poprawione

- Wszystkie `ALTER TABLE` z nowymi kolumnami wykonują się teraz w sekcji 1,
  przed jakąkolwiek funkcją, która się do nich odwołuje.
- Przenoszenie danych z v1.4–v1.6 nie wywraca się już na lekcji, której
  właścicielem było konto ucznia: taka kopia powstaje bez przypisanego
  nauczyciela, zamiast wywoływać wyjątek strażnika przypisań.

## Jak wdrożyć

Uruchom poprawiony plik w Supabase SQL Editor — poprzednia, nieudana próba nie
zostawiła po sobie śladów:

```text
supabase/migrations/20260906_english_assignments.sql
```

Pozostałe migracje bez zmian. Frontend i Edge Function identyczne jak w v1.7.0,
ale wersję paczki podbito, żeby nie krążyły dwie różne „1.7.0”.

## Jak to sprawdzono

Wszystkie cztery migracje uruchomiono po kolei na czystym PostgreSQL 16 ze
stubem schematu `auth`, a potem:

- powtórzono ostatnią migrację (idempotencja — przechodzi),
- sprawdzono strażników: przypisanie lekcji koncie ucznia, zmiana roli przez
  zalogowanego użytkownika i publikacja zestawu z konta ucznia są odrzucane,
  a poprawka roli z SQL Editora (bez `auth.uid()`) działa,
- odtworzono dane w starym modelu (lekcja z kodem + zapisany uczeń) i
  potwierdzono, że uczeń dostaje własną lekcję przypisaną nauczycielowi razem
  z kopią fiszek, a kody i linki są wyłączone.
