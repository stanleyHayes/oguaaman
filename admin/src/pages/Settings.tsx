import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PageHeader, Card, KeyVal, RoleBadge } from "@/components/ui";

/** A titled section card with an optional description and a gold accent bar. */
function Section({ title, description, children, className = "" }: Readonly<{ title: string; description?: string; children: ReactNode; className?: string }>) {
  return (
    <Card className={`p-5 ${className}`}>
      <div className="border-l-2 border-gold-border/60 pl-3">
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
      </div>
      <div className="mt-4">{children}</div>
    </Card>
  );
}

function RemembranceCard() {
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  async function run() {
    if (busy) return;
    setBusy(true); setResult(null);
    try {
      const { created } = await api.runRemembrance(date.trim() || undefined);
      const noun = created === 1 ? "notice" : "notices";
      setResult(created === 0 ? "No anniversaries today — no notices sent." : `Sent ${created} remembrance ${noun}.`);
    } catch (e) { setResult((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <Section title="Operations" description="Manual tools the daily scheduler also runs.">
      <div className="rounded-lg border border-sand bg-paper p-4">
        <h3 className="text-sm font-semibold text-ink">Yearly remembrance</h3>
        <p className="mt-1 text-sm text-ink-muted">The scheduler runs each day at 06:00. Trigger it manually or back-fill a date (steward only).</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input value={date} onChange={(e) => setDate(e.target.value)} placeholder="MM-DD (optional)" className="w-32 rounded-lg border border-sand bg-cream px-3 py-2 text-sm focus:border-gold-border focus:outline-none" />
          <button onClick={run} disabled={busy} className="rounded-full bg-green px-5 py-2.5 text-sm font-semibold text-cream transition-colors hover:bg-green-900 disabled:opacity-60">
            {busy ? "Running…" : "Run remembrance"}
          </button>
          {result && <span className="text-sm text-ink-muted">{result}</span>}
        </div>
      </div>
    </Section>
  );
}

export function Component() {
  const { member, signOut } = useAuth();
  return (
    <>
      <PageHeader kicker="Platform" title="Settings" />

      {/* Account & security */}
      <Section title="Account & security" description="How you sign in and protect your steward access." className="mb-5">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
          <div className="rounded-lg border border-sand bg-paper p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-ink">{member?.displayName ?? "Your account"}</span>
              {member && <RoleBadge role={member.role} />}
            </div>
            <p className="mt-2 text-sm text-ink-muted">
              Oguaa is <b>passwordless</b> — there is no password to set. You sign in with a one-time code sent to your phone or email,
              which is the spam-and-account-takeover guard that fits how Ghana already works (spec §8.1). Sessions last 30 days.
            </p>
            <p className="mt-2 text-xs text-ink-faint">To change your name, bio or photo, use your <Link to="/profile" className="font-medium text-ai underline">Profile</Link>.</p>
          </div>
          <button onClick={signOut} className="rounded-full border border-maroon-900/50 px-5 py-2.5 text-sm font-semibold text-maroon-900 transition-colors hover:bg-maroon-900/[0.06]">
            Sign out
          </button>
        </div>
      </Section>

      <div className="grid gap-5 lg:grid-cols-2">
        <RemembranceCard />

        <Section title="Platform configuration" description="Set via environment on the Go backend.">
          <dl>
            <KeyVal label="AI daily limit (global)">OGUAA_AI_DAILY_BUDGET · 60/day</KeyVal>
            <KeyVal label="AI per-member limit">OGUAA_AI_PER_MEMBER · 20/day</KeyVal>
            <KeyVal label="Sign-in">Passwordless OTP → JWT (AUTH_REQUIRED toggles enforcement)</KeyVal>
            <KeyVal label="SMS provider">OTP_PROVIDER · Hubtel (or dev log sender)</KeyVal>
            <KeyVal label="Image uploads">Cloudinary, or first-party /api/uploads</KeyVal>
            <KeyVal label="Languages">English (base) · Fante · Twi · Ga · Ewe</KeyVal>
            <KeyVal label="Roles">member · editor · curator · steward</KeyVal>
          </dl>
        </Section>

        <Section title="Surfaces" description="Where the platform is exposed." className="lg:col-span-2">
          <dl className="grid gap-x-8 sm:grid-cols-2">
            <KeyVal label="Marketing site">public window — history, culture, visit, news</KeyVal>
            <KeyVal label="Client portal">the app Cape Coasters sign into</KeyVal>
            <KeyVal label="REST / GraphQL">:8080/api · :8080/graphql</KeyVal>
            <KeyVal label="gRPC">oguaa.v1.OguaaService · :50051</KeyVal>
          </dl>
        </Section>
      </div>
    </>
  );
}
