# J-Learner · English Lessons v1.4.0

Trzy rzeczy, o które chodziło: osobne konta uczniów, fiszki robione przez uczniów
w konkretnej lekcji i gotowe lekcje ze słówkami przygotowywane przez nauczyciela.

## 1. Osobne konta uczniów

- Rejestracja pyta o rolę (**uczeń** / **nauczyciel**) i imię widoczne przy fiszkach.
- Rola żyje w `english_profiles`, nie w JWT — trigger na `auth.users` przepisuje ją
  z metadanych przy zakładaniu konta, więc użytkownik nie awansuje się sam.
- Konta z v1.3.0 dostają rolę nauczyciela (są właścicielami istniejących lekcji).
  Zmiana roli: selektor obok nazwy konta na liście lekcji.
- Lista lekcji wygląda inaczej dla każdej roli: nauczyciel ma lekcje i zestawy,
  uczeń pole na kod, lekcje z nauczycielem i własne kopie.

## 2. Uczniowie robią fiszki w danej lekcji

- Nauczyciel udostępnia lekcję **kodem** `ABCD-EFGH` (albo linkiem `/join/?code=…`).
  Uczeń dołącza na własnym koncie — zapis trafia do `english_lesson_members`.
- Każda fiszka ma teraz autora (`author_id`). Uczeń dodaje własne fiszki, a edytuje
  i usuwa **tylko swoje**; słówka nauczyciela widzi jako `od nauczyciela`.
- Przełącznik **Uczniowie widzą nawzajem swoje fiszki** decyduje, czy lekcja jest
  wspólnym brudnopisem, czy każdy pracuje na swoim. Nauczyciel widzi wszystko
  i w panelu dostępu ma listę uczniów z liczbą dodanych fiszek.
- Eksport na Google Drive jest per konto — uczeń zapisuje własny plik na swoim
  Drive i dostaje w AnkiFiszki dokładnie to, co widzi w lekcji.
- Reguły dostępu (`isCardVisible`, `canEditCard`, `canAddCards`, …) mieszkają
  w `lib/domain.ts` i są egzekwowane przez Edge Function. Interfejs używa tych
  samych funkcji, więc nie pokazuje pól, których zapis i tak zostałby odrzucony,
  a `tests/domain-sync.test.ts` porównuje teraz również ich implementacje
  z kopią dla Deno.

## 3. Gotowe lekcje ze słówkami

- **+ Nowy zestaw słówek** tworzy lekcję typu `set` — normalny edytor, ten sam
  import listy słówek i ten sam format eksportu.
- Włączenie **Opublikuj zestaw** wystawia go w zakładce **Biblioteka**.
- Uczeń robi podgląd (pierwsze 12 fiszek) i klika **Skopiuj do moich lekcji**:
  funkcja `english_copy_lesson()` tworzy mu własną lekcję z kopią słówek.
  Oryginał nauczyciela zostaje nietknięty.

## Migracja

Uruchom w Supabase SQL Editor:

```text
supabase/migrations/20260904_english_lessons_accounts.sql
```

Idempotentna. Dokłada `english_profiles`, `english_lesson_members`,
`author_id` w fiszkach, kod dołączenia, publikację zestawów, licznik fiszek
(`card_count`, wyzwalacze statement-owe, więc import 500 fiszek to jeden UPDATE)
oraz funkcje `english_join_lesson()` i `english_copy_lesson()`.

Polityki RLS dla lekcji i członkostw pytają nawzajem o siebie, więc korzystają
z funkcji `security definer` (`english_is_lesson_owner`, `english_is_lesson_member`) —
inaczej Postgres wpadłby w rekurencję polityk.

## Zgodność

- Format eksportu JSON bez zmian — **AnkiFiszki v128 działa bez przeróbek**.
- Tajny link nauczyciela z v1.3.0 działa dalej. Fiszki dodane linkiem nie mają
  autora i są traktowane jak słówka lekcyjne.
- Nie doszły żadne zależności npm ani nowe zmienne środowiskowe.

## Sprawdzone przed pakowaniem

```text
npx tsc --noEmit     # bez błędów
npm test             # 49 testów, w tym nowy tests/permissions.test.ts
npx next build       # static export: /, /dashboard, /lesson, /library, /join
```
