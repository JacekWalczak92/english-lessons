"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { WordImportPanel } from "@/components/words/WordImportPanel";
import { WordsStudy } from "@/components/words/WordsStudy";
import {
  clearPendingImport,
  deleteMyWords,
  listMyWords,
  readPendingImport,
  saveImportedWords,
  setFavorite,
  storePendingImport,
  type MyWord,
} from "@/lib/my-words";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { dedupeKey, localDay, readImportFromHash, type ImportedWord } from "@/lib/word-export-format";

type Filter = "all" | "favorites" | string; // string = konkretny dzień yyyy-mm-dd

/**
 * Karta „Moje słówka”: wszystko, co wyszukałem w aplikacji Słownik na telefonie.
 *
 * Słówka przychodzą na trzy sposoby: „Wyślij do J-Learner” w telefonie otwiera
 * tę stronę z ładunkiem w `#import=…`, plik `.json` z eksportu albo wklejka
 * `angielski;polski`. Fragment adresu nie trafia do serwera GitHub Pages, więc
 * słówka nie lądują w żadnym logu po drodze.
 */
export default function WordsPage() {
  const router = useRouter();
  const [words, setWords] = useState<MyWord[]>([]);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [importText, setImportText] = useState<string | null>(null);
  const [fromPhone, setFromPhone] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [studying, setStudying] = useState<MyWord[] | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const incoming = typeof window !== "undefined" ? readImportFromHash(window.location.hash) : null;
      if (incoming) {
        // Czyścimy adres od razu, żeby odświeżenie strony nie proponowało importu drugi raz.
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      }

      const { data: sessionData } = await getSupabaseBrowser().auth.getSession();
      if (!sessionData.session) {
        if (incoming) storePendingImport(incoming);
        router.replace("/");
        return;
      }

      const pending = incoming ?? readPendingImport();
      clearPendingImport();
      if (pending) {
        setImportText(pending);
        setFromPhone(true);
      }

      setWords(await listMyWords());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udało się pobrać słówek.");
    } finally {
      setBusy(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  const existingKeys = useMemo(() => new Set(words.map((word) => dedupeKey(word.english))), [words]);

  const days = useMemo(() => {
    const counts = new Map<string, number>();
    for (const word of words) {
      const day = localDay(word.looked_up_at ?? word.created_at);
      counts.set(day, (counts.get(day) ?? 0) + 1);
    }
    return [...counts.entries()];
  }, [words]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return words.filter((word) => {
      if (filter === "favorites" && !word.favorite) return false;
      if (filter !== "all" && filter !== "favorites" && localDay(word.looked_up_at ?? word.created_at) !== filter)
        return false;
      if (!needle) return true;
      return word.english.toLowerCase().includes(needle) || word.polish.toLowerCase().includes(needle);
    });
  }, [words, filter, query]);

  const grouped = useMemo(() => {
    const groups: Array<{ day: string; words: MyWord[] }> = [];
    for (const word of visible) {
      const day = localDay(word.looked_up_at ?? word.created_at);
      const last = groups[groups.length - 1];
      if (last && last.day === day) last.words.push(word);
      else groups.push({ day, words: [word] });
    }
    return groups;
  }, [visible]);

  async function saveImport(toSave: ImportedWord[]) {
    setSaving(true);
    setError("");
    try {
      const added = await saveImportedWords(toSave);
      setNotice(`Zapisano ${added} nowych słówek.`);
      setImportText(null);
      setFromPhone(false);
      setFilter("all");
      setWords(await listMyWords());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Nie udało się zapisać słówek.");
    } finally {
      setSaving(false);
    }
  }

  async function removeSelected() {
    const ids = [...selected];
    if (ids.length === 0 || !window.confirm(`Usunąć ${ids.length} słówek?`)) return;
    const snapshot = words;
    setWords((current) => current.filter((word) => !selected.has(word.id)));
    setSelected(new Set());
    try {
      await deleteMyWords(ids);
    } catch (e) {
      setWords(snapshot);
      setError(e instanceof Error ? e.message : "Nie udało się usunąć słówek.");
    }
  }

  async function toggleFavorite(word: MyWord) {
    const next = !word.favorite;
    setWords((current) => current.map((item) => (item.id === word.id ? { ...item, favorite: next } : item)));
    try {
      await setFavorite(word.id, next);
    } catch (e) {
      setWords((current) => current.map((item) => (item.id === word.id ? { ...item, favorite: !next } : item)));
      setError(e instanceof Error ? e.message : "Nie udało się zapisać gwiazdki.");
    }
  }

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const studyPool = selected.size > 0 ? words.filter((word) => selected.has(word.id)) : visible;

  return (
    <main className="shell">
      <div className="topbar">
        <div>
          <div className="brand">J-Learner</div>
          <h1 style={{ marginBottom: 0 }}>Moje słówka</h1>
          <p className="muted small" style={{ marginTop: 6 }}>
            Słówka wyszukane w aplikacji Słownik na telefonie. Widzisz je tylko Ty.
          </p>
        </div>
        <div className="topbar-actions">
          <button
            className="btn"
            onClick={() => {
              setImportText("");
              setFromPhone(false);
            }}
          >
            Importuj
          </button>
          <Link className="btn ghost" href="/dashboard">
            ← Moje lekcje
          </Link>
        </div>
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="success" role="status">
          {notice}
        </p>
      )}

      {importText !== null && !busy && (
        <WordImportPanel
          key={fromPhone ? "phone" : "manual"}
          initialText={importText}
          fromPhone={fromPhone}
          existingKeys={existingKeys}
          busy={saving}
          onSave={(toSave) => void saveImport(toSave)}
          onClose={() => {
            setImportText(null);
            setFromPhone(false);
          }}
        />
      )}

      {studying ? (
        <WordsStudy words={studying} onClose={() => setStudying(null)} />
      ) : busy ? (
        <div className="panel empty">Pobieram słówka…</div>
      ) : words.length === 0 ? (
        <div className="panel empty">
          <h2>Nie masz jeszcze słówek</h2>
          <p>
            W aplikacji Słownik otwórz <strong>Historia → Eksportuj → Wyślij do J-Learner</strong> albo
            zapisz plik .json i zaimportuj go tutaj.
          </p>
        </div>
      ) : (
        <>
          <section className="panel words-toolbar">
            <input
              className="input"
              type="search"
              placeholder="Szukaj po angielsku lub po polsku"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <div className="chip-row">
              <button className={`chip ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>
                Wszystkie · {words.length}
              </button>
              <button
                className={`chip ${filter === "favorites" ? "active" : ""}`}
                onClick={() => setFilter("favorites")}
              >
                ★ Ulubione
              </button>
              {days.slice(0, 14).map(([day, count]) => (
                <button
                  key={day}
                  className={`chip ${filter === day ? "active" : ""}`}
                  onClick={() => setFilter(day)}
                >
                  {day} · {count}
                </button>
              ))}
            </div>
            <div className="btn-row">
              <button className="btn" disabled={studyPool.length === 0} onClick={() => setStudying(studyPool)}>
                🎓 Ucz się ({studyPool.length})
              </button>
              {selected.size > 0 && (
                <>
                  <button className="btn danger small-btn" onClick={() => void removeSelected()}>
                    Usuń zaznaczone ({selected.size})
                  </button>
                  <button className="btn ghost small-btn" onClick={() => setSelected(new Set())}>
                    Odznacz
                  </button>
                </>
              )}
            </div>
          </section>

          {grouped.length === 0 ? (
            <div className="panel empty">Nic nie pasuje do filtra.</div>
          ) : (
            grouped.map((group) => (
              <section className="dashboard-section" key={group.day}>
                <div className="section-head">
                  <h2>{group.day}</h2>
                  <span className="small muted">{group.words.length}</span>
                </div>
                <ul className="panel word-list">
                  {group.words.map((word) => (
                    <li key={word.id} className={selected.has(word.id) ? "selected" : ""}>
                      <input
                        type="checkbox"
                        aria-label={`Zaznacz ${word.english}`}
                        checked={selected.has(word.id)}
                        onChange={() => toggleSelected(word.id)}
                      />
                      <div>
                        <strong>{word.english}</strong>
                        <div className="small muted">{word.polish}</div>
                      </div>
                      <button
                        className="btn icon-btn ghost"
                        aria-label={word.favorite ? "Usuń z ulubionych" : "Dodaj do ulubionych"}
                        aria-pressed={word.favorite}
                        onClick={() => void toggleFavorite(word)}
                      >
                        {word.favorite ? "★" : "☆"}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </>
      )}
    </main>
  );
}
