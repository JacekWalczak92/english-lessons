"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { JoinLessonBox } from "@/components/dashboard/JoinLessonBox";
import { LessonList } from "@/components/dashboard/LessonList";
import {
  createLesson,
  deleteLesson,
  leaveLesson,
  listJoinedLessons,
  listOwnedLessons,
  loadProfile,
  updateProfile,
} from "@/lib/account";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import type { AppProfile, AppRole, Lesson } from "@/lib/types";

/** Data w strefie użytkownika — `new Date().toISOString()` potrafi cofnąć o dobę. */
function localDate(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function DashboardPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<AppProfile | null>(null);
  const [owned, setOwned] = useState<Lesson[]>([]);
  const [joined, setJoined] = useState<Lesson[]>([]);
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
      const [loadedProfile, ownedLessons, joinedLessons] = await Promise.all([
        loadProfile(),
        listOwnedLessons(),
        listJoinedLessons(),
      ]);
      setProfile(loadedProfile);
      setOwned(ownedLessons);
      setJoined(joinedLessons);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udało się pobrać lekcji.");
    } finally {
      setBusy(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addLesson(kind: "lesson" | "set") {
    if (creating) return;
    setCreating(true);
    setError("");
    try {
      const today = localDate();
      const id = await createLesson({
        title: kind === "set" ? "Nowy zestaw słówek" : `Lekcja ${today}`,
        lessonDate: today,
        kind,
        teacherName: profile?.display_name || null,
      });
      router.push(`/lesson/?id=${encodeURIComponent(id)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udało się utworzyć lekcji.");
      setCreating(false);
    }
  }

  async function removeLesson(lesson: Lesson) {
    if (!window.confirm(`Usunąć „${lesson.title}” razem z fiszkami?`)) return;
    const snapshot = owned;
    setOwned((current) => current.filter((item) => item.id !== lesson.id));
    try {
      await deleteLesson(lesson.id);
    } catch (e) {
      // Przywracamy listę, żeby interfejs nie kłamał o skutecznym usunięciu.
      setOwned(snapshot);
      setError(e instanceof Error ? e.message : "Nie udało się usunąć lekcji.");
    }
  }

  async function leave(lesson: Lesson) {
    if (!window.confirm(`Wypisać się z lekcji „${lesson.title}”?`)) return;
    const snapshot = joined;
    setJoined((current) => current.filter((item) => item.id !== lesson.id));
    try {
      await leaveLesson(lesson.id);
    } catch (e) {
      setJoined(snapshot);
      setError(e instanceof Error ? e.message : "Nie udało się wypisać z lekcji.");
    }
  }

  async function switchRole(role: AppRole) {
    if (!profile || profile.role === role) return;
    const previous = profile;
    setProfile({ ...profile, role });
    try {
      await updateProfile({ role });
    } catch (e) {
      setProfile(previous);
      setError(e instanceof Error ? e.message : "Nie udało się zmienić roli.");
    }
  }

  async function signOut() {
    await getSupabaseBrowser().auth.signOut();
    router.replace("/");
  }

  const isTeacher = profile?.role === "teacher";
  const lessons = owned.filter((lesson) => lesson.lesson_kind === "lesson");
  const sets = owned.filter((lesson) => lesson.lesson_kind === "set");

  return (
    <main className="shell">
      <div className="topbar">
        <div>
          <div className="brand">J-Learner</div>
          <h1 style={{ marginBottom: 0 }}>
            {isTeacher ? "Lekcje angielskiego" : "Moje fiszki z lekcji"}
          </h1>
          {profile && (
            <div className="lesson-meta" style={{ marginTop: 6 }}>
              <span>{profile.display_name || "konto bez nazwy"}</span>
              <label className="role-switch">
                <span className="sr-only">Rola konta</span>
                <select
                  className="select small-select"
                  value={profile.role}
                  onChange={(event) => void switchRole(event.target.value as AppRole)}
                >
                  <option value="teacher">nauczyciel</option>
                  <option value="student">uczeń</option>
                </select>
              </label>
            </div>
          )}
        </div>
        <div className="topbar-actions">
          <Link className="btn ghost" href="/library">
            Biblioteka
          </Link>
          {isTeacher && (
            <>
              <button className="btn" onClick={() => void addLesson("lesson")} disabled={creating}>
                {creating ? "Tworzę…" : "+ Nowa lekcja"}
              </button>
              <button
                className="btn secondary"
                onClick={() => void addLesson("set")}
                disabled={creating}
              >
                + Nowy zestaw słówek
              </button>
            </>
          )}
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

      {!isTeacher && <JoinLessonBox onJoined={() => void load()} />}

      {busy ? (
        <div className="panel empty">Pobieram lekcje…</div>
      ) : isTeacher ? (
        <>
          <LessonList
            title="Lekcje na żywo"
            emptyText="Utwórz lekcję i podaj uczniom kod dołączenia."
            lessons={lessons}
            showJoinCode
            onDelete={(lesson) => void removeLesson(lesson)}
          />
          <LessonList
            title="Gotowe zestawy słówek"
            emptyText="Zestaw to gotowa lista słówek, którą publikujesz w bibliotece."
            lessons={sets}
            onDelete={(lesson) => void removeLesson(lesson)}
          />
          {joined.length > 0 && (
            <LessonList
              title="Lekcje, do których dołączyłeś"
              emptyText=""
              lessons={joined}
              onLeave={(lesson) => void leave(lesson)}
            />
          )}
        </>
      ) : (
        <>
          <LessonList
            title="Lekcje z nauczycielem"
            emptyText="Wpisz kod od nauczyciela powyżej, żeby dołączyć do lekcji."
            lessons={joined}
            onLeave={(lesson) => void leave(lesson)}
          />
          <LessonList
            title="Moje własne lekcje i kopie z biblioteki"
            emptyText="Skopiuj gotowy zestaw z biblioteki albo utwórz własną lekcję."
            lessons={owned}
            onDelete={(lesson) => void removeLesson(lesson)}
            footer={
              <button
                className="btn secondary small-btn"
                onClick={() => void addLesson("lesson")}
                disabled={creating}
              >
                {creating ? "Tworzę…" : "+ Własna lekcja"}
              </button>
            }
          />
        </>
      )}
    </main>
  );
}
