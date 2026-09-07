"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { LessonList } from "@/components/dashboard/LessonList";
import { NewLessonPanel } from "@/components/dashboard/NewLessonPanel";
import { TourOverlay } from "@/components/onboarding/TourOverlay";
import {
  createLesson,
  deleteLesson,
  listAssignedLessons,
  listOwnedLessons,
  listTeachers,
  loadDisplayNames,
  loadProfile,
  updateProfileSettings,
} from "@/lib/account";
import { dashboardTour } from "@/lib/onboarding";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { useRouter } from "next/navigation";
import { useTour } from "@/lib/use-tour";
import type { AppProfile, Lesson, TeacherDirectoryEntry } from "@/lib/types";

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
  const [assigned, setAssigned] = useState<Lesson[]>([]);
  const [teachers, setTeachers] = useState<TeacherDirectoryEntry[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
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

      const loadedProfile = await loadProfile();
      setProfile(loadedProfile);

      const [ownedLessons, assignedLessons] = await Promise.all([
        listOwnedLessons(),
        loadedProfile?.role === "teacher" ? listAssignedLessons() : Promise.resolve([]),
      ]);
      setOwned(ownedLessons);
      setAssigned(assignedLessons);

      if (loadedProfile?.role === "student") setTeachers(await listTeachers());

      // Imiona drugiej strony każdej lekcji — jednym zapytaniem, nie po jednym na wiersz.
      setNames(
        await loadDisplayNames([
          ...ownedLessons.map((lesson) => lesson.assigned_teacher_id ?? ""),
          ...assignedLessons.map((lesson) => lesson.owner_id ?? ""),
        ]),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udało się pobrać lekcji.");
    } finally {
      setBusy(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  const tour = useTour(
    profile ? dashboardTour(profile.role) : null,
    profile?.user_id ?? null,
    !busy && !!profile,
  );

  async function createStudentLesson(input: {
    teacherId: string;
    teacherName: string;
    title: string;
    lessonDate: string;
    request: string;
  }) {
    setCreating(true);
    setError("");
    try {
      const id = await createLesson({
        title: input.title,
        lessonDate: input.lessonDate,
        kind: "lesson",
        teacherId: input.teacherId,
        teacherName: input.teacherName,
        studentRequest: input.request,
      });
      router.push(`/lesson/?id=${encodeURIComponent(id)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udało się założyć lekcji.");
      setCreating(false);
    }
  }

  async function createTeacherLesson(kind: "lesson" | "set") {
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

  async function toggleAccepting(accepting: boolean) {
    if (!profile) return;
    const previous = profile;
    setProfile({ ...profile, accepting_students: accepting });
    try {
      await updateProfileSettings({ accepting_students: accepting });
    } catch (e) {
      setProfile(previous);
      setError(e instanceof Error ? e.message : "Nie udało się zmienić ustawienia.");
    }
  }

  async function signOut() {
    await getSupabaseBrowser().auth.signOut();
    router.replace("/");
  }

  const isTeacher = profile?.role === "teacher";
  const ownLessons = owned.filter((lesson) => lesson.lesson_kind === "lesson");
  const sets = owned.filter((lesson) => lesson.lesson_kind === "set");

  return (
    <main className="shell">
      <div className="topbar">
        <div>
          <div className="brand">J-Learner</div>
          <h1 style={{ marginBottom: 0 }}>
            {isTeacher ? "Panel nauczyciela" : "Moje lekcje angielskiego"}
          </h1>
          {profile && (
            <div className="lesson-meta" style={{ marginTop: 6 }}>
              <span>{profile.display_name || "konto bez nazwy"}</span>
              <span className="badge">
                {isTeacher ? "konto nauczyciela" : "konto ucznia"}
              </span>
            </div>
          )}
        </div>
        <div className="topbar-actions">
          <button className="btn ghost" onClick={tour.start}>
            ❔ Instrukcja
          </button>
          <Link className="btn ghost" href="/library" data-tour="library">
            Biblioteka
          </Link>
          {isTeacher && (
            <>
              <button
                className="btn"
                data-tour="new-lesson"
                onClick={() => void createTeacherLesson("lesson")}
                disabled={creating}
              >
                {creating ? "Tworzę…" : "+ Własna lekcja"}
              </button>
              <button
                className="btn secondary"
                data-tour="new-set"
                onClick={() => void createTeacherLesson("set")}
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

      {isTeacher && profile && (
        <section className="panel availability" data-tour="availability">
          <label className="toggle">
            <input
              type="checkbox"
              checked={profile.accepting_students}
              onChange={(event) => void toggleAccepting(event.target.checked)}
            />
            <span>Przyjmuję nowych uczniów</span>
          </label>
          <p className="muted small">
            Gdy wyłączysz, znikasz z listy wyboru u uczniów. Lekcje już przypisane zostają.
          </p>
        </section>
      )}

      {!isTeacher && profile && (
        <NewLessonPanel
          teachers={teachers}
          defaultDate={localDate()}
          busy={creating}
          onCreate={(input) => void createStudentLesson(input)}
        />
      )}

      {busy ? (
        <div className="panel empty">Pobieram lekcje…</div>
      ) : isTeacher ? (
        <>
          <LessonList
            title="Lekcje przypisane przez uczniów"
            emptyText="Nikt jeszcze nie przypisał Ci lekcji. Uczeń wybiera Cię z listy nauczycieli."
            lessons={assigned}
            names={names}
            counterpartField="owner_id"
          />
          <LessonList
            title="Moje lekcje"
            emptyText="Własne lekcje przydają się na materiał przygotowany bez konkretnego ucznia."
            lessons={ownLessons}
            onDelete={(lesson) => void removeLesson(lesson)}
          />
          <LessonList
            title="Gotowe zestawy słówek"
            emptyText="Zestaw to gotowa lista słówek, którą publikujesz w bibliotece."
            lessons={sets}
            onDelete={(lesson) => void removeLesson(lesson)}
          />
        </>
      ) : (
        <LessonList
          title="Moje lekcje"
          emptyText="Wybierz nauczyciela powyżej, żeby założyć pierwszą lekcję."
          lessons={owned}
          names={names}
          counterpartField="assigned_teacher_id"
          onDelete={(lesson) => void removeLesson(lesson)}
        />
      )}

      {tour.active && <TourOverlay steps={tour.steps} onFinish={tour.finish} />}
    </main>
  );
}
