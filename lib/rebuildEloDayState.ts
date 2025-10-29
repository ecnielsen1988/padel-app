import { supabaseServiceRole } from "./supabaseServiceRole";
import { beregnEloForKampe } from "./beregnElo";

const DEFAULT_ELO = 1500;

function cleanName(n: string | null | undefined) {
  return (n || "").trim();
}

export async function rebuildEloDayState() {
  console.log("🔄 rebuildEloDayState: start");

  //
  // 1. Hent alle profiler: visningsnavn + startElo
  //
  const { data: profRows, error: profErr } = await supabaseServiceRole
    .from("profiles")
    .select("visningsnavn, startElo")
    .not("visningsnavn", "is", null);

  if (profErr) {
    console.error("❌ Kunne ikke hente profiles:", profErr);
    throw new Error(profErr.message);
  }

  // Her bygger vi et opslag af "hvad var din første rating nogensinde"
  // visningsnavn -> startElo (eller fallback DEFAULT_ELO)
  const profileEloStart: Record<string, number> = {};
  (profRows ?? []).forEach((p: any) => {
    const navn = cleanName(p.visningsnavn);
    if (!navn) return;
    const base =
      typeof p.startElo === "number" && Number.isFinite(p.startElo)
        ? p.startElo
        : DEFAULT_ELO;
    profileEloStart[navn] = base;
  });

  //
  // 2. Hent ALLE registrerede sæt/kampe fra newresults (hele historikken)
  //    Vi sorterer efter dato og kampid for at være stabile.
  //
  const { data: rows, error } = await supabaseServiceRole
    .from("newresults")
    .select(
      "date, kampid, holdA1, holdA2, holdB1, holdB2, scoreA, scoreB, finish, tiebreak"
    )
    .order("date", { ascending: true })
    .order("kampid", { ascending: true });

  if (error) {
    console.error("❌ Kunne ikke hente newresults:", error);
    throw new Error(error.message);
  }

  if (!rows?.length) {
    console.warn("⚠️ Ingen kampe i newresults. Ingenting at bygge.");
    return { inserted: 0 };
  }

  //
  // 3. Gruppér rows pr. dato
  //
  // byDate["2025-10-24"] = [ alle sæt den dato ]
  //
  const byDate = new Map<string, any[]>();
  for (const r of rows) {
    if (!r.date) continue;
    if (!byDate.has(r.date)) byDate.set(r.date, []);
    byDate.get(r.date)!.push(r);
  }

  //
  // 4. currentElo = "hvad er spillers rating lige nu i vores replay"
  //    Den starter først når vi møder spilleren første gang.
  //
  const currentElo: Record<string, number> = {};

  //
  // 5. dayStateRows = snapshot vi vil skrive til elo_day_state
  //
  // For hver dato + spiller der var aktiv den dato:
  //   - dato
  //   - visningsnavn
  //   - elo_start (ratingen FØR første sæt den dag)
  //
  const dayStateRows: {
    dato: string;
    visningsnavn: string;
    elo_start: number;
  }[] = [];

  //
  // 6. Loop datoer i kronologisk orden
  //
  const datesSorted = Array.from(byDate.keys()).sort();

  for (const dato of datesSorted) {
    const dagensKampe = byDate.get(dato)!;

    // A) find alle spillere der deltager denne dato
    const spillereIdag = new Set<string>();
    dagensKampe.forEach((k) => {
      [
        cleanName(k.holdA1),
        cleanName(k.holdA2),
        cleanName(k.holdB1),
        cleanName(k.holdB2),
      ].forEach((navn) => {
        if (navn) spillereIdag.add(navn);
      });
    });

    // B) For hver spiller der spiller i dag:
    //    - Hvis spilleren ikke er i currentElo endnu,
    //      så betyder det: første gang vi ser dem i historikken.
    //      De starter på deres profile.startElo (ellers DEFAULT_ELO).
    //    - Opret en row i dayStateRows med deres "elo_start" for DAGEN.
    spillereIdag.forEach((navn) => {
      if (!(navn in currentElo)) {
        currentElo[navn] =
          profileEloStart[navn] !== undefined
            ? profileEloStart[navn]
            : DEFAULT_ELO;
      }

      dayStateRows.push({
        dato,
        visningsnavn: navn,
        elo_start: currentElo[navn],
      });
    });

    // C) Spil alle færdige sæt den dato igennem i rækkefølge,
    //    og opdater currentElo løbende.
    //
    //    Hver række i newresults svarer til ét sæt:
    //    holdA1+holdA2 vs holdB1+holdB2, scoreA/scoreB, finish=true hvis den tæller.
    //
    for (let i = 0; i < dagensKampe.length; i++) {
      const k = dagensKampe[i];

      // ufærdigt sæt -> ignorer, påvirker ikke elo
      if (!k.finish) continue;

      const setObj = {
        id: 1_000_000 + i, // bare et midlertidigt id
        kampid: k.kampid ?? 0,
        date: k.date,
        holdA1: cleanName(k.holdA1) || "?",
        holdA2: cleanName(k.holdA2) || "?",
        holdB1: cleanName(k.holdB1) || "?",
        holdB2: cleanName(k.holdB2) || "?",
        scoreA: k.scoreA ?? 0,
        scoreB: k.scoreB ?? 0,
        finish: true,
        event: true,
        tiebreak:
          typeof k.tiebreak === "boolean"
            ? String(k.tiebreak)
            : k.tiebreak || "false",
      };

      // beregnEloForKampe tager:
      //  - en liste af sæt (her bare ét)
      //  - currentElo som map med nuværende ratinger
      //
      // Den returnerer bl.a. nyEloMap = spiller -> ny rating efter de sæt.
      //
      const { nyEloMap } = beregnEloForKampe(
        [setObj] as any,
        currentElo as any
      );

      // Opdater currentElo = spillernes nye rating efter dette sæt
      Object.entries(nyEloMap || {}).forEach(([navn, rating]) => {
        currentElo[navn] = rating as number;
      });
    }
  }

  //
  // 7. Skriv snapshots i elo_day_state med upsert
  //    - onConflict: (dato, visningsnavn)
  //      så hvis du kører rebuild igen senere, overskriver vi bare.
  //
  const CHUNK = 500;
  let totalInserted = 0;

  for (let i = 0; i < dayStateRows.length; i += CHUNK) {
    const slice = dayStateRows.slice(i, i + CHUNK);

    const { error: upErr } = await supabaseServiceRole
      .from("elo_day_state")
      .upsert(slice, {
        onConflict: "dato,visningsnavn",
      });

    if (upErr) {
      console.error("❌ Fejl ved upsert batch", i, "-", i + CHUNK, upErr);
      throw new Error(upErr.message);
    }

    totalInserted += slice.length;
  }

  console.log(
    `✅ elo_day_state opdateret. ${totalInserted} rækker behandlet.`
  );

  return { inserted: totalInserted };
}

