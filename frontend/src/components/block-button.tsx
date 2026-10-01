import { useEffect, useState } from "react";
import { api, type BlockState } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const VARIANT = {
  dark: "min-h-11 rounded-full border border-cream/25 px-4 text-sm font-medium text-cream/80 transition-colors hover:border-maroon-900 hover:text-cream",
  link: "text-xs font-medium text-ink-faint transition-colors hover:text-clay-text",
} as const;

/**
 * Block / unblock a member (App Store Review Guideline 1.2; K5). Shown beside
 * member content. Only the viewer's own block can be lifted, so "Unblock"
 * appears only when `blockedByMe`. Blocking reloads the page so the member's
 * content disappears at once.
 */
export function BlockButton({ slug, name, variant = "dark" }: Readonly<{ slug: string; name: string; variant?: keyof typeof VARIANT }>) {
  const { member } = useAuth();
  const [state, setState] = useState<BlockState | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!member || member.slug === slug) return;
    let alive = true;
    api.memberBlockState(slug).then((r) => { if (alive) setState(r); }).catch(() => {});
    return () => { alive = false; };
  }, [member, slug]);

  if (!member || member.slug === slug) return null;
  const blockedByMe = Boolean(state?.blockedByMe);

  async function toggle() {
    if (!blockedByMe && !window.confirm(`Block ${name}? You will not see each other's posts, reviews or profile, and any follow between you is removed. You can undo this from your profile.`)) return;
    setBusy(true);
    try {
      const r = blockedByMe ? await api.unblockMember(slug) : await api.blockMember(slug);
      setState(r);
      if (r.blocked) window.location.reload(); // their content is withheld once blocked
    } catch {
      /* leave the button as it was */
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" onClick={toggle} disabled={busy} className={`${VARIANT[variant]} disabled:opacity-60`}>
      {blockedByMe ? "Unblock" : "Block"}
    </button>
  );
}
