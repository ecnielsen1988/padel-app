'use client';
export const dynamic = 'force-dynamic';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

type EggRow = {
  visningsnavn: string;
  eggs: number;
  elo: number | null;
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
      console.error('Fejl ved pagineret hentning af newresults (Æggejagten):', error);
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

export default function AeggejagtenSide() {
  const [rows, setRows] = useState<EggRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // 1) Hent alle sæt
        const kampe = await fetchAllNewresults();
        if (cancelled) return;

        // 2) Byg map over æg pr. spiller
        const eggsMap = new Map<string, number>();

        const addEgg = (name?: string | null) => {
          if (!name) return;
          const key = name.toString().trim();
          if (!key) return;
          eggsMap.set(key, (eggsMap.get(key) ?? 0) + 1);
        };

        for (const k of kampe) {
          const finished =
            k.finish === true ||
            k.finish === 'true' ||
            k.finish === 1;

          if (!finished) continue;

          const ha1: string | undefined = k.holda1 ?? k.holdA1;
          const ha2: string | undefined = k.holda2 ?? k.holdA2;
          const hb1: string | undefined = k.holdb1 ?? k.holdB1;
          const hb2: string | undefined = k.holdb2 ?? k.holdB2;

          const rawA = k.scorea ?? k.scoreA;
          const rawB = k.scoreb ?? k.scoreB;

          let scoreA =
            typeof rawA === 'number' ? rawA : parseInt(rawA ?? '0', 10);
          let scoreB =
            typeof rawB === 'number' ? rawB : parseInt(rawB ?? '0', 10);

          if (isNaN(scoreA) || isNaN(scoreB)) continue;

          // Kun æg: 6–0
          if (scoreA === 6 && scoreB === 0) {
            addEgg(ha1);
            addEgg(ha2);
          } else if (scoreB === 6 && scoreA === 0) {
            addEgg(hb1);
            addEgg(hb2);
          }
        }

        // 3) Hent Elo fra /api/rangliste for tie-break ved samme antal æg
        const res = await fetch('/api/rangliste', { cache: 'no-store' });
        const rangData = (await res.json()) as any[];

        const eloMap = new Map<string, number>();
        for (const r of rangData ?? []) {
          const navn = (r?.visningsnavn ?? '').toString().trim();
          const elo = Number(r?.elo ?? 0);
          if (!navn || !Number.isFinite(elo)) continue;
          eloMap.set(navn.toLowerCase(), elo);
        }

        // 4) Byg rows-array
        const rowsArr: EggRow[] = Array.from(eggsMap.entries())
          .map(([visningsnavn, eggs]) => {
            const elo = eloMap.get(visningsnavn.toLowerCase()) ?? null;
            return { visningsnavn, eggs, elo };
          })
          .filter((r) => r.eggs > 0);

        // 5) Sortér: flest æg -> højeste Elo -> navn
        rowsArr.sort((a, b) => {
          if (b.eggs !== a.eggs) return b.eggs - a.eggs;
          const eloA = a.elo ?? 0;
          const eloB = b.elo ?? 0;
          if (eloB !== eloA) return eloB - eloA;
          return a.visningsnavn.localeCompare(b.visningsnavn, 'da');
        });

        if (!cancelled) setRows(rowsArr);
      } catch (e) {
        console.error('Fejl i Æggejagten:', e);
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
          🥚 Æggejagten
        </h1>
        <p className="text-center opacity-70">Indlæser…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen py-10 px-4 sm:px-8 md:px-16 bg-white dark:bg-[#1e1e1e] text-gray-900 dark:text-white font-sans">
      <TopBar />

      <h1 className="text-2xl sm:text-4xl font-bold text-center text-pink-600 mb-10">
        🥚 Æggejagten
      </h1>

      {rows.length === 0 ? (
        <p className="text-center text-gray-500 dark:text-gray-400">
          Der er endnu ikke givet nogen æg (6–0) i systemet.
        </p>
      ) : (
        <AeggeRanglisteList rows={rows} />
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

function AeggeRanglisteList({ rows }: { rows: EggRow[] }) {
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
        <div className="mt-2 w-[240px] rounded-xl border border-pink-200 dark:border-pink-900/50 bg-white/90 dark:bg-[#2a2a2a]/90 shadow-lg backdrop-blur p-2">
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
                      • {m.eggs} æg
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

      {/* Selve ranglisten */}
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
                'flex items-center justify-between rounded-2xl px-6 py-4 shadow transition-all',
                index === 0
                  ? 'bg-gradient-to-r from-yellow-400 to-pink-500 text-white scale-[1.03]'
                  : index === 1
                  ? 'bg-pink-100 dark:bg-pink-900/30'
                  : index === 2
                  ? 'bg-pink-50 dark:bg-pink-800/20'
                  : 'bg-white dark:bg-[#2a2a2a]',
                isHighlighted ? 'ring-2 ring-pink-500 animate-pulse' : '',
              ].join(' ')}
            >
              {/* Venstre: placering + navn */}
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <span className="text-base sm:text-xl font-bold text-pink-600 dark:text-pink-400">
                  #{index + 1}
                </span>
                <span className="text-sm sm:text-lg font-medium truncate">
                  {spiller.visningsnavn}
                </span>
              </div>

              {/* Højre: antal æg */}
              <div className="flex items-center gap-2 sm:gap-3">
                <span className="text-sm sm:text-base font-semibold whitespace-nowrap tabular-nums">
                  🥚: {spiller.eggs}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}
