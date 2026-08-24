"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { LessonEditor } from "@/components/LessonEditor";

function LessonRoute() {
  const searchParams = useSearchParams();
  const lessonId = searchParams.get("id") ?? "";
  const lessonKey = searchParams.get("key") ?? "";

  if (!lessonId) {
    return (
      <main className="center-shell">
        <div className="panel auth-panel">
          <h2>Brak identyfikatora lekcji</h2>
          <p className="error">
            Otwórz lekcję z panelu albo użyj pełnego linku otrzymanego od właściciela.
          </p>
          <Link href="/dashboard" className="btn ghost" style={{ marginTop: 16, display: "inline-block" }}>
            ← Moje lekcje
          </Link>
        </div>
      </main>
    );
  }

  return <LessonEditor lessonId={lessonId} lessonKey={lessonKey || undefined} />;
}

export default function LessonPage() {
  return (
    <Suspense
      fallback={
        <main className="center-shell">
          <div className="panel auth-panel">Pobieram…</div>
        </main>
      }
    >
      <LessonRoute />
    </Suspense>
  );
}
