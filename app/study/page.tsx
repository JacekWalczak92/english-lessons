"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { StudySession } from "@/components/study/StudySession";

function StudyRoute() {
  const searchParams = useSearchParams();
  const lessonId = searchParams.get("id") ?? "";
  const lessonKey = searchParams.get("key") ?? "";

  if (!lessonId) {
    return (
      <main className="center-shell">
        <div className="panel auth-panel">
          <h2>Brak identyfikatora lekcji</h2>
          <p className="error">Otwórz naukę z listy lekcji albo z edytora lekcji.</p>
          <Link href="/dashboard" className="btn ghost" style={{ marginTop: 16, display: "inline-block" }}>
            ← Moje lekcje
          </Link>
        </div>
      </main>
    );
  }

  return <StudySession lessonId={lessonId} lessonKey={lessonKey || undefined} />;
}

export default function StudyPage() {
  return (
    <Suspense
      fallback={
        <main className="center-shell">
          <div className="panel auth-panel">Pobieram…</div>
        </main>
      }
    >
      <StudyRoute />
    </Suspense>
  );
}
