// lib/beregnEloMonthly.ts
import { supabase } from "@/lib/supabaseClient";
import { beregnEloForKampe, type Kamp, type EloMap } from "@/lib/beregnElo";

export type MånedensSpiller = { visningsnavn: string; pluspoint: number };

// Match din Elo-motor default (du bruger 1500 som fallback i beregnEloForKampe)
const DEFAULT_ELO = 0;

// -------------------------
// Dato-grænser i Europe/Copenhagen (YYYY-MM-DD)
// -------------------------
function monthStartCph(year: number, month1_12: number): string {
  const d = new Date(Date.UTC(year, month1_12 - 1, 1, 0, 0, 0));
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Copenhagen",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(d);
}

function nextMonthStartCph(year: number, month1_12: number): string {
  const d = new Date(Date.UTC(year, month1_12 - 1, 1, 0, 0, 0));
  d.setUTCMonth(d.getUTCMonth() + 1);
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Copenhagen",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(d);
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

// -------------------------
// Pagination helper (så vi ikke mister rows > 1000)
// -------------------------
async function fetchAllNewresults(opts: { lt?: string; gte?: string }): Promise<any[]> {
  const PAGE_SIZE = 1000;
  let from = 0;
  const out: any[] = [];

  while (true) {
    const to = from + PAGE_SIZE - 1;
    let q = supabase.from("newresults").select("*");

    if (opts.gte) q = q.gte("date", opts.gte);
    if (opts.lt) q = q.lt("date", opts.lt);

    q = q
      .order("date", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to);

    const { data, error } = await q;
    if (error) throw error;

    const batch = data ?? [];
    out.push(...batch);

    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return out;
}

// -------------------------
// Map Supabase-row -> Kamp (matcher din type i lib/beregnElo.ts)
// -------------------------
// IMPORTANT: tilpas keys her hvis dine kolonner hedder noget andet.
// Jeg bruger de navne, du har vist i resten af projektet.
function rowToKamp(r: any): Kamp | null {
  const id = typeof r.id === "number" ? r.id : Number(r.id);
  if (!Number.isFinite(id)) return null;

  const kampidRaw = r.kampid ?? r.kamp_id ?? r.kampId ?? r.matchid ?? r.matchId;
  // Hvis kampid mangler, brug id (så Elo stadig kan køre pr række)
  const kampid = Number.isFinite(Number(kampidRaw)) ? Number(kampidRaw) : id;

  const date = (r.date ?? r.dato ?? "").toString();

  const holdA1 = (r.holdA1 ?? r.holda1 ?? r.teama1 ?? r.teamA1 ?? r.playerA1 ?? "").toString();
  const holdA2 = (r.holdA2 ?? r.holda2 ?? r.teama2 ?? r.teamA2 ?? r.playerA2 ?? "").toString();
  const holdB1 = (r.holdB1 ?? r.holdb1 ?? r.teamb1 ?? r.teamB1 ?? r.playerB1 ?? "").toString();
  const holdB2 = (r.holdB2 ?? r.holdb2 ?? r.teamb2 ?? r.teamB2 ?? r.playerB2 ?? "").toString();

  const scoreA = typeof r.scoreA === "number" ? r.scoreA : Number(r.scoreA);
  const scoreB = typeof r.scoreB === "number" ? r.scoreB : Number(r.scoreB);

  // dine felter i Elo: finish/event/tiebreak
  const finish =
    typeof r.finish === "boolean" ? r.finish :
    typeof r.finished === "boolean" ? r.finished :
    typeof r.completed === "boolean" ? r.completed :
    true;

  const event =
    typeof r.event === "boolean" ? r.event :
    typeof r.isEvent === "boolean" ? r.isEvent :
    false;

  // din Elo bruger string: 'tiebreak' | 'matchtiebreak' | ''
  const tiebreak =
    (r.tiebreak ?? r.tieBreak ?? r.matchTieBreak ?? "").toString().toLowerCase();

  // hvis du gemmer indberettet_af i newresults
  const indberettet_af = r.indberettet_af ? String(r.indberettet_af) : undefined;

  // Valider minimum
  if (!holdA1 || !holdA2 || !holdB1 || !holdB2) return null;
  if (!Number.isFinite(scoreA) || !Number.isFinite(scoreB)) return null;

  return {
    id,
    kampid,
    date,
    holdA1,
    holdA2,
    holdB1,
    holdB2,
    scoreA,
    scoreB,
    finish,
    event,
    tiebreak,
    indberettet_af,
  };
}

// (valgfrit) seed Elo fra profiles.startElo hvis du bruger det.
// Hvis du ikke har startElo, så return {}.
async function fetchInitialEloMap(): Promise<EloMap> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("visningsnavn, startElo")
      .eq("active", true);

    if (error) return {};
    const map: EloMap = {};
    for (const r of data ?? []) {
      const name = r?.visningsnavn;
      const start = r?.startElo;
      if (typeof name === "string" && name) {
        map[name] = typeof start === "number" && Number.isFinite(start) ? start : DEFAULT_ELO;
      }
    }
    return map;
  } catch {
    return {};
  }
}

// -------------------------
// Public API
// -------------------------
export async function beregnEloÆndringerForMåned(year: number, month1_12: number): Promise<MånedensSpiller[]> {
  const start = monthStartCph(year, month1_12);
  const endExclusive = nextMonthStartCph(year, month1_12);

  const initialEloMap = await fetchInitialEloMap();

  const rowsBefore = await fetchAllNewresults({ lt: start });
  const rowsMonth = await fetchAllNewresults({ gte: start, lt: endExclusive });

  const beforeKampe = rowsBefore.map(rowToKamp).filter(Boolean) as Kamp[];
  const monthKampe = rowsMonth.map(rowToKamp).filter(Boolean) as Kamp[];

  // Elo ved månedens start
  const beforeRun = beregnEloForKampe(beforeKampe, initialEloMap);
  const beforeMap = beforeRun.nyEloMap;

  // Elo ved månedens slut
  const afterRun = beregnEloForKampe(monthKampe, beforeMap);
  const afterMap = afterRun.nyEloMap;

  const players = new Set<string>([
    ...Object.keys(beforeMap || {}),
    ...Object.keys(afterMap || {}),
  ]);

  const liste: MånedensSpiller[] = [];
  for (const navn of players) {
    const before = beforeMap?.[navn] ?? initialEloMap?.[navn] ?? DEFAULT_ELO;
    const after = afterMap?.[navn] ?? before;
    const delta = after - before;
    if (delta !== 0) {
      liste.push({ visningsnavn: navn, pluspoint: round1(delta) });
    }
  }

  liste.sort((a, b) => b.pluspoint - a.pluspoint);
  return liste;
}

export async function beregnEloÆndringerForIndeværendeMåned(): Promise<MånedensSpiller[]> {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Copenhagen",
    year: "numeric",
    month: "2-digit",
  });
  const parts = fmt.formatToParts(now);
  const y = Number(parts.find((p) => p.type === "year")!.value);
  const m = Number(parts.find((p) => p.type === "month")!.value);
  return beregnEloÆndringerForMåned(y, m);
}
