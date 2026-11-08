"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { StudySession } from "@/components/study/StudySession";
import { parseLessonIds } from "@/lib/merge";

function StudyRoute() {
  const searchParams = useSearchParams();
  // `?id=` to nauka jednej lekcji, `?ids=a,b,c` — kilku naraz („Ucz się razem”).
  const lessonIds = parseLessonIds(searchParams.get("ids"), searchParams.get("id"));
  const withMyWords = searchParams.get("words") === "1";

  if (lessonIds.length === 0 && !withMyWords) {
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

  return <StudySession key={`${lessonIds.join(",")}|${withMyWords}`} lessonIds={lessonIds} withMyWords={withMyWords} />;
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
