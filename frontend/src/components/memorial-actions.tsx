import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Tribute } from "@/lib/types";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

/**
 * Candle + remember (spec §8.11). The candle persists to MongoDB; "Remember"
 * enrols the signed-in member in this memorial's yearly remembrance via the
 * follow API and shows how many are remembering. Signed-out visitors are sent
 * to sign in — remembering is a personal, attributed act.
 */
export function CandleRemember({
  slug,
  initialCandles,
  initialRemembered = 0,
}: {
  slug: string;
  initialCandles: number;
  initialRemembered?: number;
}) {
  const { member } = useAuth();
  const navigate = useNavigate();
  const [lit, setLit] = useState(false);
  const [candles, setCandles] = useState(initialCandles);
  const [remembering, setRemembering] = useState(false);
  const [remembered, setRemembered] = useState(initialRemembered);
  const [busy, setBusy] = useState(false);

  // Reflect the signed-in member's current follow state (async — never a
  // synchronous setState in the effect body).
  useEffect(() => {
    if (!member) return;
    let alive = true;
    api.followState(slug)
      .then((r) => { if (alive) setRemembering(r.following); })
      .catch(() => {});
    return () => { alive = false; };
  }, [member, slug]);

  async function light() {
    if (lit) return;
    setLit(true);
    try {
      const { candles: c } = await api.lightCandle(slug);
      setCandles(c);
    } catch {
      setCandles((c) => c + 1);
    }
  }

  async function toggleRemember() {
    if (!member) {
      navigate("/signin");
      return;
    }
    if (busy) return;
    setBusy(true);
    const next = !remembering;
    setRemembering(next); // optimistic
    try {
      const r = next ? await api.follow(slug) : await api.unfollow(slug);
      setRemembering(r.following);
      setRemembered(r.remembering);
    } catch {
      setRemembering(!next); // revert on failure
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-8 flex flex-wrap items-center justify-center gap-3.5">
      <button
        type="button"
        disabled={lit}
        onClick={light}
        className="inline-flex items-center gap-2.5 rounded-full bg-ink px-5 py-3 text-sm text-cream transition-transform hover:-translate-y-px hover:bg-green-900 disabled:cursor-default"
      >
        <svg width="13" height="18" viewBox="0 0 24 34" fill="none" aria-hidden>
          <path d="M12 2C12 2 4 9 4 17a8 8 0 0 0 16 0c0-4-2-6-4-9-1.5 2-3 2.5-3 5 0 1.6-1 2.4-1 4" fill="#E9A23B" />
          <path d="M12 8c0 0-4 4-4 9a4 4 0 0 0 8 0c0-2.5-2-3.5-2-6-1 1-2 1.5-2 3" fill="#FBD46A" />
        </svg>
        <span>{lit ? "Candle lit" : "Light a candle"} · <b>{candles}</b></span>
      </button>
      <button
        type="button"
        onClick={toggleRemember}
        disabled={busy}
        aria-pressed={remembering}
        title={member ? undefined : "Sign in to remember"}
        className={`inline-flex items-center gap-2 rounded-full border px-5 py-3 text-sm transition-colors disabled:opacity-70 ${
          remembering ? "border-gold-brand bg-gold-brand text-cream" : "border-ink text-ink hover:border-gold-brand hover:text-gold-text"
        }`}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill={remembering ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.7" aria-hidden>
          <path d="M12 21s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 11c0 5.5-7 10-7 10z" />
        </svg>
        <span>
          {remembering ? "Remembering" : "Remember"}
          {remembered > 0 && <> · <b>{remembered}</b></>}
        </span>
      </button>
    </div>
  );
}

/** Tributes — posts to the Go API (lightly moderated for dignity in production). */
export function Tributes({ slug, initial }: { slug: string; initial: Tribute[] }) {
  const [list, setList] = useState<Tribute[]>(initial);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setBusy(true);
    try {
      const t = await api.addTribute(slug, { authorName: name.trim(), message: message.trim() });
      setList((cur) => [t, ...cur]);
    } catch {
      setList((cur) => [
        { id: `local-${cur.length}`, authorName: name.trim() || "A member of the community", message: message.trim(), createdAt: "just now" },
        ...cur,
      ]);
    }
    setName("");
    setMessage("");
    setBusy(false);
  }

  return (
    <div>
      <p className="mb-6 text-center text-sm italic text-ink-muted">
        {list.length} {list.length === 1 ? "person has" : "people have"} left a tribute
      </p>

      <div className="space-y-3.5">
        {list.map((t) => (
          <figure key={t.id} className="rounded-lg border border-sand bg-paper px-6 py-5">
            <blockquote className="font-serif text-ink">“{t.message}”</blockquote>
            <figcaption className="mt-3 flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span className="font-medium text-green">
                {t.authorName}
                {t.relation && <span className="ml-1 text-ink-faint">· {t.relation}</span>}
              </span>
              <span className="text-xs italic text-ink-faint">
                {t.createdAt === "just now" ? "just now" : t.createdAt.slice(0, 10)}
              </span>
            </figcaption>
          </figure>
        ))}
      </div>

      <form onSubmit={submit} className="mt-7 rounded-lg border border-dashed border-sand p-5 text-center">
        <textarea
          rows={3}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Share a memory or leave a word of comfort…"
          className="w-full resize-none rounded-md border border-sand bg-paper p-3 font-serif text-ink placeholder:italic placeholder:text-ink-faint focus:border-gold-brand focus:outline-none"
        />
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name (optional)"
          className="mt-3 w-full rounded-md border border-sand bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-gold-brand focus:outline-none"
        />
        <button type="submit" disabled={busy} className="mt-4 rounded-full bg-green px-7 py-2.5 text-sm font-semibold text-cream hover:bg-green-900 disabled:opacity-60">
          {busy ? "Leaving…" : "Leave a tribute"}
        </button>
        <p className="mt-3 text-xs text-ink-faint">Tributes are lightly reviewed for dignity before they appear.</p>
      </form>
    </div>
  );
}
