// app/active/arkiv/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { beregnEloÆndringerForMåned } from "@/lib/beregnEloMonthly";

type AktivItem = { visningsnavn: string; sæt: number; pluspoint?: number };
type KampRow = {
  holdA1?: string | null;
  holdA2?: string | null;
  holdB1?: string | null;
  holdB2?: string | null;
};

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

function monthStartCph(year: number, month1to12: number): string {
  const d = new Date(Date.UTC(year, month1to12 - 1, 1, 0, 0, 0));
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Copenhagen",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(d);
}

function nextMonthStartCph(year: number, month1to12: number): string {
  const d = new Date(Date.UTC(year, month1to12 - 1, 1, 0, 0, 0));
  d.setUTCMonth(d.getUTCMonth() + 1);
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Copenhagen",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(d);
}

async function fetchAllMonthRows(year: number, month1to12: number): Promise<KampRow[]> {
  const PAGE_SIZE = 1000;
  const start = monthStartCph(year, month1to12);
  const endExclusive = nextMonthStartCph(year, month1to12);
  let from = 0;
  const out: KampRow[] = [];

  while (true) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("newresults")
      .select("holdA1, holdA2, holdB1, holdB2")
      .gte("date", start)
      .lt("date", endExclusive)
      .eq("finish", true)
      .range(from, to);

    if (error) {
      console.error("Fejl ved hentning af active-arkiv:", error);
      break;
    }

    const batch = (data ?? []) as KampRow[];
    out.push(...batch);

    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return out;
}

async function fetchActiveMonth(year: number, month1to12: number): Promise<AktivItem[]> {
  const [eloNetto, rows] = await Promise.all([
    beregnEloÆndringerForMåned(year, month1to12),
    fetchAllMonthRows(year, month1to12),
  ]);

  const count = new Map<string, number>();
  for (const row of rows) {
    for (const name of [row.holdA1, row.holdA2, row.holdB1, row.holdB2]) {
      const key = typeof name === "string" ? name.trim() : "";
      if (key) count.set(key, (count.get(key) ?? 0) + 1);
    }
  }

  return Array.from(count.entries())
    .map(([visningsnavn, sæt]) => ({
      visningsnavn,
      sæt,
      pluspoint: eloNetto.find((entry) => entry.visningsnavn === visningsnavn)?.pluspoint ?? 0,
    }))
    .sort((a, b) => (b.sæt - a.sæt) || ((b.pluspoint ?? 0) - (a.pluspoint ?? 0)))
    .slice(0, 20);
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
              <div className="text-right">
                <div className="tabular-nums font-semibold whitespace-nowrap">
                  {x.sæt} sæt {medalje(i)}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {x.pluspoint && x.pluspoint > 0 ? "+" : ""}
                  {(x.pluspoint ?? 0).toFixed(1)} point
                </div>
              </div>
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

      <p className="max-w-5xl mx-auto mb-6 text-sm text-gray-500 dark:text-gray-400">
        Rangeres efter antal sæt. Ved lige mange sæt afgør månedens point placeringen.
      </p>

      <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
        {dataPerMonth.map((data, idx) => (
          <MonthBlock key={`${year}-${idx + 1}`} title={monthNameDa(idx + 1)} data={data} />
        ))}
      </div>
    </main>
  );
}
