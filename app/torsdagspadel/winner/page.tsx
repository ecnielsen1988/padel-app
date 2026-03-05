'use client';
export const dynamic = 'force-dynamic';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

type Profile = { visningsnavn?: string | null; torsdagspadel?: boolean | null };

type WinnerRow = {
  event_date: string; // YYYY-MM-DD
  placement: number; // 1..5
  visningsnavn: string;
  points: number;
};

function nowInCopenhagen(): Date {
  try {
    return new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Copenhagen' }));
  } catch {
    return new Date();
  }
}

function formatDanishDate(isoDate: string): string {
  const dt = new Date(`${isoDate}T00:00:00`);
  try {
    return dt.toLocaleDateString('da-DK', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'Europe/Copenhagen' });
  } catch {
    return dt.toLocaleDateString('da-DK', { day: '2-digit', month: 'long', year: 'numeric' });
  }
}

function medalForPlacement(p: number) {
  if (p === 1) return '🥇';
  if (p === 2) return '🥈';
  if (p === 3) return '🥉';
  if (p === 4) return '4️⃣';
  return '5️⃣';
}

function crownForRank(rank: number) {
  if (rank === 1) return '👑';
  if (rank === 2) return '🟣';
  if (rank === 3) return '🟢';
  return '';
}

export default function ThursdayWinnerScoreboardPage() {
  const cph = nowInCopenhagen();
  const defaultYear = cph.getFullYear();

  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState<boolean>(false);

  const [year, setYear] = useState<number>(defaultYear);
  const [rows, setRows] = useState<WinnerRow[]>([]);
  const [search, setSearch] = useState('');

  // gate: kun torsdagsdrengene
  useEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        const { data: auth } = await supabase.auth.getUser();
        const user = auth?.user;
        if (!user) {
          setAllowed(false);
          return;
        }

        const profResp = await (supabase.from('profiles') as any)
          .select('visningsnavn, torsdagspadel')
          .eq('id', user.id)
          .maybeSingle();

        const prof = (profResp?.data ?? null) as Profile | null;
        if (!prof?.torsdagspadel) {
          setAllowed(false);
          return;
        }
        setAllowed(true);
      } finally {
        setLoading(false);
      }
    };

    run();
  }, []);

  // load winners for selected year
  useEffect(() => {
    const loadYear = async () => {
      if (!allowed) return;

      setLoading(true);
      try {
        const from = `${year}-01-01`;
        const to = `${year}-12-31`;

        const resp = await (supabase.from('torsdag_winners') as any)
          .select('event_date, placement, visningsnavn, points')
          .gte('event_date', from)
          .lte('event_date', to)
          .order('event_date', { ascending: false })
          .order('placement', { ascending: true });

        if (resp?.error) {
          console.error('Fejl ved hentning af torsdag_winners:', resp.error);
          setRows([]);
          return;
        }

        setRows((resp?.data ?? []) as WinnerRow[]);
      } finally {
        setLoading(false);
      }
    };

    loadYear();
  }, [allowed, year]);

  // leaderboard aggregate (client-side)
  const leaderboard = useMemo(() => {
    const map = new Map<
      string,
      { name: string; points: number; top5: number; firsts: number; seconds: number; thirds: number; lasts: string | null }
    >();

    for (const r of rows) {
      const key = r.visningsnavn;
      const cur = map.get(key) ?? {
        name: r.visningsnavn,
        points: 0,
        top5: 0,
        firsts: 0,
        seconds: 0,
        thirds: 0,
        lasts: null,
      };

      cur.points += Number(r.points ?? 0);
      cur.top5 += 1;

      if (r.placement === 1) cur.firsts += 1;
      if (r.placement === 2) cur.seconds += 1;
      if (r.placement === 3) cur.thirds += 1;

      // rows er sorteret nyeste først, så første gang vi ser en spiller er deres “seneste dato”
      if (!cur.lasts) cur.lasts = r.event_date;

      map.set(key, cur);
    }

    const arr = Array.from(map.values()).sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.firsts !== a.firsts) return b.firsts - a.firsts;
      if (b.seconds !== a.seconds) return b.seconds - a.seconds;
      return a.name.localeCompare(b.name);
    });

    const q = search.trim().toLowerCase();
    if (!q) return arr;

    return arr.filter((x) => x.name.toLowerCase().includes(q));
  }, [rows, search]);

  // history grouped by date
  const history = useMemo(() => {
    const byDate = new Map<string, WinnerRow[]>();
    for (const r of rows) {
      if (!byDate.has(r.event_date)) byDate.set(r.event_date, []);
      byDate.get(r.event_date)!.push(r);
    }

    // ensure placements sorted
    const dates = Array.from(byDate.keys()).sort((a, b) => (a < b ? 1 : -1));
    return dates.map((d) => ({
      date: d,
      items: (byDate.get(d) ?? []).slice().sort((a, b) => a.placement - b.placement),
    }));
  }, [rows]);

  const yearOptions = useMemo(() => {
    // giv lidt tilbage og frem
    const y = defaultYear;
    return [y - 2, y - 1, y, y + 1].filter((x) => x >= 2024 && x <= 2035);
  }, [defaultYear]);

  if (loading && !rows.length) {
    return <p className="text-center mt-10 text-gray-700 dark:text-white">Indlæser…</p>;
  }

  if (!allowed) {
    return (
      <p className="text-center mt-10 text-gray-700 dark:text-white">
        Du har ikke adgang til denne side.
      </p>
    );
  }

  const top1 = leaderboard[0];
  const top2 = leaderboard[1];
  const top3 = leaderboard[2];

  return (
    <main className="max-w-3xl mx-auto p-4 sm:p-6 pb-24 text-zinc-900 dark:text-white">
      {/* Header */}
      <div className="mb-4 rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-zinc-900/60 shadow-sm overflow-hidden">
        <div className="h-2 bg-gradient-to-r from-emerald-600 via-green-500 to-emerald-600" />
        <div className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold">🏆 Torsdags Winner Ranking</h1>
              <p className="text-sm text-zinc-600 dark:text-zinc-300 mt-1">
                Point: 🥇10 · 🥈5 · 🥉3 · 4️⃣2 · 5️⃣1
              </p>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-zinc-900 px-3 py-2 text-sm font-semibold"
                aria-label="Vælg år"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔎 Søg spiller…"
            className="w-full rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-zinc-900 px-4 py-3 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
          />

          {/* Podium */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { label: '1. plads', icon: '👑', item: top1 },
              { label: '2. plads', icon: '🥈', item: top2 },
              { label: '3. plads', icon: '🥉', item: top3 },
            ].map((x) => (
              <div
                key={x.label}
                className="rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-900/10 p-4"
              >
                <div className="text-xs uppercase tracking-wide text-emerald-800/80 dark:text-emerald-200/80">
                  {x.icon} {x.label}
                </div>
                {x.item ? (
                  <div className="mt-2">
                    <div className="text-lg font-bold">{x.item.name}</div>
                    <div className="text-sm text-zinc-700 dark:text-zinc-300">
                      {x.item.points} point · 🥇{x.item.firsts} 🥈{x.item.seconds} 🥉{x.item.thirds}
                    </div>
                    {x.item.lasts && (
                      <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                        Senest top5: {formatDanishDate(x.item.lasts)}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">Ingen data endnu.</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Leaderboard list */}
      <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-zinc-900/60 overflow-hidden">
        <div className="px-4 py-3 border-b border-emerald-100 dark:border-emerald-900/40">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold">📈 Leaderboard ({year})</h2>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              {leaderboard.length} spillere
            </div>
          </div>
        </div>

        <div className="divide-y divide-emerald-100 dark:divide-emerald-900/40">
          {leaderboard.length === 0 ? (
            <div className="p-4 text-sm text-zinc-600 dark:text-zinc-300">Ingen resultater endnu.</div>
          ) : (
            leaderboard.map((p, idx) => {
              const rank = idx + 1;
              return (
                <div key={p.name} className="p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="w-10 text-sm font-bold text-zinc-900 dark:text-zinc-100">
                        #{rank} {crownForRank(rank)}
                      </div>
                      <div className="truncate font-semibold">{p.name}</div>
                    </div>

                    <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-300 flex flex-wrap gap-x-3 gap-y-1">
                      <span>🥇 {p.firsts}</span>
                      <span>🥈 {p.seconds}</span>
                      <span>🥉 {p.thirds}</span>
                      <span>Top5: {p.top5}</span>
                      {p.lasts && <span>Senest: {formatDanishDate(p.lasts)}</span>}
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <div className="text-xl font-extrabold text-emerald-700 dark:text-emerald-300">
                      {p.points}
                    </div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">point</div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* History */}
      <div className="mt-4 rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-zinc-900/60 overflow-hidden">
        <div className="px-4 py-3 border-b border-emerald-100 dark:border-emerald-900/40">
          <h2 className="text-lg font-bold">📅 Historik</h2>
          <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
            Top 5 pr. torsdag (nyeste øverst)
          </div>
        </div>

        <div className="divide-y divide-emerald-100 dark:divide-emerald-900/40">
          {history.length === 0 ? (
            <div className="p-4 text-sm text-zinc-600 dark:text-zinc-300">Ingen torsdage registreret endnu.</div>
          ) : (
            history.map((h) => (
              <div key={h.date} className="p-4">
                <div className="font-semibold">
                  {formatDanishDate(h.date)}
                </div>

                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {h.items.map((r) => (
                    <div
                      key={`${r.event_date}-${r.placement}-${r.visningsnavn}`}
                      className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-900/10 px-3 py-2 flex items-center justify-between"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">
                          {medalForPlacement(r.placement)} {r.visningsnavn}
                        </div>
                      </div>
                      <div className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
                        {r.points}p
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-6">
        <Link
          href="/torsdagspadel"
          className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-zinc-900/50 px-4 py-2 text-sm font-medium text-emerald-700 dark:text-emerald-200 hover:bg-emerald-50 dark:hover:bg-zinc-900 transition"
        >
          ← Tilbage til Torsdagspadel
        </Link>
      </div>
    </main>
  );
}