"use client";

import { Field } from "@/components/Field";
import { FIELD_LIMITS, type Lesson, type LessonPatch } from "@/lib/types";

/**
 * Prośba ucznia do nauczyciela — co ma być na tej lekcji.
 *
 * Uczeń nie wypełnia już fiszek, więc to jedyne miejsce, w którym może
 * powiedzieć, czego potrzebuje, zanim nauczyciel przygotuje materiał.
 * Nauczyciel widzi ten tekst tylko do odczytu.
 */
export function StudentRequestPanel({
  lesson,
  editable,
  onChange,
}: {
  lesson: Lesson;
  editable: boolean;
  onChange: (patch: LessonPatch) => void;
}) {
  if (!editable && !lesson.student_request.trim()) return null;

  return (
    <section className="panel request-panel" data-tour="student-request">
      <Field
        label="Czego potrzebuję na tej lekcji"
        hint={editable ? "Widzi to nauczyciel przypisany do lekcji." : "Napisał to uczeń."}
      >
        {(props) => (
          <textarea
            {...props}
            className="textarea"
            disabled={!editable}
            maxLength={FIELD_LIMITS.description}
            value={lesson.student_request}
            placeholder={
              editable ? "np. słownictwo na rozmowę o pracę, czasy przeszłe w praktyce" : ""
            }
            onChange={(event) => onChange({ student_request: event.target.value })}
          />
        )}
      </Field>
    </section>
  );
}
