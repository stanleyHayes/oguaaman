import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import type { Directive } from "@/lib/types";
import {
  ALERT_STYLE,
  DIRECTIVE_KIND_LABEL,
  SEVERITY_LABEL,
  countdown,
  isLive,
} from "@/lib/directives";

const SEEN_KEY = "oguaa.alerts.seen";
const SEEN_SEV_KEY = "oguaa.alerts.seen-sev";
const MUTED_KEY = "oguaa.alerts.muted";
const DISMISSED_KEY = "oguaa.alerts.dismissed";
const POLL_MS = 20_000;

// A severity is "loud" once it reaches high/critical — the band that earns a
// sound + buzz. Used both for newly-seen alerts and for escalations.
function isLoud(severity: string): boolean {
  return severity === "high" || severity === "critical";
}

// ── localStorage helpers (SSR/quota-safe) ─────────────────────────────────
function readStringSet(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.map(String)) : new Set();
  } catch {
    return new Set();
  }
}
function writeStringSet(key: string, set: Set<string>) {
  try {
    localStorage.setItem(key, JSON.stringify([...set]));
  } catch {
    /* ignore quota / disabled storage */
  }
}
function readMap(key: string): Record<string, string> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}
function writeMap(key: string, map: Record<string, string>) {
  try {
    localStorage.setItem(key, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

// A dismissal is keyed to the directive's current shape — if severity, window
// or action later change, the fingerprint changes and the alert reappears
// ("stays gone until it changes"). Critical alerts ignore dismissals entirely.
function fingerprint(d: Directive): string {
  return `${d.severity}|${d.status}|${d.effectiveUntil ?? ""}|${d.action ?? ""}`;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// ── Web Audio alert tone ───────────────────────────────────────────────────
// A single shared context, created lazily and unlocked on first interaction to
// dodge the autoplay policy. Everything is wrapped so a blocked/absent Web
// Audio API never throws into React.
let audioCtx: AudioContext | null = null;
function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    audioCtx ??= new Ctor();
  } catch {
    return null;
  }
  return audioCtx;
}
function playAlertTone() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
    const start = ctx.currentTime;
    // Three short beeps, high-low-high, to read as an alert rather than a chime.
    const offsets = [0, 0.24, 0.48];
    offsets.forEach((offset, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = i === 1 ? 660 : 880;
      const t0 = start + offset;
      const t1 = t0 + 0.16;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.2, t0 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t1 + 0.02);
    });
  } catch {
    /* autoplay blocked or Web Audio unavailable — banner still shows */
  }
}

function MegaphoneIcon({ className = "" }: Readonly<{ className?: string }>) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      <path d="M3 10.5v3A1.5 1.5 0 0 0 4.5 15H7l8 4.5v-15L7 9H4.5A1.5 1.5 0 0 0 3 10.5z" />
      <path d="M18.5 8.5a4.5 4.5 0 0 1 0 7" />
      <path d="M7 15v3.2A1.8 1.8 0 0 0 8.8 20h.4A1.8 1.8 0 0 0 11 18.2V16.6" />
    </svg>
  );
}
function BellIcon({ muted, className = "" }: Readonly<{ muted: boolean; className?: string }>) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
      {muted && <path d="M3 3l18 18" />}
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function AlertRow({
  d,
  nowMs,
  onDismiss,
}: Readonly<{ d: Directive; nowMs: number; onDismiss: (d: Directive) => void }>) {
  const s = ALERT_STYLE[d.severity];
  const critical = d.severity === "critical";
  const untilMs = d.effectiveUntil ? Date.parse(d.effectiveUntil) : NaN;
  const cd = !Number.isNaN(untilMs) ? countdown(untilMs, nowMs) : null;

  return (
    <div
      role={critical ? "alert" : "status"}
      aria-live={critical ? "assertive" : "polite"}
      className={`relative overflow-hidden rounded-xl border ring-1 ring-inset ${s.wrap} ${s.ring}`}
    >
      <span className={`absolute inset-y-0 left-0 w-1.5 ${s.rail}`} aria-hidden />
      <div className="flex items-start gap-3 py-3 pl-5 pr-2.5">
        <MegaphoneIcon className={`mt-0.5 h-5 w-5 shrink-0 ${s.accent}`} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.66rem] font-bold uppercase tracking-wide ${s.badge}`}>
              {critical && <span className="h-1.5 w-1.5 rounded-full bg-maroon-text motion-safe:animate-pulse" aria-hidden />}
              {DIRECTIVE_KIND_LABEL[d.kind]} · {SEVERITY_LABEL[d.severity]}
            </span>
            <span className="truncate text-xs font-medium text-ink-muted">{d.issuedByName}</span>
            {cd && (
              <span className={`ml-auto rounded-full border border-sand bg-paper/70 px-2 py-0.5 text-[0.66rem] font-semibold tabular-nums ${s.accent}`}>
                {cd}
              </span>
            )}
          </div>
          <p className={`mt-1 text-sm font-semibold leading-snug ${s.accent}`}>{d.title}</p>
          {d.action && <p className="mt-0.5 text-sm text-ink">{d.action}</p>}
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-muted">
            {d.area && <span>{d.area}</span>}
            <Link to="/alerts" className={`font-semibold underline-offset-2 hover:underline ${s.accent}`}>
              View all alerts
            </Link>
          </div>
        </div>
        {critical ? (
          <span
            className="shrink-0 self-center rounded-full border border-maroon-900/40 px-2 py-0.5 text-[0.58rem] font-bold uppercase tracking-wide text-maroon-text"
            title="Critical alerts stay until they clear"
          >
            Live
          </span>
        ) : (
          <button
            type="button"
            onClick={() => onDismiss(d)}
            aria-label={`Dismiss alert: ${d.title}`}
            className="shrink-0 self-start rounded-full p-1.5 text-ink-muted transition-colors hover:bg-ink/5 hover:text-ink"
          >
            <CloseIcon />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * A global, sticky, citizen-facing alert banner. It polls the public directives
 * feed, renders currently-active authority alerts as a stacked severity-colored
 * banner with live countdowns, and — when a newly-seen high/critical directive
 * appears — plays a short Web Audio tone and buzzes the device. Critical alerts
 * cannot be dismissed while active; the rest can be, and a mute toggle silences
 * the tone. Fully dark-theme-safe and screen-reader friendly.
 */
export function AlertBanner() {
  const [directives, setDirectives] = useState<Directive[]>([]);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [muted, setMuted] = useState<boolean>(() => {
    try {
      return localStorage.getItem(MUTED_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [dismissed, setDismissed] = useState<Record<string, string>>(() => readMap(DISMISSED_KEY));

  // Lazily initialised so localStorage is read/parsed once, not every render.
  const seenRef = useRef<Set<string> | null>(null);
  if (seenRef.current === null) seenRef.current = readStringSet(SEEN_KEY);
  // Last-seen severity per directive id, so an escalation into high/critical
  // re-alarms even after the id was first seen at a quieter severity.
  const seenSevRef = useRef<Map<string, string> | null>(null);
  if (seenSevRef.current === null) {
    seenSevRef.current = new Map(Object.entries(readMap(SEEN_SEV_KEY)));
  }
  const mutedRef = useRef(muted);
  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  // Fire sound + vibration for a newly-arrived high/critical alert. Per the
  // contract: the mute toggle silences sound; reduced-motion skips vibration.
  const fireAlert = useCallback(() => {
    if (!mutedRef.current) playAlertTone();
    if (!prefersReducedMotion() && typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      try {
        navigator.vibrate([200, 100, 200, 100, 400]);
      } catch {
        /* vibration unsupported */
      }
    }
  }, []);

  // Poll the active feed; detect newly-seen high/critical and alert on them.
  useEffect(() => {
    let alive = true;
    const load = () => {
      api
        .directives(true)
        .then((list) => {
          if (!alive) return;
          const seen = seenRef.current!;
          const seenSev = seenSevRef.current!;
          // Alarm when a directive is newly seen, or when an already-seen one
          // has escalated into the high/critical band since we last saw it.
          const alarm = list.some((d) => {
            if (!isLoud(d.severity)) return false;
            if (!seen.has(d.id)) return true;
            return !isLoud(seenSev.get(d.id) ?? "");
          });
          const activeIds = new Set(list.map((d) => d.id));
          let changed = false;
          for (const d of list) {
            if (!seen.has(d.id)) {
              seen.add(d.id);
              changed = true;
            }
            if (seenSev.get(d.id) !== d.severity) {
              seenSev.set(d.id, d.severity);
              changed = true;
            }
          }
          // Prune both stores to currently-active ids so they can't grow forever.
          for (const id of [...seen]) {
            if (!activeIds.has(id)) {
              seen.delete(id);
              changed = true;
            }
          }
          for (const id of [...seenSev.keys()]) {
            if (!activeIds.has(id)) {
              seenSev.delete(id);
              changed = true;
            }
          }
          if (changed) {
            writeStringSet(SEEN_KEY, seen);
            writeMap(SEEN_SEV_KEY, Object.fromEntries(seenSev));
          }
          // Drop dismissals for directives no longer active (also unbounded).
          setDismissed((prev) => {
            let mutated = false;
            const next: Record<string, string> = {};
            for (const id of Object.keys(prev)) {
              if (activeIds.has(id)) next[id] = prev[id];
              else mutated = true;
            }
            if (mutated) writeMap(DISMISSED_KEY, next);
            return mutated ? next : prev;
          });
          setDirectives(list);
          if (alarm) fireAlert();
        })
        .catch(() => {
          /* offline / API down — keep whatever we last showed */
        });
    };
    load();
    const timer = window.setInterval(load, POLL_MS);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [fireAlert]);

  // Unlock the audio context on the first user gesture so later alert tones can
  // sound (browsers keep a fresh AudioContext suspended until interaction).
  useEffect(() => {
    const unlock = () => {
      const ctx = getAudioContext();
      if (ctx && ctx.state === "suspended") void ctx.resume().catch(() => {});
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  // Tick a 1s clock only while alerts are on screen (drives the countdowns).
  useEffect(() => {
    if (directives.length === 0) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [directives.length]);

  const toggleMute = () => {
    setMuted((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(MUTED_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const dismiss = (d: Directive) => {
    if (d.severity === "critical") return; // non-dismissable while active
    setDismissed((prev) => {
      const next = { ...prev, [d.id]: fingerprint(d) };
      writeMap(DISMISSED_KEY, next);
      return next;
    });
  };

  const visible = directives.filter(
    (d) => isLive(d, nowMs) && !(d.severity !== "critical" && dismissed[d.id] === fingerprint(d)),
  );

  if (visible.length === 0) return null;

  return (
    <section
      aria-label="Community alerts"
      className="sticky top-14 z-30 border-b border-sand bg-paper/95 shadow-[var(--shadow-card)] backdrop-blur-sm"
    >
      <div className="mx-auto w-full max-w-6xl px-3 py-2.5 sm:px-4">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <p className="text-[0.62rem] font-bold uppercase tracking-[0.18em] text-ink-faint">
            {visible.length} active {visible.length === 1 ? "alert" : "alerts"}
          </p>
          <button
            type="button"
            onClick={toggleMute}
            aria-pressed={muted}
            aria-label={muted ? "Unmute alert sounds" : "Mute alert sounds"}
            className="inline-flex items-center gap-1.5 rounded-full border border-sand bg-cream px-2.5 py-1 text-[0.66rem] font-semibold text-ink-muted transition-colors hover:border-gold-border hover:text-ink"
          >
            <BellIcon muted={muted} />
            {muted ? "Muted" : "Sound on"}
          </button>
        </div>
        <div className="max-h-[55vh] space-y-2 overflow-y-auto">
          {visible.map((d) => (
            <AlertRow key={d.id} d={d} nowMs={nowMs} onDismiss={dismiss} />
          ))}
        </div>
      </div>
    </section>
  );
}
