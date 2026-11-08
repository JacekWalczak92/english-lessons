# J-Learner Vocabulary v1.9.0 — łączenie słówek z kilku lekcji

## Nowe
- Pola wyboru przy lekcjach i pasek „Zaznaczone: N lekcji”.
- **🎓 Ucz się razem** — nauka z kilku lekcji naraz, bez powtórzonych słówek,
  z etykietą lekcji na fiszce. Opcjonalnie razem z „Moimi słówkami”.
- **Połącz w nowy zestaw** — nowa lekcja z kopią fiszek z zaznaczonych lekcji.
  Oryginały się nie zmieniają. Komentarze ucznia przechodzą z jego własnych lekcji.

## Wdrożenie
1. Uruchom w Supabase SQL Editor: `supabase/migrations/20261108_english_merge_lessons.sql`
   (idempotentna). Bez niej „Ucz się razem” działa, a „Połącz w nowy zestaw”
   pokaże komunikat o brakującej migracji.
2. Frontend wdraża się sam po merge'u do `main`.
