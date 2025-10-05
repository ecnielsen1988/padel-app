// lib/beregnEloMonthly.ts
import { supabase } from "@/lib/supabaseClient";

type EloMap = Record<string, number>;
type MånedensSpiller = { visningsnavn: string; pluspoint: number };

// Justér hvis dit baseline-elo er noget andet end 1000
const DEFAULT_ELO = 1000;

/** Første dag i måneden i Europe/Copenhagen som 'YYYY-MM-DD' */
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

/** Første dag i næste måned i Europe/Copenhagen som 'YYYY-MM-DD' (eksklusiv grænse) */
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

// ———————————————————————————————
// Elo-motor loader (tåler forskellige export-navne)
// ———————————————————————————————
async function loadEloMotor(): Promise<(...args: any[]) => Promise<any>> {
  const mod: any = await import("@/lib/beregnElo");
  const fn =
    mod.beregnElo ??
    mod.beregnEloForKampe ??
    mod.beregnEloKampe ??
    mod.default;

  if (typeof fn !== "function") {
    const available = Object.keys(mod || {});
    throw new Error(
      `Kunne ikke finde en Elo-funktion i "@/lib/beregnElo". Fundne exports: [${available.join(", ")}]`
    );
  }
  return fn as (...args: any[]) => Promise<any>;
}

// ———————————————————————————————
// Normalisering: træk slut-elo ud som { [visningsnavn]: number }
// Dækker: Map, plain object, array af par, array af objekter, wrappers & nested felter
// ———————————————————————————————
function toEloMap(res: any): EloMap {
  if (!res) throw new Error("Elo-resultat var tomt/undefined.");

  // 1) Map<string, number>
  if (res instanceof Map) {
    const obj: EloMap = {};
    for (const [k, v] of res.entries()) obj[String(k)] = Number(v);
    return obj;
  }

  // 2) Array-formater
  if (Array.isArray(res)) {
    // 2a) Array af [navn, værdi]
    if (
      res.length > 0 &&
      Array.isArray(res[0]) &&
      res[0].length >= 2 &&
      typeof res[0][0] === "string" &&
      typeof res[0][1] === "number"
    ) {
      const obj: EloMap = {};
      for (const [name, val] of res) obj[String(name)] = Number(val);
      return obj;
    }

    // 2b) Array af objekter med (navn, rating) i forskellige felter
    if (res.length > 0 && typeof res[0] === "object") {
      const nameKeys = [
        "visningsnavn",
        "displayName",
        "displayname",
        "navn",
        "name",
        "player",
        "spiller",
        "id",
      ];
      const ratingKeys = [
        "elo",
        "rating",
        "value",
        "points",
        "score",
        "current",
        "after",
        "end",
        "nyElo",
        "eloEfter",
        "elo_afslut",
        "elo_slut",
      ];

      const out: EloMap = {};
      for (const row of res) {
        if (!row || typeof row !== "object") continue;

        let name: string | undefined;
        for (const nk of nameKeys) {
          if (typeof (row as any)[nk] === "string" && (row as any)[nk]) {
            name = (row as any)[nk];
            break;
          }
        }
        if (!name && row.player && typeof row.player === "object") {
          const p = (row as any).player;
          name = p.visningsnavn || p.displayName || p.displayname || p.navn || p.name;
        }

        let rating: number | undefined;
        for (const rk of ratingKeys) {
          if (typeof (row as any)[rk] === "number") {
            rating = (row as any)[rk];
            break;
          }
        }
        if (rating === undefined) {
          const nestedKeys = ["stats", "state", "result", "resultat", "elo", "data"];
          for (const nk of nestedKeys) {
            const nest = (row as any)[nk];
            if (nest && typeof nest === "object") {
              for (const rk of ratingKeys) {
                if (typeof (nest as any)[rk] === "number") {
                  rating = (nest as any)[rk];
                  break;
                }
              }
            }
            if (rating !== undefined) break;
          }
        }

        if (name && typeof rating === "number") out[name] = rating;
      }
      if (Object.keys(out).length > 0) return out;
    }
  }

  // 3) Wrapper-objekter – prøv kendte nøgler og rekursér
  const wrappers = [
    "eloMap",
    "currentEloMap",
    "ratings",
    "current",
    "state",
    "result",
    "resultat",
    "rangliste",
    "leaderboard",
    "players",
    "spillere",
    "endState",
    "end",
  ];
  if (typeof res === "object" && res) {
    for (const k of wrappers) {
      if ((res as any)[k] != null) {
        try {
          return toEloMap((res as any)[k]);
        } catch {
          // prøv næste
        }
      }
    }
  }

  // 4) Plain objekt: { navn: number } ELLER navn->objekt med rating indeni
  if (typeof res === "object" && res) {
    const entries = Object.entries(res);

    // 4a) Direkte navn -> tal
    if (entries.length > 0 && entries.every(([k, v]) => typeof k === "string" && typeof v === "number")) {
      return res as EloMap;
    }

    // 4b) navn -> objekt med talværdi et sted
    const ratingKeys = [
      "elo",
      "rating",
      "value",
      "points",
      "score",
      "current",
      "after",
      "end",
      "nyElo",
      "eloEfter",
      "elo_afslut",
      "elo_slut",
    ];
    const nameKeys = ["visningsnavn", "displayName", "displayname", "navn", "name", "player", "spiller", "id"];
    const out: EloMap = {};

    for (const [outerKey, val] of entries) {
      if (!val || typeof val !== "object") continue;

      let name: string = outerKey;
      for (const nk of nameKeys) {
        if (typeof (val as any)[nk] === "string") {
          name = (val as any)[nk];
          break;
        }
      }

      let rating: number | undefined;
      for (const rk of ratingKeys) {
        if (typeof (val as any)[rk] === "number") {
          rating = (val as any)[rk];
          break;
        }
      }
      if (rating === undefined) {
        for (const nested of Object.values(val as any)) {
          if (nested && typeof nested === "object") {
            for (const rk of ratingKeys) {
              if (typeof (nested as any)[rk] === "number") {
                rating = (nested as any)[rk];
                break;
              }
            }
            if (rating !== undefined) break;
          }
        }
      }

      if (typeof rating === "number") out[String(name)] = rating;
    }
    if (Object.keys(out).length > 0) return out;
  }

  throw new Error(
    "Kunne ikke normalisere Elo-resultat til et { [visningsnavn]: number }-map. Tjek returtypen fra beregnElo."
  );
}

// ———————————————————————————————
// Kør Elo med/uden seed og få slut-map tilbage
// ———————————————————————————————
async function runEloWithOptionalSeed(
  beregnElo: (...args: any[]) => Promise<any>,
  saet: any[],
  seed?: EloMap
): Promise<EloMap> {
  try {
    // Prøv signatur (saet, initialEloMap)
    const res = await beregnElo(saet, seed ?? {});
    return toEloMap(res);
  } catch {
    // Fald tilbage til (saet)
    const res = await beregnElo(saet);
    return toEloMap(res);
  }
}

// ———————————————————————————————
// Offentlig: Netto Elo pr. måned
// ———————————————————————————————
export async function beregnEloÆndringerForMåned(
  year: number,
  month1_12: number
): Promise<MånedensSpiller[]> {
  const start = monthStartCph(year, month1_12);
  const endExclusive = nextMonthStartCph(year, month1_12);

  // 1) “Før” – alle sæt før månedens start
  const { data: saetBefore, error: e1 } = await supabase
    .from("newresults")
    .select("*")
    .lt("date", start)
    .order("date", { ascending: true })
    .order("id", { ascending: true });

  if (e1) {
    console.error("Kunne ikke hente sæt før måned:", e1);
    return [];
  }

  // 2) “Månedens sæt”
  const { data: saetMonth, error: e2 } = await supabase
    .from("newresults")
    .select("*")
    .gte("date", start)
    .lt("date", endExclusive)
    .order("date", { ascending: true })
    .order("id", { ascending: true });

  if (e2) {
    console.error("Kunne ikke hente månedens sæt:", e2);
    return [];
  }

  // 3) Kør Elo
  const beregnElo = await loadEloMotor();
  const beforeMap = await runEloWithOptionalSeed(beregnElo, saetBefore ?? [], {});
  const afterMonthMap = await runEloWithOptionalSeed(beregnElo, saetMonth ?? [], beforeMap);

  // 4) Netto = efter - før
  const spillere = new Set<string>([
    ...Object.keys(beforeMap),
    ...Object.keys(afterMonthMap),
  ]);

  const liste: MånedensSpiller[] = [];
  for (const navn of spillere) {
    const before = beforeMap[navn] ?? DEFAULT_ELO;
    const after = afterMonthMap[navn] ?? before;
    const delta = after - before;
    if (delta !== 0) {
      liste.push({ visningsnavn: navn, pluspoint: Math.round(delta * 10) / 10 });
    }
  }

  // Sortér netto faldende
  liste.sort((a, b) => b.pluspoint - a.pluspoint);
  return liste;
}

// ———————————————————————————————
// Hjælper: Indeværende måned (valgfri – praktisk til din nuværende API)
// ———————————————————————————————
export async function beregnEloÆndringerForIndeværendeMåned(): Promise<MånedensSpiller[]> {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Copenhagen",
    year: "numeric",
    month: "2-digit",
  });
  const parts = fmt.formatToParts(now);
  const y = Number(parts.find(p => p.type === "year")!.value);
  const m = Number(parts.find(p => p.type === "month")!.value);
  return beregnEloÆndringerForMåned(y, m);
}

