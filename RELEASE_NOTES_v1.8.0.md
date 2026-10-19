# J-Learner · English Lessons v1.8.0

Nowa karta **Moje słówka**: słówka wyszukane w aplikacji Słownik na telefonie
trafiają do aplikacji webowej i da się je tu powtarzać.

## Co nowego

- `/words/` — lista słówek pogrupowana po dniu wyszukania, wyszukiwarka,
  ulubione, usuwanie zaznaczonych i **🎓 Ucz się** na wybranych słówkach.
- Import na trzy sposoby: link z telefonu (`#import=…`), plik `.json`
  z eksportu Słownika, wklejka `angielski;polski` / TSV dla Anki.
- Import, który przyszedł przed zalogowaniem, czeka w przeglądarce i otwiera
  się po zalogowaniu.
- Przycisk **Moje słówka** na liście lekcji i w bibliotece, krok w instruktażu ucznia.
- Format wymiany opisany w `docs/slownik-words-format.md`.

## Jak wdrożyć

1. Supabase SQL Editor: `supabase/migrations/20261019_english_my_words.sql`.
2. Push do `main`. Edge Function bez zmian.

Eksport lekcji na Drive (`schemaVersion: 1`) i AnkiFiszki v128 — bez zmian.

## Jak to sprawdzono

- `npm run check` (tsc + 81 testów, w tym nowe `tests/word-export-format.test.ts`) i `next build`.
- Wszystkie pięć migracji po kolei na czystym PostgreSQL 16 ze stubem `auth`,
  nowa migracja dwa razy (idempotentna). Sprawdzone: duplikat z inną
  wielkością liter i białymi znakami jest pomijany, drugie konto nie widzi
  cudzych słówek, wstawienie słówka na cudze konto odrzuca RLS.
