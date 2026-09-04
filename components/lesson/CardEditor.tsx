"use client";

import { memo } from "react";
import { Field } from "@/components/Field";
import { FIELD_LABELS, TYPE_LABELS } from "@/lib/card-labels";
import {
  CARD_TYPES,
  directionForTypeChange,
  type CardPatch,
  type CardType,
  type LessonCard,
} from "@/lib/types";

type Props = {
  card: LessonCard;
  index: number;
  total: number;
  /** Fiszka tylko do odczytu: cudza fiszka albo zakończona lekcja. */
  locked: boolean;
  /** Podpis autora — pusty dla własnych fiszek, żeby nie zaśmiecać widoku. */
  authorLabel?: string;
  onChange: (cardId: string, patch: CardPatch) => void;
  onDelete: (cardId: string) => void;
  onMove: (cardId: string, direction: -1 | 1) => void;
};

/**
 * Jedna fiszka. `memo` ma tu realne znaczenie: przy 300 fiszkach z importu
 * każde naciśnięcie klawisza przerysowywało w v1.2.0 całą listę.
 */
export const CardEditor = memo(function CardEditor({
  card,
  index,
  total,
  locked,
  authorLabel,
  onChange,
  onDelete,
  onMove,
}: Props) {
  const labels = FIELD_LABELS[card.card_type];

  return (
    <article className="panel card-editor" id={`card-${card.id}`}>
      <div className="card-top">
        <label className="sr-only" htmlFor={`type-${card.id}`}>
          Typ fiszki #{index + 1}
        </label>
        <select
          id={`type-${card.id}`}
          className="select card-type"
          value={card.card_type}
          disabled={locked}
          onChange={(event) => {
            const next = event.target.value as CardType;
            onChange(card.id, {
              card_type: next,
              review_direction: directionForTypeChange(next, card.review_direction),
            });
          }}
        >
          {CARD_TYPES.map((type) => (
            <option value={type} key={type}>
              {TYPE_LABELS[type]}
            </option>
          ))}
        </select>

        <span className="card-index">#{index + 1}</span>

        {authorLabel && <span className="badge author-badge">{authorLabel}</span>}

        <div className="btn-row">
          <button
            className="btn ghost icon-btn"
            disabled={locked || index === 0}
            aria-label={`Przenieś fiszkę ${index + 1} w górę`}
            onClick={() => onMove(card.id, -1)}
          >
            ↑
          </button>
          <button
            className="btn ghost icon-btn"
            disabled={locked || index === total - 1}
            aria-label={`Przenieś fiszkę ${index + 1} w dół`}
            onClick={() => onMove(card.id, 1)}
          >
            ↓
          </button>
          <button className="btn danger small-btn" disabled={locked} onClick={() => onDelete(card.id)}>
            Usuń
          </button>
        </div>
      </div>

      <div className="card-main-grid">
        <Field label={labels.polish}>
          {(props) => (
            <textarea
              {...props}
              className="textarea"
              disabled={locked}
              value={card.polish}
              onChange={(event) => onChange(card.id, { polish: event.target.value })}
            />
          )}
        </Field>
        <Field label={labels.english}>
          {(props) => (
            <textarea
              {...props}
              className="textarea"
              disabled={locked}
              value={card.english}
              onChange={(event) => {
                const patch: CardPatch = { english: event.target.value };
                if (card.card_type === "british") patch.british_variant = event.target.value;
                onChange(card.id, patch);
              }}
            />
          )}
        </Field>
      </div>

      {card.card_type === "pronunciation" && (
        <div className="card-extra-grid">
          <Field label="IPA / zapis fonetyczny">
            {(props) => (
              <input
                {...props}
                className="input"
                disabled={locked}
                value={card.phonetic}
                placeholder="/fəˈtɒɡrəfi/"
                onChange={(event) => onChange(card.id, { phonetic: event.target.value })}
              />
            )}
          </Field>
          <Field label="Akcent / wymowa">
            {(props) => (
              <input
                {...props}
                className="input"
                disabled={locked}
                value={card.pronunciation}
                placeholder="pho-TOG-ra-phy"
                onChange={(event) => onChange(card.id, { pronunciation: event.target.value })}
              />
            )}
          </Field>
        </div>
      )}

      {card.card_type === "british" && (
        <div className="card-extra-grid">
          <Field label="Odpowiednik amerykański (opcjonalnie)">
            {(props) => (
              <input
                {...props}
                className="input"
                disabled={locked}
                value={card.american_variant}
                placeholder="on the weekend"
                onChange={(event) => onChange(card.id, { american_variant: event.target.value })}
              />
            )}
          </Field>
          <Field label="IPA / wymowa (opcjonalnie)">
            {(props) => (
              <input
                {...props}
                className="input"
                disabled={locked}
                value={card.phonetic}
                onChange={(event) => onChange(card.id, { phonetic: event.target.value })}
              />
            )}
          </Field>
        </div>
      )}

      <div className="card-extra-grid">
        <Field label="Przykład (opcjonalnie)">
          {(props) => (
            <textarea
              {...props}
              className="textarea"
              disabled={locked}
              value={card.example}
              onChange={(event) => onChange(card.id, { example: event.target.value })}
            />
          )}
        </Field>
        <Field label="Notatka (opcjonalnie)">
          {(props) => (
            <textarea
              {...props}
              className="textarea"
              disabled={locked}
              value={card.note}
              onChange={(event) => onChange(card.id, { note: event.target.value })}
            />
          )}
        </Field>
      </div>

      <div className="card-footer">
        {card.card_type === "pronunciation" ? (
          <span className="badge">powtórka wymowy</span>
        ) : (
          <div className="direction" role="group" aria-label="Kierunek powtórki">
            <button
              className={card.review_direction === "PL_TO_EN" ? "active" : ""}
              aria-pressed={card.review_direction === "PL_TO_EN"}
              disabled={locked}
              onClick={() => onChange(card.id, { review_direction: "PL_TO_EN" })}
            >
              PL → EN
            </button>
            <button
              className={card.review_direction === "EN_TO_PL" ? "active" : ""}
              aria-pressed={card.review_direction === "EN_TO_PL"}
              disabled={locked}
              onClick={() => onChange(card.id, { review_direction: "EN_TO_PL" })}
            >
              EN → PL
            </button>
          </div>
        )}
      </div>
    </article>
  );
});
