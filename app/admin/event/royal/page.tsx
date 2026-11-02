"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { buildEventRulesText, isRoyalEvent } from "@/lib/eventConfig";
import { ROYAL_RULES, validateRoyalEvent } from "@/lib/royal";

type EventRow = { id: string; date: string; rules_text: string | null; players_count: number; max_players: number };
function nextMonday() {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Copenhagen", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + (8 - date.getUTCDay()) % 7);
  return date.toISOString().slice(0, 10);
}
export default function RoyalAdminPage() {
  const router = useRouter();
  const [date, setDate] = useState("");
  const [maxPlayers, setMaxPlayers] = useState(16);
  const [signupUrl, setSignupUrl] = useState("https://www.matchi.se/facilities/PadelhusetHelsinge");
  const [published, setPublished] = useState(true);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    setDate(nextMonday());
    fetch("/api/events?all=1&format=royal", { cache: "no-store" })
      .then(async res => { if (!res.ok) throw new Error("Kunne ikke hente events."); return res.json(); })
      .then(json => setEvents((json.data ?? []).filter((e: EventRow) => isRoyalEvent(e.rules_text))))
      .catch(e => setError(e.message)).finally(() => setLoading(false));
  }, []);
  async function create(e: React.FormEvent) {
    e.preventDefault();
    const body = { name: "Rangliste Padel Royal", date, start_time: "18:00:00", end_time: "20:00:00", location: "Helsinge", max_players: maxPlayers, min_elo: null, max_elo: null, only_women: false, closed_group: false, is_published: published, signup_url: signupUrl || null, rules_text: buildEventRulesText(ROYAL_RULES, { format: "royal" }) };
    const invalid = validateRoyalEvent(body);
    if (invalid) { setError(invalid); return; }
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/events?format=royal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Kunne ikke oprette Royal.");
      router.push(`/event/${json.data.id}`);
    } catch (e) { setError(e instanceof Error ? e.message : "Kunne ikke oprette Royal."); setSaving(false); }
  }
  return <main className="mx-auto max-w-3xl p-4 sm:p-8 text-gray-900 dark:text-gray-100">
    <Link href="/admin/event" className="text-pink-700 underline dark:text-pink-300">← Alle events</Link>
    <h1 className="mt-5 text-3xl font-bold">👑 Rangliste Padel Royal</h1>
    <p className="mt-3 rounded-xl border border-pink-200 bg-pink-50 p-4 text-sm leading-relaxed dark:border-pink-800 dark:bg-pink-950/20">{ROYAL_RULES}</p>
    <form onSubmit={create} className="my-6 space-y-4 rounded-xl border border-pink-300 p-5 dark:border-pink-800">
      <h2 className="text-xl font-bold">Opret Royal-dag</h2>
      <p className="text-sm opacity-75">Helsinge · Mandag kl. 18.00–20.00 · Baner CC, 1, 2 og 3</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label>Mandagsdato<input required type="date" value={date} onChange={e => setDate(e.target.value)} className="mt-1 w-full rounded-lg border p-2 dark:bg-zinc-900" /></label>
        <label>Antal spillere<select value={maxPlayers} onChange={e => setMaxPlayers(Number(e.target.value))} className="mt-1 w-full rounded-lg border p-2 dark:bg-zinc-900">{[4, 8, 12, 16].map(n => <option key={n} value={n}>{n} spillere · {n / 4} baner</option>)}</select></label>
      </div>
      <label className="block">Tilmeldingslink<input type="url" value={signupUrl} onChange={e => setSignupUrl(e.target.value)} className="mt-1 w-full rounded-lg border p-2 dark:bg-zinc-900" /></label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={published} onChange={e => setPublished(e.target.checked)} />Vis spilledagen i eventoversigten</label>
      {error && <p role="alert" className="text-red-600">{error}</p>}
      <button disabled={saving} className="rounded-lg bg-pink-600 px-5 py-2 font-semibold text-white disabled:opacity-50">{saving ? "Opretter…" : "Opret Royal-dag"}</button>
    </form>
    <h2 className="mb-3 text-xl font-bold">Royal-dage</h2>
    {loading && <p role="status">Indlæser…</p>}
    {!loading && !events.length && <p>Ingen Royal-dage endnu.</p>}
    <ul className="space-y-3">{events.map(event => <li key={event.id}><Link href={`/event/${event.id}`} className="block rounded-xl border border-pink-200 p-4 hover:bg-pink-50 dark:border-pink-800 dark:hover:bg-pink-950/30"><span className="font-semibold">👑 {event.date}</span><span className="ml-3 text-sm opacity-75">18.00–20.00 · {event.players_count}/{event.max_players} spillere →</span></Link></li>)}</ul>
    <Link href="/royal" className="mt-6 inline-block text-pink-700 underline dark:text-pink-300">Se Royal-siden for spillere</Link>
  </main>;
}
