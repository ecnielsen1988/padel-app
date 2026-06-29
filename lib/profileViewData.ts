import { EloPoint, findCurrentEloForSpiller, hentEloHistorikForSpiller } from "@/lib/beregnEloHistorik";

type ProfileSeed = {
  visningsnavn: string | null;
  startElo: number | null;
};

type MatchRow = {
  id: number;
  kampid: number;
  date: string;
  holdA1: string;
  holdA2: string;
  holdB1: string;
  holdB2: string;
  scoreA: number;
  scoreB: number;
  finish: boolean;
  event: boolean;
  tiebreak: string;
  indberettet_af?: string | null;
};

export type ProfileViewData = {
  eloHistory: EloPoint[];
  currentElo: number | null;
  kampCount: number;
  profiles: { visningsnavn: string }[];
  kampe: MatchRow[];
  initialEloMap: Record<string, number>;
};

const PROFILE_COLUMNS = "visningsnavn,startElo";
const RESULT_COLUMNS =
  "id,kampid,date,holdA1,holdA2,holdB1,holdB2,scoreA,scoreB,finish,event,tiebreak,indberettet_af";
const CACHE_TTL_MS = 30_000;
const DEFAULT_START_ELO = 1000;

let cachedBase:
  | {
      expiresAt: number;
      profiles: ProfileSeed[];
      kampe: MatchRow[];
      initialEloMap: Record<string, number>;
      profileOptions: { visningsnavn: string }[];
    }
  | null = null;

async function fetchAllResults(supabase: any): Promise<MatchRow[]> {
  const pageSize = 1000;
  let all: MatchRow[] = [];
  let page = 0;

  while (true) {
    const from = page * pageSize;
    const to = from + pageSize - 1;

    const { data, error } = await supabase
      .from("newresults")
      .select(RESULT_COLUMNS)
      .order("date", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to);

    if (error) throw error;

    const batch = (data ?? []) as MatchRow[];
    all = all.concat(batch);

    if (batch.length < pageSize) break;
    page += 1;
  }

  return all;
}

async function getProfileBaseData(supabase: any) {
  const now = Date.now();
  if (cachedBase && cachedBase.expiresAt > now) {
    return cachedBase;
  }

  const [{ data: profilesData, error: profilesError }, kampe] = await Promise.all([
    supabase.from("profiles").select(PROFILE_COLUMNS),
    fetchAllResults(supabase),
  ]);

  if (profilesError) {
    throw profilesError;
  }

  const profiles = ((profilesData ?? []) as ProfileSeed[]).filter(
    (profile) => !!profile.visningsnavn
  );

  const initialEloMap: Record<string, number> = {};
  const profileOptions = profiles.map((profile) => ({
    visningsnavn: String(profile.visningsnavn ?? "").trim(),
  }));

  for (const profile of profiles) {
    const navn = String(profile.visningsnavn ?? "").trim();
    if (!navn) continue;
    initialEloMap[navn] =
      typeof profile.startElo === "number" ? profile.startElo : DEFAULT_START_ELO;
  }

  cachedBase = {
    expiresAt: now + CACHE_TTL_MS,
    profiles,
    kampe,
    initialEloMap,
    profileOptions,
  };

  return cachedBase;
}

export async function getProfileViewData(
  supabase: any,
  visningsnavn: string
): Promise<ProfileViewData> {
  const { kampe, initialEloMap, profileOptions } = await getProfileBaseData(supabase);

  return {
    eloHistory: hentEloHistorikForSpiller(visningsnavn, kampe, initialEloMap),
    currentElo: findCurrentEloForSpiller(visningsnavn, kampe, initialEloMap),
    kampCount: kampe.length,
    profiles: profileOptions,
    kampe,
    initialEloMap,
  };
}
