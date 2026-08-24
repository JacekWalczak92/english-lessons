# Uruchomienie — 7 kroków

1. Uruchom `supabase/migrations/20260824_english_lessons.sql` w Supabase SQL Editor (jeśli jeszcze nie było).
2. Utwórz repo GitHub, np. `english-lessons`, i wrzuć do niego zawartość tego folderu.
3. GitHub → Settings → Pages → Source: **GitHub Actions**.
4. GitHub → Actions Variables: dodaj `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`.
5. GitHub → Actions Secrets: dodaj `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_ID`.
6. Supabase Auth → URL Configuration: dodaj docelowy adres GitHub Pages jako Site URL + Redirect URL. Google Cloud OAuth: dodaj `https://TWOJ_LOGIN.github.io` jako Authorized JavaScript origin.
7. Zrób push do `main`. Po przejściu obu workflowów otwórz Pages, zaloguj się, utwórz lekcję i sprawdź „Kopiuj link dla nauczyciela”.

Format JSON jest ten sam, więc AnkiFiszki v128 pozostaje kompatybilne bez zmian.
