import { EloChange, EloMap, Kamp, beregnEloForKampe } from "@/lib/beregnElo";

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
const CACHE_TTL_MS = 30_000;

let cachedCards:
  | {
      expiresAt: number;
      cards: ResultMatchCard[];
    }
  | null = null;

export function clearRecentResultCardsCache() {
  cachedCards = null;
}

async function fetchAllResults(supabase: any): Promise<Kamp[]> {
  const batchSize = 1000;
  let alleResultater: Kamp[] = [];
  let offset = 0;
  let batch: Kamp[] = [];

  do {
    const res = await supabase
      .from("newresults")
      .select(RESULTS_COLUMNS)
      .order("date", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + batchSize - 1);

    const data = (res?.data ?? []) as Kamp[];
    const error = res?.error as any;

    if (error) {
      throw error;
    }

    batch = data;
    alleResultater = alleResultater.concat(batch);
    offset += batchSize;
  } while (batch.length === batchSize);

  return alleResultater;
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

export function filterCardsForPlayer(cards: ResultMatchCard[], spillerNavn: string) {
  const navn = spillerNavn.trim();
  if (!navn) return [];

  return cards.filter((card) =>
    card.sets.some((sæt) =>
      [sæt.holdA1, sæt.holdA2, sæt.holdB1, sæt.holdB2].some((spiller) => spiller === navn)
    )
  );
}

export async function getRecentResultCards(
  supabase: any,
  options?: { forceRefresh?: boolean }
): Promise<ResultMatchCard[]> {
  const forceRefresh = options?.forceRefresh ?? false;
  const now = Date.now();

  if (!forceRefresh && cachedCards && cachedCards.expiresAt > now) {
    return cachedCards.cards;
  }

  const [initialEloMap, resultaterData, openAdminIssues] = await Promise.all([
    fetchInitialEloMap(supabase),
    fetchAllResults(supabase),
    fetchOpenAdminIssues(supabase),
  ]);

  const { eloChanges } = beregnEloForKampe(resultaterData, initialEloMap);
  const cards = buildCards(resultaterData, eloChanges, openAdminIssues);

  cachedCards = {
    expiresAt: now + CACHE_TTL_MS,
    cards,
  };

  return cards;
}
