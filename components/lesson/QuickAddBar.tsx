"use client";

import { QUICK_ADD } from "@/lib/card-labels";
import type { CardType } from "@/lib/types";

export function QuickAddBar({
  locked,
  importOpen,
  shareOpen,
  isOwner,
  onAdd,
  onToggleImport,
  onToggleShare,
}: {
  locked: boolean;
  importOpen: boolean;
  shareOpen: boolean;
  isOwner: boolean;
  onAdd: (type: CardType) => void;
  onToggleImport: () => void;
  onToggleShare: () => void;
}) {
  return (
    <section className="panel quick-add">
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
        onClick={onToggleImport}
      >
        ⇩ Importuj słówka
      </button>

      {isOwner && (
        <button className="btn ghost small-btn" aria-expanded={shareOpen} onClick={onToggleShare}>
          🔗 Link dla nauczyciela
        </button>
      )}

      <span className="hint">Zmiany zapisują się automatycznie i pojawiają się u drugiej osoby po kilku sekundach.</span>
    </section>
  );
}
