# Format `slownik-words` v1 — słówka z J-Learner Vocabulary do J-Learner English Lessons

Kontrakt między aplikacją **J-Learner Vocabulary** (Android, dawniej „Słownik”, repo `dictionary-app`) a kartą
**Moje słówka** w J-Learner English Lessons. Ten sam plik leży w obu repozytoriach;
zmieniasz go w jednym — kopiujesz do drugiego.

## Plik JSON

```json
{
  "format": "slownik-words",
  "schemaVersion": 1,
  "exportedAt": "2026-10-19T07:00:00.000Z",
  "source": { "app": "J-Learner Vocabulary", "version": "21.1" },
  "words": [
    {
      "id": "42",
      "english": "bias",
      "polish": "stronniczość, uprzedzenie",
      "sourceLang": "en",
      "kind": "word",
      "favorite": false,
      "lookedUpAt": "2026-10-18T19:22:05.000Z"
    }
  ]
}
```

| Pole | Wymagane | Znaczenie |
| --- | --- | --- |
| `format` | tak | zawsze `slownik-words` |
| `schemaVersion` | tak | `1`; web odrzuca wyższą wersję zamiast zgadywać |
| `words[].english` | tak | strona angielska (przód fiszki), max 2000 znaków |
| `words[].polish` | tak | strona polska (tył fiszki), max 2000 znaków |
| `words[].sourceLang` | nie | `en` / `pl` — w jakim języku słówko było wpisane |
| `words[].kind` | nie | `word` (1–2 słowa) / `sentence`; brak = web zgaduje |
| `words[].favorite` | nie | gwiazdka z telefonu |
| `words[].lookedUpAt` | nie | ISO 8601, kiedy słówko wyszukano — po tym web grupuje listę |
| `words[].id` | nie | identyfikator w telefonie, tylko informacyjnie |

Aplikacja zawsze zapisuje **angielski jako `english`**, także gdy słówko było
wyszukane po polsku (zamienia strony tak samo jak eksport do Anki).

## Duplikaty

Klucz to `english` bez wielkości liter i nadmiarowych spacji. Słówko, które już
jest na koncie, przy ponownym imporcie zostaje bez zmian — eksport „wszystko”
można więc wysyłać wielokrotnie.

## Trzy drogi przesłania

1. **Wyślij do J-Learner** (Historia → Eksportuj): telefon otwiera
   `https://<adres-aplikacji>/words/#import=<base64url(JSON)>`.
   Fragment po `#` nie jest wysyłany do serwera, więc słówka nie lądują
   w logach GitHub Pages. Base64url = Android `Base64.URL_SAFE | NO_PADDING | NO_WRAP`
   z UTF-8. Gdy nie jesteś zalogowany, web zapamiętuje import i wraca do niego po logowaniu.
2. **Plik .json** — „Zapisz plik dla J-Learner” albo „Udostępnij” w telefonie,
   potem **Moje słówka → Importuj → Wybierz plik**.
3. **Wklejka** — web przyjmuje też stary format schowka `angielski;polski`
   i plik TSV dla Anki.
