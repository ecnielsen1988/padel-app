// app/active/arkiv/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import Link from "next/link";

type AktivItem = { visningsnavn: string; sæt: number; pluspoint?: number };

function medalje(i: number) {
  if (i === 0) return "🏆";
  if (i === 1) return "🥈";
  if (i === 2) return "🥉";
  return "🏃‍♂️";
}

function monthNameDa(i1to12: number) {
  const names = [
    "Januar","Februar","Marts","April","Maj","Juni",
    "Juli","August","September","Oktober","November","December",
  ];
  return names[i1to12 - 1] ?? String(i1to12);
}

/** Robust base-URL i SSR (Netlify/Vercel/local) */
function getBaseUrl() {
  // 1) Eksplicit domæne (anbefalet)
  const fromPublic = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (fromPublic) return fromPublic.startsWith("http") ? fromPublic : `https://${fromPublic}`;

  // 2) Netlify miljø-variabler
  const netlifyUrl =
    process.env.URL ??
    process.env.DEPLOY_URL ??
    process.env.DEPLOY_PRIME_URL ??
    process.env.SITE_URL;
  if (netlifyUrl) return netlifyUrl.replace(/\/$/, "");

  // 3) Vercel
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`.replace(/\/$/, "");

  // 4) Lokal dev
  if (process.env.NODE_ENV === "development") return "http://localhost:3000";

  // 5) Fallback til produktionsdomænet
  return "https://padelhuset-app.netlify.app";
}

// Hent /api/active?year=&month= og returnér altid et array
async function fetchActiveMonth(year: number, month1to12: number): Promise<AktivItem[]> {
  const base = getBaseUrl();
  const url = `${base}/api/active?year=${year}&month=${month1to12}`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return [];
    const raw = await res.json();
    // Ny API: { year, month, mode, data: [...] }
    if (raw && Array.isArray(raw.data)) return raw.data as AktivItem[];
    // Back-compat: hvis der returneres en rå liste
    if (Array.isArray(raw)) return raw as AktivItem[];
    return [];
  } catch {
    return [];
  }
}

function MonthBlock({ title, data }: { title: string; data: AktivItem[] }) {
  return (
    <section className="max-w-xl mx-auto mb-10">
      <h2 className="text-xl font-bold text-pink-600 mb-3">{title}</h2>
      {!data || data.length === 0 ? (
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
              <span className="tabular-nums font-semibold whitespace-nowrap">
                {x.sæt} sæt {medalje(i)}
                {typeof x.pluspoint === "number" && (
                  <span className="opacity-70 ml-2">
                    ({x.pluspoint >= 0 ? "+" : ""}{x.pluspoint.toFixed(1)})
                  </span>
                )}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

// Next.js 15: searchParams kan være en Promise — await dem
export default async function ArkivActive({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};

  // Default: indeværende år i Europe/Copenhagen
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Copenhagen",
    year: "numeric",
  });
  const currentYear = Number(fmt.format(now));

  const yearParam = Array.isArray(sp.year) ? sp.year[0] : sp.year;
  const year = Number(yearParam ?? currentYear);

  // Hent alle 12 måneder parallelt
  const dataPerMonth = await Promise.all(
    Array.from({ length: 12 }, (_, i) => fetchActiveMonth(year, i + 1))
  );

  return (
    <main className="min-h-screen py-8 px-4 sm:px-8 bg-gray-50 dark:bg-[#1e1e1e] text-gray-900 dark:text-white">
      <div className="flex items-center justify-between max-w-5xl mx-auto mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold text-pink-600">
          🏃‍♂️ Arkiv – Mest aktive pr. måned ({year})
        </h1>
        <div className="flex items-center gap-2">
          <Link
            href={`/active/arkiv?year=${year - 1}`}
            className="px-3 py-1.5 rounded-full border-2 border-pink-500 text-pink-600 bg-white/90 dark:bg-[#2a2a2a]/90 hover:bg-pink-50 dark:hover:bg-pink-900/20 transition"
          >
            ← {year - 1}
          </Link>
          <Link
            href={`/active/arkiv?year=${year + 1}`}
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

