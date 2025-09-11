export const dynamic = 'force-dynamic';

import { supabase } from '@/lib/supabaseClient';
import { beregnNyRangliste } from '@/lib/beregnNyRangliste';

type Spiller = {
  visningsnavn: string;
  elo: number;
  koen: string | null;
};

type TorsdagProfilRow = { visningsnavn: string | null };

export default async function TorsdagspadelRangliste() {
  // Hele ranglisten
  const alleSpillere: Spiller[] = await beregnNyRangliste();

  // Hent torsdags-profiler (kun navne)
  const { data: torsdagsProfiler } = await (supabase
    .from('profiles') as any)
    .select('visningsnavn')
    .eq('torsdagspadel', true);

  // Robust normalisering af navne (trim + drop tomme)
  const torsdagsNavneSet = new Set(
    ((torsdagsProfiler as TorsdagProfilRow[] | null) ?? [])
      .map((p) => (p?.visningsnavn ?? '').toString().trim())
      .filter((v) => v.length > 0)
  );

  // Filtrér kun spillere med torsdags-flag
  const rangliste = alleSpillere.filter((spiller) =>
    torsdagsNavneSet.has(spiller.visningsnavn.toString().trim())
  );

  const bedsteMand = rangliste.find((s) => s.koen === 'mand') ?? null;
  const bedsteKvinde = rangliste.find((s) => s.koen === 'kvinde') ?? null;

  return (
    <main className="min-h-screen py-10 px-4 sm:px-8 md:px-16 bg-white dark:bg-[#1e1e1e] text-gray-900 dark:text-white font-sans">
      <h1 className="text-2xl sm:text-4xl font-bold text-center text-green-600 mb-10">
        🏋️‍♂️ Torsdagsranglisten 🏋️‍♂️
      </h1>

      {rangliste.length === 0 ? (
        <p className="text-center text-gray-500 dark:text-gray-400">
          Ingen spillere i ranglisten
        </p>
      ) : (
        <ol className="space-y-4 max-w-2xl mx-auto">
          {rangliste.map((spiller, index) => {
            const erKonge = bedsteMand && spiller.visningsnavn === bedsteMand.visningsnavn;
            const erDronning = bedsteKvinde && spiller.visningsnavn === bedsteKvinde.visningsnavn;

            return (
              <li
                key={spiller.visningsnavn}
                className={`flex items-center justify-between rounded-2xl px-6 py-4 shadow transition-all ${
                  index === 0
                    ? 'bg-gradient-to-r from-green-900 to-green-800 text-white scale-[1.03]'
                    : index === 1
                    ? 'bg-green-500 dark:bg-green-400/30'
                    : index === 2
                    ? 'bg-green-300 dark:bg-green-200/20'
                    : 'bg-white dark:bg-[#2a2a2a]'
                }`}
              >
                {/* Venstre: placering + navn */}
                <div className="flex items-center gap-2 sm:gap-3">
                  <span className="text-base sm:text-xl font-bold text-green-600 dark:text-green-400">
                    #{index + 1}
                  </span>
                  <span className="text-sm sm:text-lg font-medium">
                    {spiller.visningsnavn} {erKonge ? '👑' : erDronning ? '👸' : ''}
                  </span>
                </div>

                {/* Højre: Elo */}
                <span className="text-sm sm:text-base font-semibold whitespace-nowrap">
                  Elo: {Math.round(spiller.elo)}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </main>
  );
}
