# J-Learner · English Lessons v1.5.0

Brakującego kawałka z v1.4.0: dało się robić fiszki, ale nie dało się z nich uczyć
bez eksportu na Drive i przejścia na Androida. Teraz powtórka jest w przeglądarce.

## Tryb nauki

Przycisk **🎓 Ucz się** na liście lekcji i w edytorze otwiera `/study/?id=…`.

- **Kierunek pytania:** jak na fiszce, PL → EN, EN → PL albo mieszany.
  Fiszki typu „wymowa” zawsze pytają o wymowę i pokazują IPA oraz akcent.
- **Zakres:** wszystkie słówka, tylko od nauczyciela, tylko moje, albo
  „do poprawki” — czyli to, co ostatnio poszło źle.
- **Sesja:** „Umiem” zdejmuje fiszkę, „Powtórz” odkłada ją o cztery pozycje dalej.
  Sesja kończy się dopiero wtedy, gdy każde słówko zostało raz zaliczone —
  fiszka nie znika tylko dlatego, że się pojawiła.
- **Podsumowanie:** wynik pierwszych podejść, lista wpadek i przycisk
  „Tylko trudne”, żeby od razu je powtórzyć.
- **Klawiatura:** spacja odsłania i zalicza, `1` = powtórz, `2` = umiem.
- **Wymowa:** 🔊 czyta angielską stronę fiszki, jeśli przeglądarka ma Web Speech API.
- Fiszki z pustą stroną są pomijane, a ekran startowy mówi, ile ich było —
  zamiast wyświetlać w trakcie sesji puste pytanie.

Uczeń uczy się dokładnie tego, co widzi w lekcji: słówek nauczyciela i swoich
(oraz kolegów, jeśli nauczyciel włączył widoczność). Tajny link też ma naukę.

## Gdzie jest postęp

W `localStorage` przeglądarki, pod kluczem `jlearner.study.<id lekcji>`.
Świadoma decyzja: pełny SRS z SM-2 zostaje w AnkiFiszki na Androidzie, a web jest
szybką powtórką przed lekcją i po niej. Dzięki temu:

- nie ma kolejnej migracji SQL ani nowych tabel,
- nie ma drugiego, konkurencyjnego harmonogramu powtórek dla tych samych słówek,
- w trybie prywatnym albo przy zablokowanym `localStorage` sesja i tak działa,
  tylko nie pamięta wyników między wejściami.

Historię jednej lekcji można wyczyścić na ekranie startowym nauki.

Jeśli wolisz postęp wspólny dla telefonu i laptopa, naturalnym krokiem jest
tabela `english_study_progress` (user_id, card_id, wynik) i zamiana
`lib/study-progress.ts` na wersję pytającą Supabase — reszta trybu nauki jest od
tego odseparowana.

## Migracja

Brak. v1.5.0 działa na schemacie z v1.4.0.

## Zgodność

- Format eksportu JSON bez zmian — **AnkiFiszki v128 bez przeróbek**.
- Żadnych nowych zależności npm ani zmiennych środowiskowych.

## Sprawdzone przed pakowaniem

```text
npx tsc --noEmit     # bez błędów
npm test             # 67 testów, w tym nowy tests/study.test.ts
npx next build       # static export: /, /dashboard, /lesson, /study, /library, /join
```
