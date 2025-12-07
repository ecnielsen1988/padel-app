'use client';
export const dynamic = 'force-dynamic';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

type PlayStreakRow = {
  visningsnavn: string;
  weeks: number;
  totalSets: number;
  startDate: string | null;
  endDate: string | null;
  currentElo: number | null;
};

type WeekEntry = {
  weekStart: Date;
  count: number;
  firstDate: string;
  lastDate: string;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_WEEK = 7 * MS_PER_DAY;

/** Henter ALLE rækker fra newresults via pagination */
async function fetchAllNewresults(): Promise<any[]> {
  const PAGE_SIZE = 1000;
  let all: any[] = [];
  let page = 0;

  while (true) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, error } = await supabase
      .from('newresults')
      .select('*')
      .order('date', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to);

    if (error) {
      console.error('Fejl ved pagineret hentning af newresults (PlayStreak):', error);
      if (page === 0) throw error;
      break;
    }

    const batch = data ?? [];
    all = all.concat(batch);

    if (batch.length < PAGE_SIZE) break; // sidste side
    page++;
  }

  return all;
}

export default function PlayStreakWallOfFame() {
  const [rows, setRows] = useState<PlayStreakRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // 1) Hent alle sæt
        const kampe = await fetchAllNewresults();
        if (cancelled) return;

        // 2) Byg per-spiller uge-maps
        // player -> (weekKey -> WeekEntry)
        const playerWeeks = new Map<string, Map<string, WeekEntry>>();

        const ensurePlayerWeek = (
          name: string,
          weekKey: string,
          weekStart: Date,
          dateStr: string
        ): WeekEntry => {
          const trimmed = name.trim();
          if (!trimmed) {
            // bør ikke ske hvis vi kalder rigtigt
            return {
              weekStart,
              count: 0,
              firstDate: dateStr,
              lastDate: dateStr,
            };
          }

          let weekMap = playerWeeks.get(trimmed);
          if (!weekMap) {
            weekMap = new Map<string, WeekEntry>();
            playerWeeks.set(trimmed, weekMap);
          }

          let entry = weekMap.get(weekKey);
          if (!entry) {
            entry = {
              weekStart,
              count: 0,
              firstDate: dateStr,
              lastDate: dateStr,
            };
            weekMap.set(weekKey, entry);
          }

          // opdatér count + første/sidste dato
          entry.count += 1;
          if (dateStr < entry.firstDate) entry.firstDate = dateStr;
          if (dateStr > entry.lastDate) entry.lastDate = dateStr;

          return entry;
        };

        const isFinished = (k: any): boolean =>
          k.finish === true || k.finish === 'true' || k.finish === 1;

        for (const k of kampe) {
          if (!isFinished(k)) continue;

          const dateStr: string | undefined = k.date;
          if (!dateStr) continue;

          const dt = new Date(dateStr);
          if (isNaN(dt.getTime())) continue;

          const ha1: string | undefined = k.holda1 ?? k.holdA1;
          const ha2: string | undefined = k.holda2 ?? k.holdA2;
          const hb1: string | undefined = k.holdb1 ?? k.holdB1;
          const hb2: string | undefined = k.holdb2 ?? k.holdB2;

          const players = [ha1, ha2, hb1, hb2].filter((n) => !!n) as string[];
          if (!players.length) continue;

          // find uge-start (mandag)
          const weekday = (dt.getDay() + 6) % 7; // mandag=0
          const weekStart = new Date(dt);
          weekStart.setDate(dt.getDate() - weekday);
          weekStart.setHours(0, 0, 0, 0);

          const weekKey = weekStart.toISOString().slice(0, 10);

          for (const p of players) {
            ensurePlayerWeek(p, weekKey, weekStart, dateStr);
          }
        }

        const now = new Date();
        const currentWeekStart = new Date(now);
        const currWeekday = (currentWeekStart.getDay() + 6) % 7;
        currentWeekStart.setDate(currentWeekStart.getDate() - currWeekday);
        currentWeekStart.setHours(0, 0, 0, 0);

        // 3) For hver spiller: find AKTUEL streak
        const bestRows: PlayStreakRow[] = [];

        for (const [navn, weekMap] of playerWeeks.entries()) {
          const entries = Array.from(weekMap.values());
          if (!entries.length) continue;

          // sortér uger kronologisk
          entries.sort(
            (a, b) => a.weekStart.getTime() - b.weekStart.getTime()
          );

          // kvalificerende uger = count >= 5
          const qualifying = entries.filter((w) => w.count >= 5);
          if (!qualifying.length) continue;

          // find "aktuel" streak: start fra sidste kvalificerende uge
          let weeks = 1;
          let totalSets = qualifying[qualifying.length - 1].count;
          let startIdx = qualifying.length - 1;
          const endIdx = qualifying.length - 1;

          for (let i = qualifying.length - 1; i > 0; i--) {
            const curr = qualifying[i];
            const prev = qualifying[i - 1];
            const diff = curr.weekStart.getTime() - prev.weekStart.getTime();
            if (diff === MS_PER_WEEK) {
              weeks++;
              totalSets += prev.count;
              startIdx = i - 1;
            } else {
              break;
            }
          }

          const lastQual = qualifying[endIdx];
          const diffToCurrent =
            currentWeekStart.getTime() - lastQual.weekStart.getTime();
          const diffWeeks = Math.round(diffToCurrent / MS_PER_WEEK);

          // Hvis der er gået mindst ÉN fuld uge siden sidste kvalificerende uge,
          // og den uge ikke selv var kvalificerende (vi har kun qualifying i listen),
          // så er streaken brudt → aktuel streak = 0.
          if (diffWeeks >= 2) {
            continue; // ingen aktuel streak
          }

          const startDate = qualifying[startIdx].firstDate;
          const endDate = qualifying[endIdx].lastDate;

          bestRows.push({
            visningsnavn: navn,
            weeks,
            totalSets,
            startDate,
            endDate,
            currentElo: null, // fyldes ud senere
          });
        }

        // 4) Hent nuværende Elo fra /api/rangliste til ranking
        const res = await fetch('/api/rangliste', { cache: 'no-store' });
        const rangData = (await res.json()) as any[];

        const eloMap = new Map<string, number>();
        for (const r of rangData ?? []) {
          const navn = (r?.visningsnavn ?? '').toString().trim();
          const elo = Number(r?.elo ?? 0);
          if (!navn || !Number.isFinite(elo)) continue;
          eloMap.set(navn.toLowerCase(), elo);
        }

        let rowsArr: PlayStreakRow[] = bestRows.map((r) => ({
          ...r,
          currentElo: eloMap.get(r.visningsnavn.toLowerCase()) ?? null,
        }));

        // 5) Sortér:
        //  - flest uger i træk
        //  - flest sæt i perioden
        //  - højest Elo
        //  - navn
        rowsArr = rowsArr.sort((a, b) => {
          if (b.weeks !== a.weeks) return b.weeks - a.weeks;
          if (b.totalSets !== a.totalSets) return b.totalSets - a.totalSets;
          const eloA = a.currentElo ?? 0;
          const eloB = b.currentElo ?? 0;
          if (eloB !== eloA) return eloB - eloA;
          return a.visningsnavn.localeCompare(b.visningsnavn, 'da');
        });

        if (!cancelled) setRows(rowsArr);
      } catch (e) {
        console.error('Fejl i PlayStreakWallOfFame:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <main className="min-h-screen py-10 px-4 sm:px-8 md:px-16 bg-white dark:bg-[#1e1e1e] text-gray-900 dark:text-white">
        <h1 className="text-2xl sm:text-4xl font-bold text-center text-pink-600 mb-6">
          📆 5 Games Streak
        </h1>
        <p className="text-center opacity-70">Indlæser…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen py-10 px-4 sm:px-8 md:px-16 bg-white dark:bg-[#1e1e1e] text-gray-900 dark:text-white font-sans">
      <TopBar />

      <h1 className="text-2xl sm:text-4xl font-bold text-center text-pink-600 mb-10">
        📆 5 Games Streak
      </h1>

      {rows.length === 0 ? (
        <p className="text-center text-gray-500 dark:text-gray-400">
          Ingen aktuelle spil-streaks endnu (uger med mindst 5 færdigspillede sæt).
        </p>
      ) : (
        <PlayStreakList rows={rows} />
      )}
    </main>
  );
}

/* ───────── VENSTRE: tilbage ───────── */

function TopBar() {
  return (
    <div className="fixed top-4 left-4 z-50 flex flex-col items-start gap-2">
      <Link
        href="/startside"
        aria-label="Tilbage"
        title="Tilbage"
        className="px-3 py-1.5 rounded-full border-2 border-pink-500 text-pink-600 bg-white/90 dark:bg-[#2a2a2a]/90 shadow hover:bg-pink-50 dark:hover:bg-pink-900/20 transition"
      >
        ← Tilbage
      </Link>
    </div>
  );
}

/* ───────── Liste + søgning ───────── */

function PlayStreakList({ rows }: { rows: PlayStreakRow[] }) {
  const [q, setQ] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const itemRefs = useRef<Record<string, HTMLLIElement | null>>({});

  const norm = (s?: string | null) => (s ?? '').trim().toLowerCase();

  const matches = useMemo(() => {
    if (!q) return [];
    const nq = norm(q);
    const starts = rows.filter((r) => norm(r.visningsnavn).startsWith(nq));
    const inc = rows.filter(
      (r) => !starts.includes(r) && norm(r.visningsnavn).includes(nq)
    );
    return [...starts, ...inc].slice(0, 8);
  }, [q, rows]);

  function jumpTo(name: string) {
    const el = itemRefs.current[name];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlighted(name);
      window.setTimeout(
        () => setHighlighted((prev) => (prev === name ? null : prev)),
        2500
      );
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!q) return;

    const exact = rows.find((r) => norm(r.visningsnavn) === norm(q));
    const target = exact?.visningsnavn ?? matches[0]?.visningsnavn;

    if (target) {
      jumpTo(target);
      setSearchOpen(false);
    }
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '–';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('da-DK', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  const formatRange = (start: string | null, end: string | null) => {
    if (!start && !end) return '–';
    if (start && !end) return formatDate(start);
    if (!start && end) return formatDate(end);
    if (start === end) return formatDate(start);
    return `${formatDate(start)} – ${formatDate(end)}`;
  };

  return (
    <>
      {/* HØJRE: søgning */}
      <button
        type="button"
        onClick={() => setSearchOpen((v) => !v)}
        className="fixed top-4 right-4 text-2xl leading-none hover:scale-110 transition z-50"
        title={searchOpen ? 'Luk søgning' : 'Søg spiller'}
        aria-label="Søg spiller"
      >
        🔎
      </button>

      {/* Søg-boks */}
      <div
        className={`fixed top-[52px] right-4 z-50 origin-top-right transition-all duration-200 ${
          searchOpen
            ? 'opacity-100 scale-100'
            : 'opacity-0 scale-95 pointer-events-none'
        }`}
      >
        <div className="mt-2 w-[260px] rounded-xl border border-pink-200 dark:border-pink-900/50 bg-white/90 dark:bg-[#2a2a2a]/90 shadow-lg backdrop-blur p-2">
          <form onSubmit={handleSubmit}>
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Søg visningsnavn…"
              className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e1e1e] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-pink-500"
            />
          </form>

          {!!matches.length && (
            <ul className="mt-2 max-h-60 overflow-auto">
              {matches.map((m) => (
                <li key={m.visningsnavn}>
                  <button
                    type="button"
                    onClick={() => {
                      jumpTo(m.visningsnavn);
                      setSearchOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-pink-50 dark:hover:bg-pink-900/20 text-sm"
                  >
                    {m.visningsnavn}
                    <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                      #
                      {rows.findIndex((r) => r.visningsnavn === m.visningsnavn) +
                        1}{' '}
                      • {rows.find((r) => r.visningsnavn === m.visningsnavn)?.weeks ?? 0}{' '}
                      uger
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-2 flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400">
            <span>↵ for at gå til første match</span>
            <button
              type="button"
              onClick={() => setSearchOpen(false)}
              className="px-2 py-1 rounded border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-[#1e1e1e]"
            >
              Luk
            </button>
          </div>
        </div>
      </div>

      {/* Selve Spil-streak-listen */}
      <ol className="space-y-4 max-w-2xl mx-auto">
        {rows.map((spiller, index) => {
          const isHighlighted = highlighted === spiller.visningsnavn;

          return (
            <li
              key={spiller.visningsnavn}
              ref={(el) => {
                itemRefs.current[spiller.visningsnavn] = el;
              }}
              className={[
                'flex flex-col sm:flex-row sm:items-center sm:justify-between rounded-2xl px-6 py-4 shadow transition-all gap-2',
                index === 0
                  ? 'bg-gradient-to-r from-sky-500 to-pink-500 text-white scale-[1.03]'
                  : index === 1
                  ? 'bg-sky-100 dark:bg-sky-900/30'
                  : index === 2
                  ? 'bg-sky-50 dark:bg-sky-800/20'
                  : 'bg-white dark:bg-[#2a2a2a]',
                isHighlighted ? 'ring-2 ring-pink-500 animate-pulse' : '',
              ].join(' ')}
            >
              {/* Venstre: placering + navn + Elo */}
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-base sm:text-xl font-bold text-pink-600 dark:text-pink-300">
                  #{index + 1}
                </span>
                <div className="flex flex-col min-w-0">
                  <span className="text-sm sm:text-lg font-medium truncate">
                    {spiller.visningsnavn}
                  </span>
                  <span className="text-xs opacity-80">
                    Nuværende Elo:{' '}
                    {spiller.currentElo !== null
                      ? Math.round(spiller.currentElo)
                      : '–'}
                  </span>
                </div>
              </div>

              {/* Højre: streak-info */}
              <div className="flex flex-col sm:items-end text-sm gap-1">
                <span className="font-semibold whitespace-nowrap">
                  📆 Spil-streak: {spiller.weeks} uger
                </span>
                <span className="text-xs">
                  Sæt i perioden:{' '}
                  <span className="font-semibold">
                    {spiller.totalSets}
                  </span>
                </span>
                <span className="text-xs text-gray-700 dark:text-gray-300">
                  Periode: {formatRange(spiller.startDate, spiller.endDate)}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}
