'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import Udfordring from './udfordring';

type Spiller = { visningsnavn: string; elo: number; koen: string | null };

export default function RanglisteClient({
  rows,
  bedsteMand,
  bedsteKvinde,
}: {
  rows: Spiller[];
  bedsteMand: string | null;
  bedsteKvinde: string | null;
}) {
  const [myName, setMyName] = useState<string | null>(null);
  const [myElo, setMyElo] = useState<number | null>(null);

  // 🔎 søge-UI state
  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState('');
  const [highlighted, setHighlighted] = useState<string | null>(null);

  // refs pr. spiller → så vi kan scrollIntoView
  const itemRefs = useRef<Record<string, HTMLLIElement | null>>({});

  const norm = (s?: string | null) => (s ?? '').trim().toLowerCase();

  const matches = useMemo(() => {
    if (!q) return [];
    const nq = norm(q);
    // vis max 8 forslag; prioriter startsWith, så includes bagefter
    const starts = rows.filter(r => norm(r.visningsnavn).startsWith(nq));
    const inc = rows.filter(
      r => !starts.includes(r) && norm(r.visningsnavn).includes(nq)
    );
    return [...starts, ...inc].slice(0, 8);
  }, [q, rows]);

  function jumpTo(name: string) {
    const el = itemRefs.current[name];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlighted(name);
      // fjern highlight efter 2.5s
      window.setTimeout(() => setHighlighted(prev => (prev === name ? null : prev)), 2500);
    }
  }

function goBack() {
  if (typeof window !== 'undefined') {
    if (window.history.length > 1) window.history.back();
    else window.location.href = '/';
  }
}

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!q) return;
    const exact = rows.find(r => norm(r.visningsnavn) === norm(q));
    const target = exact?.visningsnavn ?? matches[0]?.visningsnavn;
    if (target) {
      jumpTo(target);
      setSearchOpen(false);
    }
  }

  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!mounted) return;

      if (!user) {
        setMyName(null);
        setMyElo(null);
        return;
      }

      // Slå visningsnavn op i profiles (mere robust end user_metadata)
      const { data: prof } = await supabase
        .from('profiles')
        .select('visningsnavn')
        .eq('id', user.id)
        .maybeSingle();

      const visningsnavn =
        prof?.visningsnavn ??
        ((user.user_metadata as any)?.visningsnavn ?? null);

      setMyName(visningsnavn);

      const me = rows.find(r => norm(r.visningsnavn) === norm(visningsnavn));
      setMyElo(me ? me.elo : null);
    })();

    return () => {
      mounted = false;
    };
  }, [rows]);

  if (!rows.length) {
    return <p className="text-center text-gray-500 dark:text-gray-400">Ingen spillere i ranglisten</p>;
  }

  return (
    <>
      {/* 🔎 + ← Tilbage i øverste venstre hjørne */}
<div className="fixed top-4 left-4 z-50 flex flex-col items-start gap-2">
  {/* Toggle-knap */}
  <button
    type="button"
    onClick={() => setSearchOpen((v) => !v)}
    className="text-2xl leading-none hover:scale-110 transition"
    title={searchOpen ? 'Luk søgning' : 'Søg spiller'}
    aria-label="Søg spiller"
  >
    🔎
  </button>

  {/* ← Tilbage-knap */}
  <button
    type="button"
    onClick={goBack}
    aria-label="Tilbage"
    title="Tilbage"
    className="px-3 py-1.5 rounded-full border-2 border-pink-500 text-pink-600 bg-white/90 dark:bg-[#2a2a2a]/90 shadow hover:bg-pink-50 dark:hover:bg-pink-900/20 transition"
  >
    ← Tilbage
  </button>

        {/* Rullende søgeboks */}
        <div
          className={`origin-top-left transition-all duration-200 ${
            searchOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'
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

            {/* Forslagsliste */}
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
                        #{rows.findIndex(r => r.visningsnavn === m.visningsnavn) + 1} • {Math.round(m.elo)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* Hjælp/submit */}
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
      </div>

      {/* Selve ranglisten */}
      <ol className="space-y-4 max-w-2xl mx-auto">
        {rows.map((spiller, index) => {
          const erKonge = spiller.visningsnavn === bedsteMand;
          const erDronning = spiller.visningsnavn === bedsteKvinde;

          const isHighlighted = highlighted === spiller.visningsnavn;

          return (
            <li
              key={spiller.visningsnavn}
              ref={(el) => { itemRefs.current[spiller.visningsnavn] = el; }}
              className={[
                'flex items-center justify-between rounded-2xl px-6 py-4 shadow transition-all',
                index === 0
                  ? 'bg-gradient-to-r from-pink-500 to-pink-400 text-white scale-[1.03]'
                  : index === 1
                  ? 'bg-pink-100 dark:bg-pink-900/30'
                  : index === 2
                  ? 'bg-pink-50 dark:bg-pink-800/20'
                  : 'bg-white dark:bg-[#2a2a2a]',
                isHighlighted ? 'ring-2 ring-pink-500 animate-pulse' : ''
              ].join(' ')}
            >
              {/* Venstre: placering + navn */}
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <span className="text-base sm:text-xl font-bold text-pink-600 dark:text-pink-400">
                  #{index + 1}
                </span>
                <span className="text-sm sm:text-lg font-medium truncate">
                  {spiller.visningsnavn} {erKonge ? '👑' : erDronning ? '👸' : ''}
                </span>
              </div>

              {/* Højre: 🥊 + Elo */}
              <div className="flex items-center gap-2 sm:gap-3">
                <Udfordring
                  recipient={spiller.visningsnavn}
                  recipientElo={spiller.elo}
                  myName={myName}
                  myElo={myElo}
                />
                <span className="text-sm sm:text-base font-semibold whitespace-nowrap tabular-nums">
                  🎾: {Math.round(spiller.elo)}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}

