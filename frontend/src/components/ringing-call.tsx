import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

// A safety alert that rings like an incoming call. When `alert` is set, this
// takes over the screen with a looping ringtone + vibration until the person
// answers (View) or dismisses it. Used for critical alerts (PushPayload.Ring).
export interface RingingAlert {
  title: string;
  body?: string;
  url?: string;
  severity?: string; // high | critical
  kind?: string; // incident | directive
}

// A looping two-tone "ring … ring … pause" via Web Audio, scheduled ahead so it
// stays steady. Returns a stop function. Best-effort: if the AudioContext is
// suspended (no prior gesture) the visual + vibration still carry the alert.
function startRingtone(): () => void {
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return () => {};
  const ctx = new Ctor();
  void ctx.resume();
  let stopped = false;
  let timer = 0;

  const ringOnce = (at: number) => {
    for (const [i, freq] of [980, 760].entries()) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t0 = at + i * 0.42;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.22, t0 + 0.03);
      gain.gain.setValueAtTime(0.22, t0 + 0.32);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.4);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 0.42);
    }
  };

  const loop = () => {
    if (stopped) return;
    ringOnce(ctx.currentTime + 0.02);
    timer = window.setTimeout(loop, 2000); // ring cadence
  };
  loop();

  return () => {
    stopped = true;
    window.clearTimeout(timer);
    void ctx.close();
  };
}

export function RingingCall({ alert, onDismiss }: Readonly<{ alert: RingingAlert | null; onDismiss: () => void }>) {
  const navigate = useNavigate();
  const stopRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!alert) return;
    stopRef.current = startRingtone();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let vib = 0;
    if (!reduce && "vibrate" in navigator) {
      const buzz = () => { navigator.vibrate?.([500, 300, 500, 300]); };
      buzz();
      vib = window.setInterval(buzz, 2000);
    }
    return () => {
      stopRef.current();
      window.clearInterval(vib);
      navigator.vibrate?.(0);
    };
  }, [alert]);

  if (!alert) return null;
  const critical = alert.severity === "critical";

  function answer() {
    onDismiss();
    if (alert?.url) navigate(alert.url);
  }

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="Safety alert"
      className="fixed inset-0 z-[200] flex flex-col items-center justify-between bg-gradient-to-b from-green-950 via-green-900 to-[#0c2c1f] p-6 text-cream"
    >
      <div className="mt-16 flex flex-col items-center text-center">
        <span className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-clay/20 ring-4 ring-clay/40 motion-safe:animate-pulse" aria-hidden>
          <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gold">
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <path d="M12 9v4M12 17h.01" />
          </svg>
        </span>
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-gold/90">{critical ? "Critical alert" : "Safety alert"}</p>
        <h1 className="mt-3 max-w-md text-3xl font-semibold leading-tight text-cream">{alert.title}</h1>
        {alert.body && <p className="mt-4 max-w-md text-cream/80">{alert.body}</p>}
      </div>

      <div className="mb-10 flex w-full max-w-sm items-center justify-center gap-10">
        <button type="button" onClick={onDismiss} className="flex flex-col items-center gap-2 text-sm text-cream/80">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-clay text-cream shadow-lg transition-transform hover:scale-105" aria-hidden>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </span>
          Dismiss
        </button>
        <button type="button" onClick={answer} className="flex flex-col items-center gap-2 text-sm font-semibold text-cream">
          <span className="flex h-16 w-16 items-center justify-center rounded-full text-green-950 shadow-lg transition-transform motion-safe:animate-bounce hover:scale-105" style={{ backgroundColor: "#3fbf7f" }} aria-hidden>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
          </span>
          View
        </button>
      </div>
    </div>
  );
}
