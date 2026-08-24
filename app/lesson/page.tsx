"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { LessonEditor } from "@/components/LessonEditor";

function LessonRoute() {
  const searchParams = useSearchParams();
  const lessonId = searchParams.get("id") ?? "";

  if (!lessonId) {
    return (
      <main className="center-shell">
        <div className="panel auth-panel">
          <h2>Brak identyfikatora lekcji</h2>
          <p className="error">Otwórz lekcję z panelu albo użyj pełnego linku otrzymanego od właściciela.</p>
        </div>
      </main>
    );
  }

  return <LessonEditor lessonId={lessonId} />;
}

export default function LessonPage() {
  return (
    <Suspense fallback={<main className="center-shell"><div className="panel auth-panel">Pobieram…</div></main>}>
      <LessonRoute />
    </Suspense>
  );
}
