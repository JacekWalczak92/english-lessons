"use client";

import { useState, type FormEvent } from "react";
import { FIELD_LIMITS, type TeacherDirectoryEntry } from "@/lib/types";

/**
 * Zakładanie lekcji przez ucznia.
 *
 * Kody dołączenia zniknęły w v1.7.0 — uczeń wybiera nauczyciela z listy kont
 * w systemie, a lekcja od razu pojawia się w panelu tego nauczyciela.
 */
export function NewLessonPanel({
  teachers,
  defaultDate,
  busy,
  onCreate,
}: {
  teachers: TeacherDirectoryEntry[];
  defaultDate: string;
  busy: boolean;
  onCreate: (input: {
    teacherId: string;
    teacherName: string;
    title: string;
    lessonDate: string;
    request: string;
  }) => void;
}) {
  const available = teachers.filter((teacher) => teacher.accepting_students);
  const [teacherId, setTeacherId] = useState("");
  const [title, setTitle] = useState("");
  const [lessonDate, setLessonDate] = useState(defaultDate);
  const [request, setRequest] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    const teacher = available.find((entry) => entry.user_id === teacherId);
    if (!teacher || busy) return;
    onCreate({
      teacherId: teacher.user_id,
      teacherName: teacher.display_name,
      title: title.trim() || `Lekcja ${lessonDate}`,
      lessonDate,
      request,
    });
  }

  return (
    <section className="panel join-box" data-tour="new-lesson">
      <h2 className="section-title">Nowa lekcja z nauczycielem</h2>

      {available.length === 0 ? (
        <p className="warning small">
          Żaden nauczyciel nie przyjmuje w tej chwili uczniów. Zapytaj swojego lektora, czy założył
          konto nauczyciela w systemie.
        </p>
      ) : (
        <form onSubmit={submit} className="new-lesson-form">
          <div className="field">
            <label htmlFor="teacher">Nauczyciel</label>
            <select
              id="teacher"
              className="select"
              value={teacherId}
              onChange={(event) => setTeacherId(event.target.value)}
              required
            >
              <option value="">— wybierz —</option>
              {available.map((teacher) => (
                <option key={teacher.user_id} value={teacher.user_id}>
                  {teacher.display_name || "Nauczyciel bez nazwy"}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="lesson-title">Temat lekcji</label>
            <input
              id="lesson-title"
              className="input"
              value={title}
              maxLength={FIELD_LIMITS.title}
              placeholder={`Lekcja ${defaultDate}`}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="lesson-date">Data</label>
            <input
              id="lesson-date"
              className="input"
              type="date"
              value={lessonDate}
              onChange={(event) => setLessonDate(event.target.value)}
            />
          </div>

          <div className="field field-wide">
            <label htmlFor="lesson-request">Czego potrzebujesz (opcjonalnie)</label>
            <textarea
              id="lesson-request"
              className="textarea"
              value={request}
              maxLength={FIELD_LIMITS.description}
              placeholder="np. słownictwo na rozmowę o pracę"
              onChange={(event) => setRequest(event.target.value)}
            />
          </div>

          <button className="btn" disabled={busy || !teacherId}>
            {busy ? "Zakładam…" : "Przypisz lekcję nauczycielowi"}
          </button>
        </form>
      )}
    </section>
  );
}
