"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { absoluteSiteUrl } from "@/lib/site-path";

export default function HomePage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    try {
      const supabase = getSupabaseBrowser();
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) router.replace("/dashboard");
      });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Brak konfiguracji");
    }
  }, [router]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
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
          options: { emailRedirectTo: absoluteSiteUrl("/") },
        });
        if (error) throw error;
        if (data.session) router.push("/dashboard");
        else setMessage("Konto utworzone. Jeśli Supabase wymaga potwierdzenia e-maila, otwórz wiadomość i potwierdź konto.");
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Nie udało się zalogować");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="center-shell">
      <section className="panel auth-panel">
        <div className="brand">J-Learner</div>
        <h1>English Lessons</h1>
        <p className="muted">Wspólny, szybki edytor fiszek używany podczas lekcji.</p>

        <form onSubmit={submit} className="stack" style={{ marginTop: 24 }}>
          <div className="field">
            <label>E-mail</label>
            <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="field">
            <label>Hasło</label>
            <input className="input" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <button className="btn" disabled={busy}>{busy ? "Chwila…" : mode === "login" ? "Zaloguj" : "Utwórz konto"}</button>
        </form>

        {message && <p className={message.startsWith("Konto") ? "success" : "error"}>{message}</p>}

        <button className="btn ghost" style={{ width: "100%", marginTop: 8 }} onClick={() => { setMode(mode === "login" ? "signup" : "login"); setMessage(""); }}>
          {mode === "login" ? "Pierwszy raz? Utwórz konto" : "Mam konto — zaloguj"}
        </button>
      </section>
    </main>
  );
}
