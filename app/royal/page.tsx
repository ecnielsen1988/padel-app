"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { isRoyalEvent } from "@/lib/eventConfig";
import { ROYAL_RULES } from "@/lib/royal";

type RoyalEvent = { id: string; date: string; rules_text: string | null; signup_url: string | null; players_count: number; max_players: number };

export default function RoyalPage() {
  const [events, setEvents] = useState<RoyalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/events?format=royal", { cache: "no-store" })
      .then(async res => { if (!res.ok) throw new Error("Kunne ikke hente spilledagene."); return res.json(); })
      .then(json => setEvents((json.data ?? []).filter((e: RoyalEvent) => isRoyalEvent(e.rules_text))))
      .catch(e => setError(e.message)).finally(() => setLoading(false));
  }, []);
  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-8 text-gray-900 dark:text-gray-100">
      <header className="mb-6 rounded-2xl border border-pink-300 bg-pink-50 p-6 dark:border-pink-800 dark:bg-pink-950/30">
        <p className="text-sm font-semibold uppercase tracking-wide text-pink-700 dark:text-pink-300">Mandag · Helsinge · 18.00–20.00</p>
        <h1 className="mt-2 text-3xl font-bold">👑 Rangliste Padel Royal</h1>
        <p className="mt-3">Ranglistepadel med tid til en hel kamp, før vi skifter makker.</p>
        <div className="mt-4 flex flex-wrap gap-2 text-sm">{["CC", "Bane 1", "Bane 2", "Bane 3", "Op til 16 spillere"].map(label => <span key={label} className="rounded-full border border-pink-300 px-3 py-1 dark:border-pink-700">{label}</span>)}</div>
      </header>
      <section className="mb-8 rounded-xl border border-pink-200 p-5 dark:border-pink-900">
        <h2 className="text-xl font-bold">Sådan spiller vi</h2>
        <p className="mt-3 leading-relaxed">{ROYAL_RULES}</p>
        <p className="mt-3 text-sm opacity-75">Alle spiller på samme bane i deres gruppe med fire spillere. Spillet slutter kl. 20.00. Resultater indberettes til den eksisterende rangliste efter de almindelige eventregler.</p>
      </section>
      <section>
        <h2 className="mb-3 text-xl font-bold">Kommende Royal-dage</h2>
        {loading && <p role="status">Indlæser spilledage…</p>}
        {error && <p role="alert" className="text-red-600">{error}</p>}
        {!loading && !error && !events.length && <p className="rounded-xl border p-5 opacity-75">Der er ingen kommende Royal-dage endnu.</p>}
        <ul className="space-y-3">{events.map(event => <li key={event.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-pink-200 bg-pink-50/50 p-4 dark:border-pink-900 dark:bg-pink-950/20">
          <div><p className="font-semibold">{new Date(`${event.date}T12:00:00`).toLocaleDateString("da-DK", { weekday: "long", day: "numeric", month: "long" })}</p><p className="text-sm opacity-75">18.00–20.00 · Helsinge · {event.players_count}/{event.max_players} spillere</p></div>
          {event.signup_url && <a href={event.signup_url} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-pink-600 px-4 py-2 font-semibold text-white">Tilmeld</a>}
        </li>)}</ul>
        <Link href="/kommende" className="mt-5 inline-block text-pink-700 underline dark:text-pink-300">Se spilleprogram og indtast resultater</Link>
      </section>
    </main>
  );
}
