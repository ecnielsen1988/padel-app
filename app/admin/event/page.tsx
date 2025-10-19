'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type EventRow = {
  id: string | number;
  date: string | null;        // ISO dato eller datetime
  name: string | null;        // eventnavn
  location: string | null;
  start_time: string | null;  // forventes 'HH:MM' eller lign.
  end_time: string | null;    // forventes 'HH:MM' eller lign.
  closed_group: boolean | null;
  only_women: boolean | null;
};

export default function AdminEventPage() {
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [rows, setRows] = useState<EventRow[]>([]);

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);
        setErrorMsg(null);

        const { data, error } = await supabase
          .from('events')
          .select('id, date, name, location, start_time, end_time, closed_group, only_women')
          .order('date', { ascending: true }); // grovsortér stigende på dato

        if (error) throw error;
        setRows(data ?? []);
      } catch (err: any) {
        setErrorMsg(err?.message ?? 'Uventet fejl ved hentning af events.');
      } finally {
        setLoading(false);
      }
    };

    run();
  }, []);

  const sections = useMemo(() => {
    const toDateOnly = (iso: string) => {
      const d = new Date(iso);
      return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    };

    const today = (() => {
      const now = new Date();
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    })();

    const weekdayFallbackName = (d: Date) => {
      const wd = d.toLocaleDateString('da-DK', { weekday: 'long' }).toLowerCase();
      if (wd === 'onsdag') return 'Onsdags Mix & Match';
      if (wd === 'torsdag') return 'TorsdagsBold & Bajere';
      if (wd === 'fredag') return 'Fredags Fun & Fairplay';
      if (wd === 'søndag') return 'Søndags Social & Sets';
      return wd[0].toUpperCase() + wd.slice(1);
    };

    const fmtDate = (d: Date | null) =>
      d
        ? d.toLocaleDateString('da-DK', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })
        : 'Uden dato';

    // forsøger at holde HH:MM-format; hvis der står noget andet, viser vi råt
    const fmtTime = (t: string | null) => {
      if (!t) return null;
      const m = /^(\d{1,2}):(\d{2})/.exec(t);
      if (!m) return t;
      const hh = m[1].padStart(2, '0');
      const mm = m[2];
      return `${hh}:${mm}`;
    };

    const getEmoji = (closed: boolean | null, women: boolean | null) => {
      if (closed) return '🍺';
      if (women) return '💃';
      return '🎾';
    };

    // kombiner dato + starttid til sorteringsnøgle
    const sortKey = (date: Date | null, start: string | null) => {
      if (!date) return Number.POSITIVE_INFINITY;
      const hhmm = fmtTime(start);
      let extraMin = 0;
      if (hhmm && /^\d{2}:\d{2}$/.test(hhmm)) {
        const [hh, mm] = hhmm.split(':').map(Number);
        extraMin = hh * 60 + mm;
      }
      return date.getTime() + extraMin * 60 * 1000;
    };

    const normalized = rows.map((r) => {
      const d = r.date ? toDateOnly(r.date) : null;
      const name = (r.name ?? '').trim() || (d ? weekdayFallbackName(d) : 'Event');
      const emoji = getEmoji(!!r.closed_group, !!r.only_women);
      const start = fmtTime(r.start_time);
      const end = fmtTime(r.end_time);
      const timeLabel = start && end ? `${start}–${end}` : start || end || null;

      return {
        id: r.id,
        date: d,
        dateISO: r.date,
        dateLabel: fmtDate(d),
        name,
        emoji,
        location: r.location ?? null,
        start,
        end,
        timeLabel,
        sortVal: sortKey(d, r.start_time),
      };
    });

    const upcoming = normalized
      .filter((e) => e.date && e.date >= today)
      .sort((a, b) => a.sortVal - b.sortVal);

    const past = normalized
      .filter((e) => e.date && e.date < today)
      .sort((a, b) => a.sortVal - b.sortVal); // tidligste først (som ønsket)

    const undated = normalized.filter((e) => !e.date);

    return { upcoming, past, undated };
  }, [rows]);

  const EventCard = (ev: (typeof sections)['upcoming'][number]) => (
    <Link
      href={`/event/${ev.id}`}
      className="block rounded-xl border border-pink-200/40 bg-pink-50/40 hover:bg-pink-100/50 dark:bg-pink-950/20 dark:hover:bg-pink-950/30 transition-colors shadow-sm"
    >
      <div className="p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <div className="text-sm uppercase tracking-wide text-pink-700 dark:text-pink-300">
              {ev.dateLabel}
            </div>
            <div className="text-xl font-semibold">
              {ev.emoji} {ev.name} {ev.emoji}
            </div>
          </div>
          <div className="flex flex-col items-start sm:items-end gap-1 text-sm">
            {ev.timeLabel && <div>⏰ {ev.timeLabel}</div>}
            {ev.location && <div className="text-zinc-700 dark:text-zinc-300">📍 {ev.location}</div>}
          </div>
        </div>
      </div>
    </Link>
  );

  const PastCard = (ev: (typeof sections)['past'][number]) => (
    <Link
      href={`/event/${ev.id}`}
      className="block rounded-xl border border-zinc-300/40 bg-white/60 hover:bg-zinc-50/80 dark:bg-zinc-900/40 dark:hover:bg-zinc-900/60 transition-colors shadow-sm"
    >
      <div className="p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <div className="text-sm uppercase tracking-wide text-zinc-600 dark:text-zinc-300">
              {ev.dateLabel}
            </div>
            <div className="text-xl font-semibold">
              {ev.emoji} {ev.name} {ev.emoji}
            </div>
          </div>
          <div className="flex flex-col items-start sm:items-end gap-1 text-sm">
            {ev.timeLabel && <div>⏰ {ev.timeLabel}</div>}
            {ev.location && <div className="text-zinc-700 dark:text-zinc-300">📍 {ev.location}</div>}
          </div>
        </div>
      </div>
    </Link>
  );

  return (
    <main className="max-w-3xl mx-auto p-6 sm:p-8 text-gray-900 dark:text-white">
      <header className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">📅 Admin · Event</h1>

        <Link
          href="/lavevent"
          className="inline-flex items-center gap-2 bg-pink-600 hover:bg-pink-700 text-white font-semibold py-2.5 px-4 rounded-xl shadow"
        >
          ➕ Lav event
        </Link>
      </header>

      {loading && (
        <div className="animate-pulse rounded-xl border border-pink-200/40 p-4">
          Indlæser events…
        </div>
      )}

      {!loading && errorMsg && (
        <div className="rounded-xl border border-red-400/50 bg-red-50/10 text-red-600 dark:text-red-400 p-4">
          Kunne ikke hente events: {errorMsg}
        </div>
      )}

      {!loading && !errorMsg && rows.length === 0 && (
        <div className="rounded-xl border border-zinc-300/30 p-6 text-zinc-600 dark:text-zinc-300">
          Ingen events endnu. Klik <span className="font-semibold">“Lav event”</span> for at oprette det første.
        </div>
      )}

      {!loading && !errorMsg && rows.length > 0 && (
        <div className="grid gap-8">
          {/* Kommende events */}
          <section>
            <h2 className="text-xl font-bold mb-3">Kommende events</h2>
            {sections.upcoming.length === 0 ? (
              <div className="rounded-lg border border-zinc-300/30 p-4 text-zinc-600 dark:text-zinc-300">
                Ingen kommende events.
              </div>
            ) : (
              <ul className="grid gap-3">
                {sections.upcoming.map((ev) => (
                  <li key={ev.id}>{EventCard(ev)}</li>
                ))}
              </ul>
            )}
          </section>

          {/* Tidligere events */}
          <section>
            <h2 className="text-xl font-bold mb-3">Tidligere events</h2>
            {sections.past.length === 0 ? (
              <div className="rounded-lg border border-zinc-300/30 p-4 text-zinc-600 dark:text-zinc-300">
                Ingen tidligere events.
              </div>
            ) : (
              <ul className="grid gap-3">
                {sections.past.map((ev) => (
                  <li key={ev.id}>{PastCard(ev)}</li>
                ))}
              </ul>
            )}
          </section>

          {/* Uden dato */}
          {sections.undated.length > 0 && (
            <section>
              <h2 className="text-xl font-bold mb-3">Uden dato</h2>
              <ul className="grid gap-3">
                {sections.undated.map((ev) => (
                  <li key={ev.id}>{PastCard(ev)}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      <div className="mt-8">
        <Link
          href="/admin"
          className="inline-block bg-zinc-800 hover:bg-zinc-900 text-white font-semibold py-2 px-4 rounded-lg"
        >
          ⬅ Tilbage til Admin
        </Link>
      </div>
    </main>
  );
}

