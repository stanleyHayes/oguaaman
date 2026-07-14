import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Container } from "./ui";

/**
 * The claim / manage affordance on an institution page (spec §8.13). Signed-in
 * members who already manage the institution get a "Manage" link; others can
 * request to manage it (a steward reviews the claim). Signed-out visitors see
 * nothing — claiming is an attributed, verified act.
 */
export function ManageBar({ slug, name }: Readonly<{ slug: string; name: string }>) {
  const { member } = useAuth();
  const [manages, setManages] = useState(false);
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState("");
  const [note, setNote] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!member) return;
    let alive = true;
    api.myInstitutions()
      .then((orgs) => { if (alive) setManages(orgs.some((o) => o.slug === slug)); })
      .catch(() => {});
    return () => { alive = false; };
  }, [member, slug]);

  if (!member) return null;

  if (manages) {
    return (
      <div className="border-b border-sand bg-gold/[0.07]">
        <Container className="flex flex-wrap items-center justify-between gap-3 py-3">
          <p className="text-sm text-ink-muted">You manage this institution’s official presence.</p>
          <Link
            to={`/education/${slug}/manage`}
            className="rounded-full bg-green px-4 py-2 text-sm font-semibold text-cream transition-colors hover:bg-green-900"
          >
            Manage {name} →
          </Link>
        </Container>
      </div>
    );
  }

  async function submit() {
    if (!role.trim() || state === "sending") return;
    setState("sending");
    try {
      await api.claimInstitution(slug, { requestedRole: role.trim(), note: note.trim() });
      setState("sent");
      setMsg("Request sent — a steward will review it and let you know.");
    } catch (e) {
      setState("error");
      setMsg((e as Error).message || "Could not send your request.");
    }
  }

  const claimView = !open ? (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-ink-muted">Hold an office here? Claim this institution’s official home.</p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border border-green/30 px-4 py-2 text-sm font-semibold text-green transition-colors hover:border-green"
      >
        Claim this institution
      </button>
    </div>
  ) : (
    <div className="space-y-3">
      <p className="text-sm font-medium text-ink">Request to manage {name}</p>
      <input
        type="text"
        value={role}
        onChange={(e) => setRole(e.target.value)}
        placeholder="Your office or role (e.g. OBA President, Headmaster)"
        className="w-full rounded-md border border-sand bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-gold-brand focus:outline-none"
      />
      <textarea
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Anything that helps us verify your standing (optional)"
        className="w-full resize-none rounded-md border border-sand bg-paper px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-gold-brand focus:outline-none"
      />
      {state === "error" && <p className="text-sm text-clay-text">{msg}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={state === "sending" || !role.trim()}
          className="rounded-full bg-green px-5 py-2 text-sm font-semibold text-cream transition-colors hover:bg-green-900 disabled:opacity-60"
        >
          {state === "sending" ? "Sending…" : "Send request"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-full px-4 py-2 text-sm text-ink-muted hover:text-ink">
          Cancel
        </button>
      </div>
    </div>
  );

  return (
    <div className="border-b border-sand bg-cream">
      <Container className="py-3">
        {state === "sent" ? (
          <p className="text-sm text-teal-text">{msg}</p>
        ) : claimView}
      </Container>
    </div>
  );
}
