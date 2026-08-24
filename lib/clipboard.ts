"use client";

/**
 * Kopiowanie do schowka, które nie wywraca aplikacji.
 *
 * `navigator.clipboard` nie istnieje poza kontekstem bezpiecznym (http://…
 * w sieci lokalnej) i potrafi odrzucić obietnicę, gdy użytkownik nie zgodzi się
 * na uprawnienie. W v1.2.0 oba wywołania były bez `try`, więc kończyło się to
 * nieobsłużonym wyjątkiem i brakiem jakiegokolwiek komunikatu.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Spadamy do metody zapasowej.
  }

  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Pobranie pliku z pamięci.
 *
 * Poprawka względem v1.2.0: kotwica trafia do DOM, a `revokeObjectURL` czeka
 * na zakończenie pobierania. Wcześniej URL był zwalniany w tej samej klatce,
 * co w Firefoksie potrafiło przerwać zapis pliku.
 */
export function downloadTextFile(fileName: string, contents: string, mime = "application/json") {
  const blob = new Blob([contents], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  setTimeout(() => {
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, 1000);
}
