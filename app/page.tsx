"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Field } from "@/components/Field";
import { MISSING_CONFIG_MESSAGE, getSupabaseBrowser, readPublicConfig } from "@/lib/supabase-browser";
import { absoluteSiteUrl } from "@/lib/site-path";
import { FIELD_LIMITS, type AppRole } from "@/lib/types";

type Feedback = { kind: "success" | "error"; text: string } | null;

export default function HomePage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<AppRole>("student");
  const [busy, setBusy] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const configured = readPublicConfig() !== null;

  useEffect(() => {
    if (!configured) {
      setCheckingSession(false);
      setFeedback({ kind: "error", text: MISSING_CONFIG_MESSAGE });
      return;
    }
    let active = true;
    getSupabaseBrowser()
      .auth.getSession()
      .then(({ data }) => {
        if (!active) return;
        if (data.session) router.replace("/dashboard");
        else setCheckingSession(false);
      })
      .catch(() => active && setCheckingSession(false));
    return () => {
      active = false;
    };
  }, [configured, router]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !configured) return;
    setBusy(true);
    setFeedback(null);
    try {
      const supabase = getSupabaseBrowser();
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push("/dashboard");
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          // Rola trafia do user_metadata, a trigger w bazie przepisuje ją do
          // english_profiles — aplikacja czyta tylko tę drugą wartość.
          options: {
            emailRedirectTo: absoluteSiteUrl("/"),
            data: { app_role: role, display_name: displayName.trim() },
          },
        });
        if (error) throw error;
        if (data.session) router.push("/dashboard");
        else
          setFeedback({
            kind: "success",
            text: "Konto utworzone. Jeśli Supabase wymaga potwierdzenia e-maila, otwórz wiadomość i potwierdź konto.",
          });
      }
    } catch (error) {
      setFeedback({
        kind: "error",
        text: error instanceof Error ? error.message : "Nie udało się zalogować.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="center-shell">
      <section className="panel auth-panel">
        <div className="brand">J-Learner</div>
        <h1>English Lessons</h1>
        <p className="muted">
          Fiszki z lekcji angielskiego w jednym miejscu. Uczeń zamawia lekcję u wybranego
          nauczyciela, nauczyciel wypełnia ją słówkami, uczeń dopisuje komentarze i powtarza.
        </p>

        {checkingSession ? (
          <p className="muted" style={{ marginTop: 24 }}>
            Sprawdzam sesję…
          </p>
        ) : (
          <>
            <form onSubmit={submit} className="stack" style={{ marginTop: 24 }}>
              <Field label="E-mail">
                {(props) => (
                  <input
                    {...props}
                    className="input"
                    type="email"
                    autoComplete="email"
                    value={email}
                    disabled={!configured}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                  />
                )}
              </Field>
              {mode === "signup" && (
                <>
                  <Field label="Imię widoczne dla innych" hint="Tak podpisane będą Twoje fiszki.">
                    {(props) => (
                      <input
                        {...props}
                        className="input"
                        value={displayName}
                        maxLength={FIELD_LIMITS.display_name}
                        placeholder="np. Kasia"
                        disabled={!configured}
                        onChange={(event) => setDisplayName(event.target.value)}
                        required
                      />
                    )}
                  </Field>
                  <div className="field">
                    <span className="role-label">Zakładam konto jako</span>
                    <div className="role-choice" role="group" aria-label="Rola konta">
                      <button
                        type="button"
                        className={role === "student" ? "active" : ""}
                        aria-pressed={role === "student"}
                        onClick={() => setRole("student")}
                      >
                        Uczeń
                      </button>
                      <button
                        type="button"
                        className={role === "teacher" ? "active" : ""}
                        aria-pressed={role === "teacher"}
                        onClick={() => setRole("teacher")}
                      >
                        Nauczyciel
                      </button>
                    </div>
                    <span className="small muted">
                      {role === "student"
                        ? "Zakładasz lekcje i przypisujesz je nauczycielowi z listy."
                        : "Wypełniasz lekcje przypisane przez uczniów i gotowe zestawy słówek."}{" "}
                      Konto ma jeden tryb na stałe — do drugiej roli zakłada się osobne konto.
                    </span>
                  </div>
                </>
              )}

              <Field label="Hasło" hint={mode === "signup" ? "Minimum 6 znaków." : undefined}>
                {(props) => (
                  <input
                    {...props}
                    className="input"
                    type="password"
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    minLength={6}
                    value={password}
                    disabled={!configured}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                  />
                )}
              </Field>
              <button className="btn" disabled={busy || !configured}>
                {busy ? "Chwila…" : mode === "login" ? "Zaloguj" : "Utwórz konto"}
              </button>
            </form>

            <button
              className="btn ghost"
              style={{ width: "100%", marginTop: 8 }}
              disabled={!configured}
              onClick={() => {
                setMode(mode === "login" ? "signup" : "login");
                setFeedback(null);
              }}
            >
              {mode === "login" ? "Pierwszy raz? Utwórz konto" : "Mam konto — zaloguj"}
            </button>
          </>
        )}

        {feedback && (
          <p className={feedback.kind === "success" ? "success" : "error"} role="alert">
            {feedback.text}
          </p>
        )}
      </section>
    </main>
  );
}
