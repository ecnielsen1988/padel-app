'use client';

import { useEffect, useState } from 'react';
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

      const norm = (s?: string | null) => (s ?? '').trim().toLowerCase();
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
    <ol className="space-y-4 max-w-2xl mx-auto">
      {rows.map((spiller, index) => {
        const erKonge = spiller.visningsnavn === bedsteMand;
        const erDronning = spiller.visningsnavn === bedsteKvinde;

        return (
          <li
            key={spiller.visningsnavn}
            className={`flex items-center justify-between rounded-2xl px-6 py-4 shadow transition-all ${
              index === 0
                ? 'bg-gradient-to-r from-pink-500 to-pink-400 text-white scale-[1.03]'
                : index === 1
                ? 'bg-pink-100 dark:bg-pink-900/30'
                : index === 2
                ? 'bg-pink-50 dark:bg-pink-800/20'
                : 'bg-white dark:bg-[#2a2a2a]'
            }`}
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
  );
}

