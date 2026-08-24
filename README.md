# J-Learner · English Lessons — GitHub Pages edition

Statyczna miniaplikacja do wspólnego tworzenia fiszek podczas lekcji angielskiego.
Frontend jest publikowany na **GitHub Pages**, dane są trzymane w **Supabase**, a tajny link nauczyciela obsługuje **Supabase Edge Function**. Eksport lekcji na Google Drive pozostaje zgodny z importerem AnkiFiszki v128.

## Architektura

```text
GitHub Pages (Next.js static export)
          │
          ├── właściciel: Supabase Auth + RLS
          │
          ├── edytor lekcji ──> Supabase Edge Function
          │                       └── weryfikacja JWT lub tajnego linku
          │
          └── Google Drive OAuth (drive.file)
                    │
                    └── J-Learner/EnglishLessons/*.json
                                   │
                                   └── AnkiFiszki v128
```

## Co zmieniło się względem wersji Vercel

- `next.config.ts` ma `output: "export"`.
- Nie ma `app/api/*` ani sekretu Supabase w Next.js.
- Trasa lekcji jest statyczna: `/lesson/?id=<uuid>&key=<token>`.
- Backend tajnego linku jest w `supabase/functions/english-lesson-api/`.
- `.github/workflows/deploy-pages.yml` publikuje frontend.
- `.github/workflows/deploy-supabase-function.yml` publikuje Edge Function.
- `NEXT_PUBLIC_BASE_PATH` jest ustawiany automatycznie dla repo typu `username.github.io/nazwa-repo`.

## 1. Supabase — baza danych

Jeżeli nie zrobiłeś tego przy poprzedniej wersji, uruchom w **Supabase → SQL Editor**:

```text
supabase/migrations/20260824_english_lessons.sql
```

Migracja tworzy `english_lessons`, `english_lesson_cards`, RLS i triggery `updated_at`.

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

Funkcja ma `verify_jwt = false`, ponieważ nauczyciel może wejść bez konta. Sama funkcja **nie ufa anonimowemu wywołaniu**: przed odczytem/zapisem wymaga prawidłowego JWT właściciela albo 64-znakowego tajnego tokenu konkretnej lekcji.

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

## Format i Android

Format JSON nie zmienił się względem poprzedniej wersji. Przygotowany wcześniej **AnkiFiszki v128** nie wymaga kolejnej zmiany i nadal importuje pliki z:

```text
J-Learner/EnglishLessons/
```

Ponowny import tej samej lekcji aktualizuje treść bez resetowania postępu SM-2.

## Ważne bezpieczeństwo

Do repozytorium i do `NEXT_PUBLIC_*` **nie wkładaj** `sb_secret_...`, `service_role` ani innych kluczy administracyjnych Supabase. Edge Function korzysta z wbudowanego `SUPABASE_SERVICE_ROLE_KEY` po stronie Supabase i ten klucz nigdy nie jest wysyłany do GitHub Pages.
