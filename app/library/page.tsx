"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { copyLessonToMyAccount, listLibrary } from "@/lib/account";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import type { LessonCard, LibraryEntry } from "@/lib/types";

const PREVIEW_LIMIT = 12;

/**
 * Biblioteka gotowych zestawów.
 *
 * Podgląd czyta fiszki bezpośrednio przez RLS (polityka wpuszcza do
 * opublikowanych zestawów), a „Skopiuj” woła funkcję `english_copy_lesson`,
 * która robi uczniowi własną lekcję — oryginał nauczyciela zostaje nietknięty.
 */
export default function LibraryPage() {
  const router = useRouter();
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [copying, setCopying] = useState("");
  const [openId, setOpenId] = useState("");
  const [preview, setPreview] = useState<LessonCard[]>([]);
  const [previewBusy, setPreviewBusy] = useState(false);

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
      setEntries(await listLibrary());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udało się pobrać biblioteki.");
    } finally {
      setBusy(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function togglePreview(entry: LibraryEntry) {
    if (openId === entry.id) {
      setOpenId("");
      setPreview([]);
      return;
    }
    setOpenId(entry.id);
    setPreview([]);
    setPreviewBusy(true);
    try {
      const { data, error: queryError } = await getSupabaseBrowser()
        .from("english_lesson_cards")
        .select("*")
        .eq("lesson_id", entry.id)
        .order("order_index", { ascending: true })
        .limit(PREVIEW_LIMIT);
      if (queryError) throw queryError;
      setPreview((data ?? []) as LessonCard[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udało się pobrać podglądu.");
    } finally {
      setPreviewBusy(false);
    }
  }

  async function copy(entry: LibraryEntry) {
    if (copying) return;
    setCopying(entry.id);
    setError("");
    try {
      const newId = await copyLessonToMyAccount(entry.id);
      router.push(`/lesson/?id=${encodeURIComponent(newId)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udało się skopiować zestawu.");
      setCopying("");
    }
  }

  return (
    <main className="shell">
      <div className="topbar">
        <div>
          <div className="brand">J-Learner</div>
          <h1 style={{ marginBottom: 0 }}>Biblioteka gotowych zestawów</h1>
          <p className="muted small" style={{ marginTop: 6 }}>
            Zestawy przygotowane przez nauczycieli. Kopia trafia na Twoje konto — możesz ją
            edytować i wyeksportować na swój Drive.
          </p>
        </div>
        <div className="topbar-actions">
          <Link className="btn ghost small-btn" href="/words">
            Moje słówka
          </Link>
          <Link className="btn ghost small-btn" href="/dashboard">
            ← Moje lekcje
          </Link>
        </div>
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {busy ? (
        <div className="panel empty">Pobieram bibliotekę…</div>
      ) : entries.length === 0 ? (
        <div className="panel empty">
          <h2>Biblioteka jest pusta</h2>
          <p>Nauczyciel publikuje zestaw w panelu „Dostęp i uczniowie” otwartego zestawu.</p>
        </div>
      ) : (
        <section className="dashboard-grid">
          {entries.map((entry) => (
            <article className="panel lesson-row library-row" key={entry.id}>
              <div>
                <div className="lesson-title">{entry.title}</div>
                <div className="lesson-meta">
                  {entry.teacher_name && <span>{entry.teacher_name}</span>}
                  <span>• {entry.card_count} fiszek</span>
                  <span>• {entry.lesson_date}</span>
                </div>
                {entry.description && <p className="small muted">{entry.description}</p>}

                {openId === entry.id && (
                  <div className="preview-list">
                    {previewBusy ? (
                      <p className="small muted">Pobieram podgląd…</p>
                    ) : preview.length === 0 ? (
                      <p className="small muted">Ten zestaw nie ma jeszcze fiszek.</p>
                    ) : (
                      <ul>
                        {preview.map((card) => (
                          <li key={card.id}>
                            <strong>{card.english || "—"}</strong> · {card.polish || "—"}
                          </li>
                        ))}
                      </ul>
                    )}
                    {entry.card_count > PREVIEW_LIMIT && (
                      <p className="small muted">…i {entry.card_count - PREVIEW_LIMIT} więcej.</p>
                    )}
                  </div>
                )}
              </div>

              <div className="btn-row">
                <button className="btn ghost small-btn" onClick={() => void togglePreview(entry)}>
                  {openId === entry.id ? "Ukryj podgląd" : "Podgląd"}
                </button>
                <button
                  className="btn small-btn"
                  disabled={copying === entry.id}
                  onClick={() => void copy(entry)}
                >
                  {copying === entry.id ? "Kopiuję…" : "Skopiuj do moich lekcji"}
                </button>
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
