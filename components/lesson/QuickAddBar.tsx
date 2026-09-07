"use client";

import { QUICK_ADD } from "@/lib/card-labels";
import type { CardType } from "@/lib/types";

export function QuickAddBar({
  locked,
  importOpen,
  onAdd,
  onToggleImport,
}: {
  locked: boolean;
  importOpen: boolean;
  onAdd: (type: CardType) => void;
  onToggleImport: () => void;
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

      <span className="hint">
        Zmiany zapisują się automatycznie i pojawiają się u ucznia po kilku sekundach.
      </span>
    </section>
  );
}
