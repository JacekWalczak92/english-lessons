"use client";

import { QUICK_ADD } from "@/lib/card-labels";
import type { CardType } from "@/lib/types";

export function QuickAddBar({
  locked,
  importOpen,
  shareOpen,
  isOwner,
  isStudent,
  onAdd,
  onToggleImport,
  onToggleShare,
}: {
  locked: boolean;
  importOpen: boolean;
  shareOpen: boolean;
  isOwner: boolean;
  /** Uczeń dodaje własne fiszki — warto o tym napisać wprost. */
  isStudent: boolean;
  onAdd: (type: CardType) => void;
  onToggleImport: () => void;
  onToggleShare: () => void;
}) {
  return (
    <section className="panel quick-add" data-tour="quick-add">
      {QUICK_ADD.map((entry) => (
        <button
          key={entry.type}
          className="btn secondary small-btn"
          disabled={locked}
          onClick={() => onAdd(entry.type)}
        >
          {entry.label} <span className="muted">{entry.hint}</span>
        </button>
      ))}

      <button
        className="btn secondary small-btn"
        disabled={locked}
        aria-expanded={importOpen}
        data-tour="import"
        onClick={onToggleImport}
      >
        ⇩ Importuj słówka
      </button>

      {isOwner && (
        <button
          className="btn ghost small-btn"
          aria-expanded={shareOpen}
          data-tour="access"
          onClick={onToggleShare}
        >
          👥 Dostęp i uczniowie
        </button>
      )}

      <span className="hint">
        {isStudent
          ? "Dodajesz własne fiszki — nauczyciel je widzi, a Ty nie ruszasz cudzych."
          : "Zmiany zapisują się automatycznie i pojawiają się u pozostałych po kilku sekundach."}
      </span>
    </section>
  );
}
