"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import type { Lesson } from "@/lib/types";

/** Data w strefie użytkownika — `new Date().toISOString()` potrafi cofnąć o dobę. */
function localDate(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function DashboardPage() {
  const router = useRouter();
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [busy, setBusy] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const supabase = getSupabaseBrowser();
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        router.replace("/");
        return;
      }
      const { data, error: queryError } = await supabase
        .from("english_lessons")
        .select("*")
        .order("lesson_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (queryError) throw queryError;
      setLessons((data ?? []) as Lesson[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udało się pobrać lekcji.");
    } finally {
      setBusy(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createLesson() {
    if (creating) return;
    setCreating(true);
    setError("");
    try {
      const supabase = getSupabaseBrowser();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Sesja wygasła — zaloguj się ponownie.");
      const today = localDate();
      const { data, error: insertError } = await supabase
        .from("english_lessons")
        .insert({
          owner_id: userData.user.id,
          lesson_date: today,
          title: `Lekcja ${today}`,
        })
        .select("id")
        .single();
      if (insertError) throw insertError;
      router.push(`/lesson/?id=${encodeURIComponent(data.id)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udało się utworzyć lekcji.");
      setCreating(false);
    }
  }

  async function signOut() {
    await getSupabaseBrowser().auth.signOut();
    router.replace("/");
  }

  async function removeLesson(lesson: Lesson) {
    if (!window.confirm(`Usunąć lekcję „${lesson.title}” razem z fiszkami?`)) return;
    const snapshot = lessons;
    setLessons((current) => current.filter((item) => item.id !== lesson.id));
    try {
      const { error: deleteError } = await getSupabaseBrowser()
        .from("english_lessons")
        .delete()
        .eq("id", lesson.id);
      if (deleteError) throw deleteError;
    } catch (e) {
      // Przywracamy listę, żeby interfejs nie kłamał o skutecznym usunięciu.
      setLessons(snapshot);
      setError(e instanceof Error ? e.message : "Nie udało się usunąć lekcji.");
    }
  }

  return (
    <main className="shell">
      <div className="topbar">
        <div>
          <div className="brand">J-Learner</div>
          <h1 style={{ marginBottom: 0 }}>Lekcje angielskiego</h1>
        </div>
        <div className="topbar-actions">
          <button className="btn" onClick={createLesson} disabled={creating}>
            {creating ? "Tworzę…" : "+ Nowa lekcja"}
          </button>
          <button className="btn ghost" onClick={signOut}>
            Wyloguj
          </button>
        </div>
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {busy ? (
        <div className="panel empty">Pobieram lekcje…</div>
      ) : lessons.length === 0 ? (
        <div className="panel empty">
          <h2>Nie ma jeszcze lekcji</h2>
          <p>Utwórz pierwszą i wyślij nauczycielowi tajny link.</p>
        </div>
      ) : (
        <section className="dashboard-grid">
          {lessons.map((lesson) => (
            <article className="panel lesson-row" key={lesson.id}>
              <div>
                <div className="lesson-title">{lesson.title}</div>
                <div className="lesson-meta">
                  <span>{lesson.lesson_date}</span>
                  {lesson.teacher_name && <span>• {lesson.teacher_name}</span>}
                  <span className={`badge ${lesson.status === "finished" ? "finished" : ""}`}>
                    {lesson.status === "finished" ? "zakończona" : "w toku"}
                  </span>
                  {!lesson.share_enabled && <span className="badge muted-badge">link wyłączony</span>}
                  {lesson.last_exported_at && <span>• Drive ✓</span>}
                </div>
              </div>
              <div className="btn-row">
                <Link
                  className="btn secondary small-btn"
                  href={`/lesson/?id=${encodeURIComponent(lesson.id)}`}
                >
                  Otwórz
                </Link>
                <button className="btn danger small-btn" onClick={() => removeLesson(lesson)}>
                  Usuń
                </button>
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
