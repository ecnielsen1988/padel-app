export const dynamic = 'force-dynamic';

import { beregnNyRangliste } from '../../lib/beregnNyRangliste';
import RanglisteClient from './RanglisteClient';

type Spiller = { visningsnavn: string; elo: number; koen: string | null };

export default async function NyRanglisteSide() {
  const rangliste: Spiller[] = await beregnNyRangliste();
  const bedsteMand = rangliste.find(s => s.koen === 'mand')?.visningsnavn ?? null;
  const bedsteKvinde = rangliste.find(s => s.koen === 'kvinde')?.visningsnavn ?? null;

  return (
    <main className="min-h-screen py-10 px-4 sm:px-8 md:px-16 bg-white dark:bg-[#1e1e1e] text-gray-900 dark:text-white font-sans">
      <h1 className="text-2xl sm:text-4xl font-bold text-center text-pink-600 mb-10">
        📋 Ranglisten
      </h1>

      <RanglisteClient rows={rangliste} bedsteMand={bedsteMand} bedsteKvinde={bedsteKvinde} />
    </main>
  );
}

