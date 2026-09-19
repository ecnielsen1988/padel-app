import { unstable_cache } from "next/cache";
import { getCachedRangliste } from "@/lib/cachedRangliste";
import { beregnEloÆndringerForIndeværendeMåned } from "@/lib/beregnEloMonthly";
import { createSupabaseServerReadClient } from "@/lib/supabaseServerRead";

type ResultRow = {
  id: number;
  date: string | null;
  holdA1: string | null;
  holdA2: string | null;
  holdB1: string | null;
  holdB2: string | null;
  scoreA: number | null;
  scoreB: number | null;
  finish: boolean | null;
};

type PreviewRow = {
  visningsnavn: string;
  elo?: number;
  pluspoint?: number;
  sæt?: number;
};

export type RankingOverviewData = {
  rangliste: PreviewRow[];
  monthly: PreviewRow[];
  active: PreviewRow[];
  women: PreviewRow[];
  eggs: PreviewRow[];
  winStreak: PreviewRow[];
  playStreak: PreviewRow[];
};

const RESULT_COLUMNS =
  "id,date,holdA1,holdA2,holdB1,holdB2,scoreA,scoreB,finish";

async function fetchAllResults(): Promise<ResultRow[]> {
  const supabase = createSupabaseServerReadClient();
  const pageSize = 1000;
  const rows: ResultRow[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("newresults")
      .select(RESULT_COLUMNS)
      .order("date", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw error;

    const batch = (data ?? []) as ResultRow[];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }

  return rows;
}

function currentCopenhagenMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Copenhagen",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());

  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value) - 1,
  };
}

async function buildRankingOverview(): Promise<RankingOverviewData> {
  const supabase = createSupabaseServerReadClient();
  const [rankingData, monthlyData, allSets, womenProfilesResult] = await Promise.all([
    getCachedRangliste(),
    beregnEloÆndringerForIndeværendeMåned(),
    fetchAllResults(),
    supabase
      .from("profiles")
      .select("visningsnavn")
      .eq("status", "active")
      .eq("koen", "kvinde"),
  ]);

  if (womenProfilesResult.error) throw womenProfilesResult.error;

  const rangliste = rankingData
    .map((row) => ({
      visningsnavn: String(row.visningsnavn ?? "").trim(),
      elo: Number(row.elo ?? 0),
    }))
    .filter((row) => row.visningsnavn && Number.isFinite(row.elo));

  const monthly = monthlyData
    .map((row) => ({
      visningsnavn: String(row.visningsnavn ?? "").trim(),
      pluspoint: Number(row.pluspoint ?? 0),
    }))
    .filter((row) => row.visningsnavn && Number.isFinite(row.pluspoint));

  const eloMap = new Map(
    rangliste.map((row) => [row.visningsnavn.toLowerCase(), row.elo ?? 0] as const)
  );
  const eggMap = new Map<string, number>();
  const winBestMap = new Map<string, number>();
  const playWeekMap = new Map<string, Map<string, number>>();
  const currentWinMap = new Map<string, number>();
  const activeSetCountMap = new Map<string, number>();
  const { year, month } = currentCopenhagenMonth();

  for (const set of allSets) {
    if (set.finish !== true) continue;

    const ha1 = String(set.holdA1 ?? "").trim();
    const ha2 = String(set.holdA2 ?? "").trim();
    const hb1 = String(set.holdB1 ?? "").trim();
    const hb2 = String(set.holdB2 ?? "").trim();
    const players = [ha1, ha2, hb1, hb2].filter(Boolean);
    const scoreA = Number(set.scoreA ?? 0);
    const scoreB = Number(set.scoreB ?? 0);

    if (!Number.isFinite(scoreA) || !Number.isFinite(scoreB) || scoreA === scoreB) {
      continue;
    }

    const dateString = String(set.date ?? "");
    const date = dateString ? new Date(`${dateString}T12:00:00`) : null;
    if (
      date &&
      !Number.isNaN(date.getTime()) &&
      date.getFullYear() === year &&
      date.getMonth() === month
    ) {
      for (const name of players) {
        activeSetCountMap.set(name, (activeSetCountMap.get(name) ?? 0) + 1);
      }
    }

    if (scoreA === 6 && scoreB === 0) {
      for (const name of [ha1, ha2].filter(Boolean)) {
        eggMap.set(name, (eggMap.get(name) ?? 0) + 1);
      }
    } else if (scoreB === 6 && scoreA === 0) {
      for (const name of [hb1, hb2].filter(Boolean)) {
        eggMap.set(name, (eggMap.get(name) ?? 0) + 1);
      }
    }

    const aWon = scoreA > scoreB;
    for (const name of players) {
      const isA = name === ha1 || name === ha2;
      const won = (isA && aWon) || (!isA && !aWon);
      const next = won ? (currentWinMap.get(name) ?? 0) + 1 : 0;
      currentWinMap.set(name, next);
      if (next > (winBestMap.get(name) ?? 0)) winBestMap.set(name, next);
    }

    if (!date || Number.isNaN(date.getTime())) continue;
    const weekday = (date.getDay() + 6) % 7;
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - weekday);
    weekStart.setHours(0, 0, 0, 0);
    const weekKey = weekStart.toISOString().slice(0, 10);

    for (const name of players) {
      let weekCounts = playWeekMap.get(name);
      if (!weekCounts) {
        weekCounts = new Map<string, number>();
        playWeekMap.set(name, weekCounts);
      }
      weekCounts.set(weekKey, (weekCounts.get(weekKey) ?? 0) + 1);
    }
  }

  const eggs = Array.from(eggMap.entries())
    .map(([visningsnavn, count]) => ({ visningsnavn, pluspoint: count }))
    .sort(
      (a, b) =>
        (b.pluspoint ?? 0) - (a.pluspoint ?? 0) ||
        (eloMap.get(b.visningsnavn.toLowerCase()) ?? 0) -
          (eloMap.get(a.visningsnavn.toLowerCase()) ?? 0)
    );

  const winStreak = Array.from(winBestMap.entries())
    .map(([visningsnavn, streak]) => ({ visningsnavn, pluspoint: streak }))
    .filter((row) => (row.pluspoint ?? 0) > 0)
    .sort(
      (a, b) =>
        (b.pluspoint ?? 0) - (a.pluspoint ?? 0) ||
        a.visningsnavn.localeCompare(b.visningsnavn, "da")
    );

  const playStreak = Array.from(playWeekMap.entries())
    .map(([visningsnavn, weeks]) => {
      const qualifying = Array.from(weeks.entries())
        .filter(([, count]) => count >= 5)
        .map(([week]) => week)
        .sort();
      let best = 0;
      let current = 0;
      let previous: string | null = null;

      for (const week of qualifying) {
        if (previous) {
          const difference =
            (new Date(week).getTime() - new Date(previous).getTime()) /
            (7 * 24 * 60 * 60 * 1000);
          current = difference === 1 ? current + 1 : 1;
        } else {
          current = 1;
        }
        if (current > best) best = current;
        previous = week;
      }

      return { visningsnavn, pluspoint: best };
    })
    .filter((row) => (row.pluspoint ?? 0) > 0)
    .sort(
      (a, b) =>
        (b.pluspoint ?? 0) - (a.pluspoint ?? 0) ||
        a.visningsnavn.localeCompare(b.visningsnavn, "da")
    );

  const monthlyPoints = new Map(
    monthly.map((row) => [row.visningsnavn, row.pluspoint ?? 0] as const)
  );
  const active = Array.from(activeSetCountMap.entries())
    .map(([visningsnavn, sets]) => ({
      visningsnavn,
      sæt: sets,
      pluspoint: monthlyPoints.get(visningsnavn) ?? 0,
    }))
    .sort(
      (a, b) =>
        (b.sæt ?? 0) - (a.sæt ?? 0) ||
        (b.pluspoint ?? 0) - (a.pluspoint ?? 0)
    );

  const womenSet = new Set(
    (womenProfilesResult.data ?? [])
      .map((row) => String(row.visningsnavn ?? "").trim().toLowerCase())
      .filter(Boolean)
  );
  const women = rangliste.filter((row) =>
    womenSet.has(row.visningsnavn.toLowerCase())
  );

  return { rangliste, monthly, active, women, eggs, winStreak, playStreak };
}

export const getCachedRankingOverview = unstable_cache(
  buildRankingOverview,
  ["ranking-overview-v1"],
  { revalidate: 60, tags: ["ranking-overview", "rangliste"] }
);
