import { EloChange, EloMap, Kamp, beregnEloForKampe } from "@/lib/beregnElo";
import { revalidateTag, unstable_cache } from "next/cache";
import { createSupabaseServerReadClient } from "@/lib/supabaseServerRead";
import { gunzipSync, gzipSync } from "node:zlib";

export type ResultMatchSet = {
  id: number;
  holdA1: string;
  holdA2: string;
  holdB1: string;
  holdB2: string;
  scoreA: number;
  scoreB: number;
  setElo: number;
};

export type ResultMatchSummary = {
  navn: string;
  before: number;
  after: number;
  diff: number;
};

export type ResultMatchCard = {
  kampid: number;
  date: string;
  indberettetAf?: string;
  sets: ResultMatchSet[];
  eloSummary: ResultMatchSummary[];
  adminIssueOpen?: boolean;
  adminIssueCount?: number;
};

const RESULTS_COLUMNS =
  "id,kampid,date,holdA1,holdA2,holdB1,holdB2,scoreA,scoreB,finish,event,tiebreak,indberettet_af";
const PROFILE_COLUMNS = "visningsnavn,startElo";
export function clearRecentResultCardsCache() {
  revalidateTag("results-feed");
}

async function fetchAllResults(supabase: ReturnType<typeof createSupabaseServerReadClient>): Promise<Kamp[]> {
  const batchSize = 1000;
  const parallelPages = 4;

  async function fetchPage(offset: number, size: number, includeCount = false) {
    const { data, error, count } = await supabase
      .from("newresults")
      .select(RESULTS_COLUMNS, includeCount ? { count: "exact" } : undefined)
      .order("date", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + size - 1);
    if (error) throw error;
    return { rows: (data ?? []) as Kamp[], count };
  }

  const first = await fetchPage(0, batchSize, true);
  if (first.rows.length === 0 || first.count === first.rows.length) return first.rows;

  const count = first.count;
  if (count !== null && count > first.rows.length) {
    const rows = [...first.rows];
    const pageSize = first.rows.length;
    for (let offset = pageSize; offset < count; offset += pageSize * parallelPages) {
      const offsets = Array.from({ length: parallelPages }, (_, index) => offset + index * pageSize)
        .filter((pageOffset) => pageOffset < count);
      const pages = await Promise.all(offsets.map((pageOffset) => fetchPage(pageOffset, pageSize)));
      for (const page of pages) rows.push(...page.rows);
    }

    if (rows.length === count && new Set(rows.map((row) => row.id)).size === rows.length) {
      return rows;
    }
    // Writes can shift offsets between reads. Retry with the current history.
  }

  const firstPage = first.count === null ? first.rows : (await fetchPage(0, batchSize)).rows;
  const rows = [...firstPage];
  for (let offset = batchSize, size = firstPage.length; size === batchSize; offset += batchSize) {
    const page = await fetchPage(offset, batchSize);
    rows.push(...page.rows);
    size = page.rows.length;
  }
  return rows;
}

async function fetchInitialEloMap(supabase: any): Promise<EloMap> {
  const res = await supabase.from("profiles").select(PROFILE_COLUMNS);
  const spillereData = (res?.data ?? []) as Array<{
    visningsnavn?: string | null;
    startElo?: number | null;
  }>;
  const error = res?.error as any;

  if (error) {
    throw error;
  }

  const initialEloMap: EloMap = {};
  spillereData.forEach((spiller) => {
    const navn = (spiller?.visningsnavn ?? "").toString().trim();
    if (navn) {
      initialEloMap[navn] = spiller?.startElo ?? 1500;
    }
  });

  return initialEloMap;
}

async function fetchOpenAdminIssues(supabase: any): Promise<Map<number, number>> {
  let issueRows: Array<{ kampid?: number | null }> = [];

  const primaryRes = await supabase
    .from("admin_messages")
    .select("kampid")
    .eq("læst", false);

  if (primaryRes?.error) {
    const fallbackRes = await supabase
      .from("admin_messages")
      .select("kampid")
      .eq("read", false);

    if (fallbackRes?.error) {
      throw fallbackRes.error;
    }

    issueRows = (fallbackRes?.data ?? []) as Array<{ kampid?: number | null }>;
  } else {
    issueRows = (primaryRes?.data ?? []) as Array<{ kampid?: number | null }>;
  }

  const counts = new Map<number, number>();
  issueRows.forEach((row) => {
    const kampid = Number(row?.kampid ?? 0);
    if (!kampid) return;
    counts.set(kampid, (counts.get(kampid) ?? 0) + 1);
  });

  return counts;
}

function buildCards(
  resultaterData: Kamp[],
  eloChanges: Record<number, { [key: string]: EloChange }>,
  openAdminIssues: Map<number, number>
): ResultMatchCard[] {
  const grupper: Record<number, Kamp[]> = {};

  resultaterData.forEach((kamp) => {
    const key = Number((kamp as any).kampid ?? 0);
    if (!key) return;
    if (!grupper[key]) grupper[key] = [];
    grupper[key].push(kamp);
  });

  return Object.entries(grupper)
    .map(([kampid, sæt]) => {
      const kampSæt = [...sæt].sort((a, b) => a.id - b.id);
      const førsteSæt = kampSæt[0];

      const samletEloChanges: Record<string, EloChange> = {};
      const sets: ResultMatchSet[] = kampSæt.map((kamp) => {
        const changes = eloChanges[kamp.id] ?? {};
        Object.entries(changes).forEach(([navn, change]) => {
          if (!samletEloChanges[navn]) {
            samletEloChanges[navn] = {
              before: change.before,
              after: change.after,
              diff: 0,
            };
          }
          samletEloChanges[navn].after = change.after;
          samletEloChanges[navn].diff += change.diff;
        });

        const maxDiff = Math.max(0, ...Object.values(changes).map((change) => change.diff));

        return {
          id: kamp.id,
          holdA1: kamp.holdA1,
          holdA2: kamp.holdA2,
          holdB1: kamp.holdB1,
          holdB2: kamp.holdB2,
          scoreA: kamp.scoreA,
          scoreB: kamp.scoreB,
          setElo: maxDiff,
        };
      });

      const eloSummary = Object.entries(samletEloChanges)
        .map(([navn, change]) => ({
          navn,
          before: change.before,
          after: change.after,
          diff: change.diff,
        }))
        .sort((a, b) => b.after - a.after);

      return {
        kampid: Number(kampid),
        date: førsteSæt.date,
        indberettetAf: (førsteSæt.indberettet_af ?? "").toString().trim() || undefined,
        sets,
        eloSummary,
        adminIssueOpen: openAdminIssues.has(Number(kampid)),
        adminIssueCount: openAdminIssues.get(Number(kampid)) ?? 0,
      };
    })
    .sort((a, b) => b.kampid - a.kampid);
}

export function filterCardsForPlayer(cards: ResultMatchCard[], spillerNavn: string, limit = cards.length) {
  const navn = spillerNavn.trim();
  if (!navn || limit <= 0) return [];

  const matches: ResultMatchCard[] = [];
  for (const card of cards) {
    const played = card.sets.some((sæt) =>
      [sæt.holdA1, sæt.holdA2, sæt.holdB1, sæt.holdB2].includes(navn)
    );
    if (!played) continue;
    matches.push(card);
    if (matches.length === limit) break;
  }
  return matches;
}

export async function getRecentResultCards(
  _supabase: any,
  options?: { forceRefresh?: boolean }
): Promise<ResultMatchCard[]> {
  const forceRefresh = options?.forceRefresh ?? false;
  if (forceRefresh) return buildBaseResultCards();

  const compressed = await getCachedCompressedResultCards();
  return JSON.parse(
    gunzipSync(Buffer.from(compressed, "base64")).toString("utf8")
  ) as ResultMatchCard[];
}

async function buildBaseResultCards(): Promise<ResultMatchCard[]> {
  const supabase = createSupabaseServerReadClient();
  const [initialEloMap, resultaterData, openAdminIssues] = await Promise.all([
    fetchInitialEloMap(supabase),
    fetchAllResults(supabase),
    fetchOpenAdminIssues(supabase),
  ]);
  const { eloChanges } = beregnEloForKampe(resultaterData, initialEloMap);
  return buildCards(resultaterData, eloChanges, openAdminIssues);
}

async function buildCompressedResultCards() {
  const cards = await buildBaseResultCards();
  return gzipSync(JSON.stringify(cards)).toString("base64");
}

const getCachedCompressedResultCards = unstable_cache(
  buildCompressedResultCards,
  ["result-cards-v2-gzip"],
  { revalidate: 60, tags: ["results-feed"] }
);
