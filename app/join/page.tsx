"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { joinLessonByCode } from "@/lib/account";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { formatJoinCode, normalizeJoinCode } from "@/lib/types";

/**
 * Wejście z linku „/join/?code=ABCD-EFGH”.
 *
 * Zalogowanego ucznia zapisujemy od razu i przenosimy do lekcji. Bez sesji
 * pokazujemy kod i kierujemy na logowanie — po powrocie link zadziała.
 */
function JoinRoute() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = normalizeJoinCode(searchParams.get("code") ?? "");

  const [state, setState] = useState<"checking" | "anonymous" | "joining" | "error">("checking");
  const [error, setError] = useState("");

  const run = useCallback(async () => {
    if (!code) {
      setState("error");
      setError("Link nie zawiera kodu lekcji.");
      return;
    }
    try {
      const { data } = await getSupabaseBrowser().auth.getSession();
      if (!data.session) {
        setState("anonymous");
        return;
      }
      setState("joining");
      const result = await joinLessonByCode(code);
      router.replace(`/lesson/?id=${encodeURIComponent(result.lesson_id)}`);
    } catch (e) {
      setState("error");
      setError(e instanceof Error ? e.message : "Nie udało się dołączyć do lekcji.");
    }
  }, [code, router]);

  useEffect(() => {
    void run();
  }, [run]);

  return (
    <main className="center-shell">
      <section className="panel auth-panel">
        <div className="brand">J-Learner</div>
        <h1>Dołączanie do lekcji</h1>
        {code && <p className="join-code">{formatJoinCode(code)}</p>}

        {state === "checking" && <p className="muted">Sprawdzam sesję…</p>}
        {state === "joining" && <p className="muted">Zapisuję Cię na lekcję…</p>}

        {state === "anonymous" && (
          <>
            <p className="muted">
              Zaloguj się albo załóż konto ucznia, a potem wróć tym linkiem — kod zostanie użyty
              automatycznie.
            </p>
            <Link className="btn" href="/" style={{ marginTop: 16, display: "inline-block" }}>
              Przejdź do logowania
            </Link>
          </>
        )}

        {state === "error" && (
          <>
            <p className="error" role="alert">
              {error}
            </p>
            <Link className="btn ghost" href="/dashboard" style={{ marginTop: 16, display: "inline-block" }}>
              ← Moje lekcje
            </Link>
          </>
        )}
      </section>
    </main>
  );
}

export default function JoinPage() {
  return (
    <Suspense
      fallback={
        <main className="center-shell">
          <div className="panel auth-panel">Pobieram…</div>
        </main>
      }
    >
      <JoinRoute />
    </Suspense>
  );
}
