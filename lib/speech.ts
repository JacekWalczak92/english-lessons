"use client";

/**
 * Czytanie angielskich słówek na głos. Web Speech API bywa niedostępne
 * (starsze przeglądarki, część widoków w aplikacjach mobilnych), więc każde
 * użycie sprawdza wsparcie i po cichu odpuszcza zamiast rzucać wyjątkiem.
 */
export function speechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function speakEnglish(text: string) {
  if (!speechSupported() || !text.trim()) return;
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-GB";
    utterance.rate = 0.95;
    window.speechSynthesis.speak(utterance);
  } catch {
    // Brak głosu w systemie — przycisk po prostu nic nie robi.
  }
}
