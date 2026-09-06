"use client";

import { useCallback, useEffect, useState } from "react";
import type { TourStep } from "@/lib/onboarding";

type Rect = { top: number; left: number; width: number; height: number };

const PADDING = 8;
const TOOLTIP_WIDTH = 320;
const TOOLTIP_GAP = 14;

function readRect(target: string | null): Rect | null {
  if (!target) return null;
  const element = document.querySelector(`[data-tour="${target}"]`);
  if (!element) return null;
  const box = element.getBoundingClientRect();
  if (box.width === 0 && box.height === 0) return null;
  return {
    top: box.top - PADDING,
    left: box.left - PADDING,
    width: box.width + PADDING * 2,
    height: box.height + PADDING * 2,
  };
}

/**
 * Podświetlenie elementu z opisem.
 *
 * Zamiast wycinać dziurę w tle, rysujemy ramkę z ogromnym `box-shadow` —
 * jedno pudełko przyciemnia wszystko dookoła i nie trzeba synchronizować
 * czterech nakładek przy przewijaniu.
 */
export function TourOverlay({
  steps,
  onFinish,
}: {
  steps: TourStep[];
  onFinish: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  const step = steps[index];
  const isLast = index === steps.length - 1;

  const measure = useCallback(() => {
    setRect(readRect(step?.target ?? null));
  }, [step]);

  useEffect(() => {
    if (!step) return;
    if (step.target) {
      document
        .querySelector(`[data-tour="${step.target}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    measure();
    const timer = window.setTimeout(measure, 320);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [measure, step]);

  const next = useCallback(() => {
    if (isLast) onFinish();
    else setIndex((current) => current + 1);
  }, [isLast, onFinish]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onFinish();
      } else if (event.key === "ArrowRight" || event.key === "Enter") {
        event.preventDefault();
        next();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        setIndex((current) => Math.max(0, current - 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, onFinish]);

  if (!step) return null;

  // Dymek pod elementem, a gdy nie ma tam miejsca — nad nim.
  const viewportHeight = typeof window === "undefined" ? 800 : window.innerHeight;
  const viewportWidth = typeof window === "undefined" ? 1200 : window.innerWidth;
  const below = rect ? rect.top + rect.height + TOOLTIP_GAP : 0;
  const placeBelow = rect ? below + 210 < viewportHeight : true;

  const tooltipStyle: React.CSSProperties = rect
    ? {
        top: placeBelow ? below : Math.max(12, rect.top - TOOLTIP_GAP - 200),
        left: Math.min(
          Math.max(12, rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2),
          Math.max(12, viewportWidth - TOOLTIP_WIDTH - 12),
        ),
      }
    : {
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
      };

  return (
    <div className="tour-layer" role="dialog" aria-modal="true" aria-label="Instrukcja">
      {rect ? (
        <div
          className="tour-spotlight"
          style={{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }}
        />
      ) : (
        <div className="tour-backdrop" />
      )}

      <div className="tour-tooltip" style={tooltipStyle}>
        <div className="tour-step-count">
          Krok {index + 1} z {steps.length}
        </div>
        <h3>{step.title}</h3>
        <p>{step.body}</p>
        <div className="tour-actions">
          <button className="btn ghost small-btn" onClick={onFinish}>
            Pomiń
          </button>
          <div className="btn-row">
            {index > 0 && (
              <button
                className="btn secondary small-btn"
                onClick={() => setIndex((current) => current - 1)}
              >
                Wstecz
              </button>
            )}
            <button className="btn small-btn" onClick={next}>
              {isLast ? "Zaczynam" : "Dalej"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
