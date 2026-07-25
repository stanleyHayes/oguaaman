import { useState, type ReactNode } from "react";
import { useLoaderData } from "react-router-dom";
import { CalendarCheck, Mail, MapPin, Phone, Users } from "lucide-react";
import { api } from "@/lib/api";
import type { ArtistBooking } from "@/lib/types";
import { Card, Empty } from "@/components/ui";
import { cedis } from "@/lib/format";

export async function loader(): Promise<ArtistBooking[]> {
  return api.artistBookings();
}

const STATUS: ArtistBooking["status"][] = ["new", "reviewing", "accepted", "declined"];
const tone: Record<ArtistBooking["status"], string> = {
  new: "bg-gold/[0.14] text-gold-text", reviewing: "bg-teal/[0.12] text-teal-text",
  accepted: "bg-green/[0.1] text-green-text", declined: "bg-maroon-900/[0.08] text-maroon-text",
};

export function Component() {
  const initial = useLoaderData() as ArtistBooking[];
  const [bookings, setBookings] = useState(initial);
  const [filter, setFilter] = useState<"all" | ArtistBooking["status"]>("all");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const shown = filter === "all" ? bookings : bookings.filter((booking) => booking.status === filter);

  async function update(booking: ArtistBooking, status: ArtistBooking["status"]) {
    setBusy(booking.id); setError("");
    try {
      const updated = await api.updateArtistBooking(booking.id, status, booking.artistNote ?? "");
      setBookings((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Could not update the booking.");
    } finally { setBusy(""); }
  }

  return <div>
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-gold-text">Artist workspace</p><h1 className="mt-1 text-3xl font-semibold text-ink">Booking inbox</h1><p className="mt-2 max-w-2xl text-sm text-ink-muted">Event requests sent directly from your public artist pages. Contact details are private to this dashboard.</p></div>
      <span className="rounded-full bg-green px-3 py-1.5 text-xs font-bold text-on-green">{bookings.filter((booking) => booking.status === "new").length} new</span>
    </div>

    <div className="mt-6 flex flex-wrap gap-2">{(["all", ...STATUS] as const).map((status) => <button type="button" key={status} onClick={() => setFilter(status)} className={`min-h-10 rounded-full border px-4 text-sm font-semibold capitalize ${filter === status ? "border-green bg-green text-on-green" : "border-sand bg-cream text-ink-muted"}`}>{status}</button>)}</div>
    {error && <p className="mt-4 rounded-xl bg-maroon-900/[0.08] p-3 text-sm text-maroon-text">{error}</p>}

    {shown.length === 0 ? <div className="mt-8"><Empty title={bookings.length ? "No requests in this view" : "No booking requests yet"}>{bookings.length ? "Choose another status to see more requests." : "When someone requests an artist through Oguaa, the full event brief will appear here."}</Empty></div> : <div className="mt-7 grid gap-5 xl:grid-cols-2">{shown.map((booking) => <Card key={booking.id} className="overflow-hidden p-0">
      <div className="border-b border-sand bg-paper px-5 py-4"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.13em] text-gold-text">{booking.artistName}</p><h2 className="mt-1 text-xl font-semibold text-ink">{booking.eventType}</h2><p className="mt-1 text-sm text-ink-muted">From {booking.requesterName}</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${tone[booking.status]}`}>{booking.status}</span></div></div>
      <div className="space-y-4 p-5">
        <div className="grid gap-3 text-sm text-ink-muted sm:grid-cols-2"><Info icon={<CalendarCheck size={15} />} label={new Date(`${booking.eventDate}T12:00:00`).toLocaleDateString(undefined, { dateStyle: "long" })} /><Info icon={<MapPin size={15} />} label={booking.location} />{booking.audienceSize ? <Info icon={<Users size={15} />} label={`${booking.audienceSize.toLocaleString()} expected`} /> : null}{booking.budgetPesewas ? <Info icon={<span className="text-xs font-bold">GH₵</span>} label={`${cedis(booking.budgetPesewas)} budget`} /> : null}</div>
        {booking.message && <p className="rounded-xl bg-paper p-4 text-sm leading-relaxed text-ink-muted">{booking.message}</p>}
        <div className="flex flex-wrap gap-2">{booking.requesterEmail && <a href={`mailto:${booking.requesterEmail}`} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-sand px-3 text-sm font-semibold text-ink-muted hover:border-green/35"><Mail size={14} /> Email</a>}{booking.requesterPhone && <a href={`tel:${booking.requesterPhone}`} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-sand px-3 text-sm font-semibold text-ink-muted hover:border-green/35"><Phone size={14} /> Call</a>}</div>
        <div className="border-t border-sand pt-4"><p className="mb-2 text-xs font-bold uppercase tracking-[0.13em] text-ink-faint">Move request to</p><div className="flex flex-wrap gap-2">{STATUS.filter((status) => status !== booking.status).map((status) => <button type="button" key={status} disabled={busy === booking.id} onClick={() => update(booking, status)} className="min-h-10 rounded-full border border-sand px-3 text-xs font-semibold capitalize text-ink-muted hover:border-green/35 hover:text-green-text disabled:opacity-50">{status}</button>)}</div></div>
      </div>
    </Card>)}</div>}
  </div>;
}

function Info({ icon, label }: Readonly<{ icon: ReactNode; label: string }>) {
  return <span className="flex min-w-0 items-center gap-2"><span className="text-teal-text">{icon}</span><span className="min-w-0 break-words">{label}</span></span>;
}
