'use client';
export const dynamic = 'force-dynamic';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { beregnEloForKampe, Kamp, EloMap } from '@/lib/beregnElo';

type StreakRow = {
  visningsnavn: string;
  bestStreak: number;
  streakElo: number; // samlet Elo vundet i streaken
  startDate: string | null;
  endDate: string | null;
  currentElo: number | null;
  isActive: boolean; // 👈 NYT: om den viste streak stadig er i gang
};

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
      console.error('Fejl ved pagineret hentning af newresults (Streak):', error);
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

export default function SejrStreakWallOfFame() {
  const [rows, setRows] = useState<StreakRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // 1) Hent alle sæt
        const rawKampe = await fetchAllNewresults();
        if (cancelled) return;

        // 2) Hent profiler for startElo -> initialEloMap
        const { data: profiles, error: profErr } = await supabase
          .from('profiles')
          .select('visningsnavn, startElo');

        if (profErr) {
          console.error('Fejl ved hentning af profiles til Streak:', profErr);
        }

        const DEFAULT_START_ELO = 1000;
        const initialEloMap: EloMap = {};
        (profiles ?? []).forEach((p: any) => {
          const navn = (p?.visningsnavn ?? '').toString().trim();
          if (!navn) return;
          const se = typeof p.startElo === 'number' ? p.startElo : DEFAULT_START_ELO;
          initialEloMap[navn] = se;
        });

        // 3) Map rå newresults -> Kamp[]
        const kampListe: Kamp[] = rawKampe.map((k: any, idx: number) => {
          const scoreA = k.scoreA ?? k.scorea ?? 0;
          const scoreB = k.scoreB ?? k.scoreb ?? 0;

          return {
            id: typeof k.id === 'number' ? k.id : idx + 1,
            kampid:
              typeof k.kampid === 'number'
                ? k.kampid
                : typeof k.kampId === 'number'
                ? k.kampId
                : typeof k.id === 'number'
                ? k.id
                : idx + 1,
            date: k.date ?? k.dato ?? '',
            holdA1: k.holdA1 ?? k.holda1 ?? '',
            holdA2: k.holdA2 ?? k.holda2 ?? '',
            holdB1: k.holdB1 ?? k.holdb1 ?? '',
            holdB2: k.holdB2 ?? k.holdb2 ?? '',
            scoreA: typeof scoreA === 'number' ? scoreA : parseInt(scoreA ?? '0', 10),
            scoreB: typeof scoreB === 'number' ? scoreB : parseInt(scoreB ?? '0', 10),
            finish: Boolean(k.finish),
            event: Boolean(k.event),
            tiebreak: k.tiebreak ?? k.tieBreak ?? '',
            indberettet_af: k.indberettet_af,
          };
        });

        // 4) Beregn Elo-ændringer pr. sæt
        const { eloChanges } = beregnEloForKampe(kampListe, initialEloMap);

        // 5) Byg player->liste af {date, won, eloDiff} i kronologisk rækkefølge
        type PlayerSet = {
          date: string;
          won: boolean;
          eloDiff: number;
        };

        const playerMap = new Map<string, PlayerSet[]>();

        const ensurePlayer = (name: string): PlayerSet[] => {
          const trimmed = name.trim();
          if (!trimmed) return [];
          let arr = playerMap.get(trimmed);
          if (!arr) {
            arr = [];
            playerMap.set(trimmed, arr);
          }
          return arr;
        };

        for (const kamp of kampListe) {
          const changesForKamp = eloChanges[kamp.id];
          if (!changesForKamp) continue;

          // Kun færdigspillede sæt til streak
          const finished =
            kamp.finish === true ||
            kamp.finish === (true as any) ||
            kamp.finish === (1 as any);

          if (!finished) continue;

          const ha1 = kamp.holdA1;
          const ha2 = kamp.holdA2;
          const hb1 = kamp.holdB1;
          const hb2 = kamp.holdB2;

          const scoreA = kamp.scoreA;
          const scoreB = kamp.scoreB;

          if (!Number.isFinite(scoreA) || !Number.isFinite(scoreB)) continue;
          if (scoreA === scoreB) continue; // ingen uafgjorte sæt

          const aWon = scoreA > scoreB;
          const bWon = scoreB > scoreA;

          const deltagere = [ha1, ha2, hb1, hb2].filter((n) => !!n) as string[];

          for (const navn of deltagere) {
            const c = changesForKamp[navn];
            const eloDiff = c?.diff ?? 0;

            const isA = navn === ha1 || navn === ha2;
            const isB = navn === hb1 || navn === hb2;

            let won = false;
            if (isA && aWon) won = true;
            if (isB && bWon) won = true;

            const arr = ensurePlayer(navn);
            arr.push({
              date: kamp.date,
              won,
              eloDiff,
            });
          }
        }

        // 6) For hver spiller: find længste streak + Elo i den streak
        type BestForPlayer = {
          visningsnavn: string;
          bestStreak: number;
          streakElo: number;
          startDate: string | null;
          endDate: string | null;
          isActive: boolean; // 👈 om bedste streak slutter ved seneste kamp
        };

        const bestList: BestForPlayer[] = [];

        for (const [navn, sets] of playerMap.entries()) {
          if (!sets.length) continue;

          let bestStreak = 0;
          let bestElo = 0;
          let bestStartIdx: number | null = null;
          let bestEndIdx: number | null = null;

          let curStreak = 0;
          let curElo = 0;
          let curStartIdx = 0;

          for (let i = 0; i < sets.length; i++) {
            const s = sets[i];
            if (s.won) {
              if (curStreak === 0) {
                curStartIdx = i;
                curElo = 0;
              }
              curStreak++;
              curElo += s.eloDiff;

              if (
                curStreak > bestStreak ||
                (curStreak === bestStreak && curElo > bestElo)
              ) {
                bestStreak = curStreak;
                bestElo = curElo;
                bestStartIdx = curStartIdx;
                bestEndIdx = i;
              }
            } else {
              // streak brudt
              curStreak = 0;
              curElo = 0;
            }
          }

          if (bestStreak > 0 && bestStartIdx !== null && bestEndIdx !== null) {
            const isActive = bestEndIdx === sets.length - 1; // 👈 slutter streaken ved sidste kamp?
            bestList.push({
              visningsnavn: navn,
              bestStreak,
              streakElo: bestElo,
              startDate: sets[bestStartIdx].date,
              endDate: sets[bestEndIdx].date,
              isActive,
            });
          }
        }

        // 7) Hent nuværende Elo fra /api/rangliste
        const res = await fetch('/api/rangliste', { cache: 'no-store' });
        const rangData = (await res.json()) as any[];

        const eloMap = new Map<string, number>();
        for (const r of rangData ?? []) {
          const navn = (r?.visningsnavn ?? '').toString().trim();
          const elo = Number(r?.elo ?? 0);
          if (!navn || !Number.isFinite(elo)) continue;
          eloMap.set(navn.toLowerCase(), elo);
        }

        // 8) Byg rows med currentElo
        let rowsArr: StreakRow[] = bestList.map((b) => {
          const currentElo = eloMap.get(b.visningsnavn.toLowerCase()) ?? null;
          return {
            visningsnavn: b.visningsnavn,
            bestStreak: b.bestStreak,
            streakElo: b.streakElo,
            startDate: b.startDate,
            endDate: b.endDate,
            currentElo,
            isActive: b.isActive,
          };
        });

        // 9) Sortér:
        //  - længste streak (desc)
        //  - mest Elo i streaken (desc)
        //  - nuværende Elo (desc)
        //  - navn (asc)
        rowsArr = rowsArr.sort((a, b) => {
          if (b.bestStreak !== a.bestStreak) return b.bestStreak - a.bestStreak;
          if (b.streakElo !== a.streakElo) return b.streakElo - a.streakElo;
          const eloA = a.currentElo ?? 0;
          const eloB = b.currentElo ?? 0;
          if (eloB !== eloA) return eloB - eloA;
          return a.visningsnavn.localeCompare(b.visningsnavn, 'da');
        });

        if (!cancelled) setRows(rowsArr);
      } catch (e) {
        console.error('Fejl i SejrStreakWallOfFame:', e);
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
          🏆 Sejr-streak Wall of Fame
        </h1>
        <p className="text-center opacity-70">Indlæser…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen py-10 px-4 sm:px-8 md:px-16 bg-white dark:bg-[#1e1e1e] text-gray-900 dark:text-white font-sans">
      <TopBar />

      <h1 className="text-2xl sm:text-4xl font-bold text-center text-pink-600 mb-10">
        🏆 Sejr-streak Wall of Fame
      </h1>

      {rows.length === 0 ? (
        <p className="text-center text-gray-500 dark:text-gray-400">
          Ingen registrerede sejr-streaks endnu.
        </p>
      ) : (
        <StreakList rows={rows} />
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

function StreakList({ rows }: { rows: StreakRow[] }) {
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
                      •{' '}
                      {rows.find((r) => r.visningsnavn === m.visningsnavn)
                        ?.bestStreak ?? 0}{' '}
                      sæt
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

      {/* Selve Wall of Fame-listen */}
      <ol className="space-y-4 max-w-2xl mx-auto">
        {rows.map((spiller, index) => {
          const isHighlighted = highlighted === spiller.visningsnavn;

          const eloDisplay =
            spiller.streakElo === 0
              ? '±0'
              : `${spiller.streakElo > 0 ? '+' : ''}${Math.round(
                  spiller.streakElo
                )}`;

          return (
            <li
              key={spiller.visningsnavn}
              ref={(el) => {
                itemRefs.current[spiller.visningsnavn] = el;
              }}
              className={[
                'flex flex-col sm:flex-row sm:items-center sm:justify-between rounded-2xl px-6 py-4 shadow transition-all gap-2',
                index === 0
                  ? 'bg-gradient-to-r from-emerald-500 to-pink-500 text-white scale-[1.03]'
                  : index === 1
                  ? 'bg-emerald-100 dark:bg-emerald-900/30'
                  : index === 2
                  ? 'bg-emerald-50 dark:bg-emerald-800/20'
                  : 'bg-white dark:bg-[#2a2a2a]',
                isHighlighted ? 'ring-2 ring-pink-500 animate-pulse' : '',
              ].join(' ')}
            >
              {/* Venstre: placering + navn + current Elo */}
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
                  {spiller.isActive && (
                    <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-100 bg-emerald-700/70 px-2 py-0.5 rounded-full">
                      🔥 Aktiv streak
                    </span>
                  )}
                </div>
              </div>

              {/* Højre: streak-info */}
              <div className="flex flex-col sm:items-end text-sm gap-1">
                <span className="font-semibold whitespace-nowrap">
                  🔥 Sejr-streak: {spiller.bestStreak} sæt
                </span>
                <span className="text-xs">
                  Elo i streak: <span className="font-semibold">{eloDisplay}</span>
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

