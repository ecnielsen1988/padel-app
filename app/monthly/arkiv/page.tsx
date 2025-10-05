// app/monthly/arkiv/page.tsx
export const dynamic = "force-dynamic";

import Link from "next/link";

type Item = { visningsnavn: string; pluspoint: number };

function emojiForPluspoint(p: number) {
  if (p >= 100) return "🍾";
  if (p >= 50) return "🏆";
  if (p >= 40) return "🥇";
  if (p >= 30) return "☄️";
  if (p >= 20) return "🏸";
  if (p >= 10) return "🔥";
  if (p >= 5) return "📈";
  if (p >= 0) return "💪";
  if (p > -5) return "🎲";
  if (p > -10) return "📉";
  if (p > -20) return "🧯";
  if (p > -30) return "🪂";
  if (p > -40) return "❄️";
  if (p > -50) return "🙈";
  if (p > -100) return "🥊";
  return "💩";
}

function MonthBlock({ title, data }: { title: string; data: Item[] }) {
  return (
    <section className="max-w-xl mx-auto mb-10">
      <h2 className="text-xl font-bold text-pink-600 mb-3">{title}</h2>
      {(!data || data.length === 0) ? (
        <p className="text-gray-500 dark:text-gray-400">Ingen data.</p>
      ) : (
        <ol className="space-y-2">
          {data.slice(0, 20).map((x, i) => (
            <li
              key={`${title}-${x.visningsnavn}-${i}`}
              className="flex items-center justify-between rounded-xl px-4 py-2 bg-white dark:bg-[#2a2a2a] shadow"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-pink-600 font-bold shrink-0">#{i + 1}</span>
                <span className="font-medium truncate">{x.visningsnavn}</span>
              </div>
              <span
                className={`tabular-nums font-semibold ${x.pluspoint >= 0 ? "text-green-600" : "text-red-500"}`}
                title={`${x.pluspoint >= 0 ? "+" : ""}${x.pluspoint.toFixed(1)}`}
              >
                {x.pluspoint >= 0 ? "+" : ""}
                {x.pluspoint.toFixed(1)} {emojiForPluspoint(x.pluspoint)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function monthNameDa(i1to12: number) {
  const names = [
    "Januar","Februar","Marts","April","Maj","Juni",
    "Juli","August","September","Oktober","November","December",
  ];
  return names[i1to12 - 1] ?? String(i1to12);
}

/** Stabil base-URL uden headers() */
function getBaseUrl() {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (fromEnv) return fromEnv.startsWith("http") ? fromEnv : `https://${fromEnv}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

// Pak API-svaret ud så vi altid returnerer et array
async function fetchMonthly(year: number, month1to12: number): Promise<Item[]> {
  const base = getBaseUrl();
  const url = `${base}/api/monthly?year=${year}&month=${month1to12}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return [];
  const raw = await res.json();
  if (raw && Array.isArray(raw.data)) return raw.data as Item[]; // ny API
  if (Array.isArray(raw)) return raw as Item[];                  // gammel API fallback
  return [];
}

// ✅ Next.js 15: searchParams kan være en Promise — await dem
export default async function ArkivSide({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};

  // Default til indeværende år i Europe/Copenhagen
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Copenhagen",
    year: "numeric",
  });
  const currentYear = Number(fmt.format(now));

  const yearParam = Array.isArray(sp.year) ? sp.year[0] : sp.year;
  const year = Number(yearParam ?? currentYear);

  // Hent alle 12 måneder parallelt via API'en
  const dataPerMonth = await Promise.all(
    Array.from({ length: 12 }, (_, i) => fetchMonthly(year, i + 1))
  );

  return (
    <main className="min-h-screen py-8 px-4 sm:px-8 bg-gray-50 dark:bg-[#1e1e1e] text-gray-900 dark:text-white">
      <div className="flex items-center justify-between max-w-5xl mx-auto mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-pink-600">
          📈 Arkiv – Netto Elo pr. måned ({year})
        </h1>
        <div className="flex items-center gap-2">
          <Link
            href={`/monthly/arkiv?year=${year - 1}`}
            className="px-3 py-1.5 rounded-full border-2 border-pink-500 text-pink-600 bg-white/90 dark:bg-[#2a2a2a]/90 hover:bg-pink-50 dark:hover:bg-pink-900/20 transition"
          >
            ← {year - 1}
          </Link>
          <Link
            href={`/monthly/arkiv?year=${year + 1}`}
            className="px-3 py-1.5 rounded-full border-2 border-pink-500 text-pink-600 bg-white/90 dark:bg-[#2a2a2a]/90 hover:bg-pink-50 dark:hover:bg-pink-900/20 transition"
          >
            {year + 1} →
          </Link>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
        {dataPerMonth.map((data, idx) => (
          <MonthBlock key={`${year}-${idx + 1}`} title={monthNameDa(idx + 1)} data={data} />
        ))}
      </div>
    </main>
  );
}

