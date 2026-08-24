# Import słówek

W edytorze lekcji kliknij **Importuj słówka**.

Format jednego wiersza:

```text
POLSKI;ANGIELSKI;TYP;NOTATKA;WYMOWA;PRZYKŁAD
```

Dozwolone typy: `word_phrase`, `translation_sentence`, `pronunciation`, `british`, `custom`.

Nagłówek, puste linie i komentarze zaczynające się od `#` są pomijane. Jako
separator działa też tabulator (wklejka z arkusza). Duplikaty — także względem
fiszek już obecnych w lekcji — są pomijane, a wiersze z błędem pokazywane razem
z numerem linii, zanim cokolwiek trafi na serwer.

Przycisk **Pokaż prompt AI** obok importu daje gotowy prompt dla agenta AI, który
przekształca surowe notatki w ten format.
