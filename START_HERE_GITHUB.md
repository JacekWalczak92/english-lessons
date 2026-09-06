# Uruchomienie — 7 kroków (v1.6.0)

1. Uruchom w Supabase SQL Editor, w tej kolejności:
   - `supabase/migrations/20260824_english_lessons.sql` (jeśli jeszcze nie było),
   - `supabase/migrations/20260904_english_lessons_accounts.sql` (konta uczniów, kody dołączenia, biblioteka),
   - `supabase/migrations/20260905_english_role_lock.sql` (**nowe w v1.6.0** — jeden tryb na konto).
2. Utwórz repo GitHub, np. `english-lessons`, i wrzuć do niego zawartość tego folderu.
3. GitHub → Settings → Pages → Source: **GitHub Actions**.
4. GitHub → Actions Variables: dodaj `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`.
5. GitHub → Actions Secrets: dodaj `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_ID`.
6. Supabase Auth → URL Configuration: dodaj docelowy adres GitHub Pages jako Site URL + Redirect URL. Google Cloud OAuth: dodaj `https://TWOJ_LOGIN.github.io` jako Authorized JavaScript origin.
7. Zrób push do `main`. Po przejściu obu workflowów zaloguj się, utwórz lekcję, sprawdź kod dołączenia w panelu **Dostęp i uczniowie** i kliknij **🎓 Ucz się**.

Format JSON jest ten sam, więc AnkiFiszki v128 pozostaje kompatybilne bez zmian.

Aktualizacja z v1.5.0: uruchom `20260905_english_role_lock.sql` i zrób push.
Instruktaż pokaże się użytkownikom sam, przy pierwszym wejściu na każdy ekran.

Aktualizacja z v1.4.0: dodatkowo tryb nauki — bez własnej migracji.

Aktualizacja z v1.3.0: **jest nowa migracja SQL** (punkt 1). Konta założone
wcześniej dostają rolę nauczyciela — rolę zmienisz w prawym górnym rogu listy
lekcji. Przed pushem możesz odpalić lokalnie `npm run check` (typy + testy).
