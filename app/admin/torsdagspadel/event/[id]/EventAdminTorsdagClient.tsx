"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { beregnEloForKampe } from "@/lib/beregnElo";

/* ======================== Typer ======================== */
type EventRow = {
  id: string;
  name: string | null;
  date: string; // YYYY-MM-DD
  start_time: string | null;
  end_time: string | null;
  location: "Helsinge" | "Gilleleje";
  max_players: number | null;
  min_elo: number | null;
  max_elo: number | null;
  only_women: boolean;
  closed_group: boolean;
  rules_text: string | null;
  is_published: boolean | null;
  status: "planned" | "published" | "ongoing" | "done" | "canceled" | null;
};

type Profile = { id: string; visningsnavn: string | null };

type EventSignup = {
  visningsnavn: string | null;
  tidligste_tid: string | null;
  kan_spille: boolean | null;
  event_dato: string | null;
};

type EventPlayer = {
  user_id: string; // "name:<lowercased-trimmed>"
  visningsnavn: string | null;
  elo: number;
  tidligste_tid: string | null; // "HH:MM"
};

type Score = { a: number; b: number };

type EventResultInsert = {
  event_id: string;
  group_index: number; // her = kamp-position (0-baseret)
  set_index: number;
  court_label: string | null;
  start_time: string | null;
  end_time: string | null;
  holdA1: string | null;
  holdA2: string | null;
  holdB1: string | null;
  holdB2: string | null;
  scoreA: number;
  scoreB: number;
  tiebreak: boolean;
};

/* ======================== Hjælpere ======================== */
const fmtTime = (t?: string | null) => (t ? t.slice(0, 5) : "");
const toHHMM = (v?: string | null) => (v ? v.slice(0, 5) : null);
const chunk4 = <T,>(arr: T[]) => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += 4) out.push(arr.slice(i, i + 4));
  return out;
};
const ROTATIONS = [
  [
    [0, 1],
    [2, 3],
  ],
  [
    [0, 2],
    [1, 3],
  ],
  [
    [0, 3],
    [1, 2],
  ],
] as const;
const erFærdigtSæt = (a: number, b: number) => {
  const max = Math.max(a, b),
    min = Math.min(a, b);
  return (max === 6 && min <= 4) || (max === 7 && (min === 5 || min === 6));
};
const pctColor = (p: number) =>
  `hsl(${Math.round(120 * Math.max(0, Math.min(1, p)))} ${
    55 + Math.round(40 * Math.abs(p - 0.5) * 2)
  }% 42%)`;
const emojiForPluspoint = (p: number) => {
  if (p >= 100) return "🍾";
  if (p >= 50) return "🏆";
  if (p >= 40) return "🏅";
  if (p >= 30) return "☄️";
  if (p >= 20) return "🚀";
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
  if (p > -150) return "💩";
  return "💩💩";
};
const hhmmToDb = (v?: string) => (v ? (v.length === 5 ? `${v}:00` : v) : null);

const thursdayCourts = ["CC", "1", "2", "3"] as const;
const thursdayTime = (gi: number) =>
  gi < 4
    ? { start: "17:00", end: "18:40" }
    : gi < 8
    ? { start: "18:40", end: "20:20" }
    : { start: "20:20", end: "22:00" };

function normName(v?: string | null) {
  return (v || "").trim().toLowerCase();
}
function toMinutes(v?: string | null) {
  if (!v) return Number.POSITIVE_INFINITY;
  const m = v.slice(0, 5).match(/^(\d{2}):(\d{2})$/);
  if (!m) return Number.POSITIVE_INFINITY;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

/* ====== DB helper: event_result ====== */
async function upsertEventResultRow(p: {
  eventId: string;
  gi: number; // kamp-position (0-baseret)
  si: number;
  courtLabel?: string | number;
  start?: string;
  end?: string;
  a1?: string;
  a2?: string;
  b1?: string;
  b2?: string;
  scoreA?: number;
  scoreB?: number;
  tiebreak?: boolean;
}) {
  const payload: EventResultInsert = {
    event_id: p.eventId,
    group_index: p.gi,
    set_index: p.si,
    court_label: p.courtLabel != null ? String(p.courtLabel) : null,
    start_time: hhmmToDb(p.start),
    end_time: hhmmToDb(p.end),
    holdA1: p.a1 ?? null,
    holdA2: p.a2 ?? null,
    holdB1: p.b1 ?? null,
    holdB2: p.b2 ?? null,
    scoreA: p.scoreA ?? 0,
    scoreB: p.scoreB ?? 0,
    tiebreak: p.tiebreak ?? false,
  };

  const eventResultTbl = supabase.from("event_result") as any;
  const { error } = await eventResultTbl.upsert([payload], {
    onConflict: "event_id,group_index,set_index",
  });
  if (error) {
    console.error("upsertEventResultRow", error);
    alert("Kunne ikke gemme sæt i event_result: " + error.message);
  }
}

/* ======================== Hovedkomponent ======================== */
export default function EventAdminTorsdagClient({ eventId }: { eventId: string }) {
  const router = useRouter();

  const [event, setEvent] = useState<EventRow | null>(null);
  const [eventsList, setEventsList] = useState<EventRow[]>([]);
  const [players, setPlayers] = useState<EventPlayer[]>([]);
  const [orderIds, setOrderIds] = useState<string[]>([]);
  const [eloMap, setEloMap] = useState<Record<string, number>>({});
  const [loadingPlayers, setLoadingPlayers] = useState(true);

  // Swap/search
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [search, setSearch] = useState("");
  const [swapIndex, setSwapIndex] = useState<number | null>(null);
  const [swapOpen, setSwapOpen] = useState(false);

  // NYT: Visuel kamp-rækkefølge (liste af gruppe-indekser i den rækkefølge de vises)
  const [matchOrder, setMatchOrder] = useState<number[]>([]);

  // pr. kamp-position (0..N-1)
  const [courtsOrder, setCourtsOrder] = useState<(string | number)[]>([]);
  const [roundsPerPos, setRoundsPerPos] = useState<Record<number, number>>({});
  const [matchTimes, setMatchTimes] = useState<Record<number, { start: string; end: string }>>({});
  const [scores, setScores] = useState<Record<string, Score>>({});

  const locked = event?.status === "published";

  /* --- fetch event + liste --- */
  useEffect(() => {
    if (!eventId) return;
    (async () => {
      const { data: ev } = await supabase
        .from("events")
        .select("*")
        .eq("id", eventId)
        .maybeSingle<EventRow>();
      setEvent(ev ?? null);

      const res = await fetch("/api/events?all=1", { cache: "no-store" });
      const json = await res.json();
      setEventsList((json?.data ?? []) as EventRow[]);
    })();
  }, [eventId]);

  /* --- Elo map (som din rangliste-side) --- */
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/rangliste", { cache: "no-store" });
        const rang = await res.json();
        const arr = Array.isArray(rang) ? rang : rang?.data ?? [];
        const map: Record<string, number> = {};
        arr.forEach((s: any) => {
          const vn = (s?.visningsnavn || "").trim();
          if (vn) map[vn] = Math.round(s.elo);
        });
        setEloMap(map);
      } catch {
        setEloMap({});
      }
    })();
  }, []);

  /* --- Alle profiler til swap-søgning --- */
  useEffect(() => {
    (async () => {
      setLoadingProfiles(true);
      const { data } = await supabase
        .from("profiles")
        .select("id, visningsnavn")
        .not("visningsnavn", "is", null);
      setAllProfiles(((data ?? []) as Profile[]).filter((p) => !!p.visningsnavn));
      setLoadingProfiles(false);
    })();
  }, []);

  /* --- Load players fra event_signups (kun dato, kun visningsnavn) --- */
  useEffect(() => {
    if (!event?.date) return;
    void loadPlayersFromSignups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.date, eloMap]);

  async function loadPlayersFromSignups() {
    setLoadingPlayers(true);
    try {
      const { data, error } = await supabase
        .from("event_signups")
        .select("visningsnavn, tidligste_tid, kan_spille, event_dato")
        .eq("event_dato", event!.date); // kun dato

      if (error) {
        console.error("event_signups (dato)", error);
        alert("Kunne ikke hente tilmeldinger fra event_signups.\n\n" + error.message);
        setPlayers([]);
        setOrderIds([]);
        return;
      }

      const rows = (data ?? []) as EventSignup[];

      // kun dem med navn + kan_spille = true
      const valid = rows.filter((r) => !!normName(r.visningsnavn) && r.kan_spille === true);

      // dedupe pr. navn (behold den med tidligst mødetid)
      const bestByName = new Map<string, EventSignup>();
      for (const r of valid) {
        const key = normName(r.visningsnavn);
        const prev = bestByName.get(key);
        if (!prev) bestByName.set(key, r);
        else if (toMinutes(r.tidligste_tid) < toMinutes(prev.tidligste_tid)) bestByName.set(key, r);
      }

      const list: EventPlayer[] = Array.from(bestByName.values()).map((x) => {
        const vn = (x.visningsnavn || "").trim();
        return {
          user_id: `name:${normName(vn)}`, // stabil UI-id
          visningsnavn: vn,
          elo: vn ? eloMap[vn] ?? 1000 : 1000,
          tidligste_tid: toHHMM(x.tidligste_tid),
        };
      });

      // sortér efter ELO (DESC)
      list.sort((a, b) => (b.elo ?? 0) - (a.elo ?? 0));

      setPlayers(list);
      setOrderIds(list.map((p) => p.user_id));
    } catch (e: any) {
      console.error("loadPlayersFromSignups (catch)", e?.message || e);
      alert("Kunne ikke hente tilmeldinger fra event_signups.\n\n" + (e?.message || e));
      setPlayers([]);
      setOrderIds([]);
    } finally {
      setLoadingPlayers(false);
    }
  }

  /* --- reconcile orderIds hvis players ændres --- */
  useEffect(() => {
    if (!players.length) {
      setOrderIds([]);
      return;
    }
    const valid = new Set(players.map((p) => p.user_id));
    setOrderIds((prev) => {
      const kept = prev.filter((id) => valid.has(id));
      const missing = players.map((p) => p.user_id).filter((id) => !kept.includes(id));
      return [...kept, ...missing];
    });
  }, [players]);

  /* --- ordered players + grupper --- */
  const orderedPlayers: EventPlayer[] = useMemo(() => {
    const byId = new Map(players.map((p) => [p.user_id, p]));
    return orderIds.map((id) => byId.get(id)).filter((p): p is EventPlayer => !!p);
  }, [players, orderIds]);

  const groups = useMemo(() => chunk4(orderedPlayers), [orderedPlayers]);

  /* --- init visuel kamp-rækkefølge & per-position data når antal grupper ændres --- */
  useEffect(() => {
    const N = groups.length;

    // init matchOrder som 0..N-1 hvis tom eller længde mismatch
    setMatchOrder((prev) => {
      if (prev.length !== N) return Array.from({ length: N }, (_, i) => i);
      return prev;
    });

    // Baner: CC/1/2/3 cykles efter antal kampe (positioner)
    setCourtsOrder((prev) => {
      const need = N;
      const next: (string | number)[] = [];
      for (let i = 0; i < need; i++) next.push(prev[i] ?? thursdayCourts[i % thursdayCourts.length]);
      return next.slice(0, need);
    });

    // Antal sæt pr. kamp-position
    setRoundsPerPos((prev) => {
      const n: Record<number, number> = {};
      for (let i = 0; i < N; i++) n[i] = prev[i] && prev[i] >= 1 ? prev[i] : 3;
      return n;
    });

    // Standard tider pr. kamp-position
    setMatchTimes((prev) => {
      const next: Record<number, { start: string; end: string }> = {};
      for (let i = 0; i < N; i++) {
        next[i] = prev[i] ?? thursdayTime(i);
      }
      return next;
    });

    // Trim scores til kun gyldige positioner
    setScores((prev) => {
      const next: Record<string, Score> = {};
      for (let i = 0; i < N; i++) {
        // beholder eksisterende set-scores for denne pos hvis findes
        Object.keys(prev).forEach((k) => {
          if (k.startsWith(`${i}-`)) next[k] = prev[k];
        });
      }
      return next;
    });
  }, [groups.length]);

  /* --- Søgning/swap spillere --- */
  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [] as Array<Profile & { elo?: number }>;
    const already = new Set(orderIds.map((id) => id.replace(/^name:/, "")));
    return (allProfiles || [])
      .filter((p) => !!p.visningsnavn && p.visningsnavn.toLowerCase().includes(q))
      .filter((p) => !already.has(normName(p.visningsnavn)))
      .slice(0, 50)
      .map((p) => ({ ...p, elo: eloMap[(p.visningsnavn || "").trim()] ?? 1000 }));
  }, [search, allProfiles, orderIds, eloMap]);

  function replacePlayerAt(index: number, np: Profile & { elo?: number }) {
    const vn = (np.visningsnavn || "").trim();
    if (!vn) return;

    const newId = `name:${normName(vn)}`;
    const exists = orderIds.includes(newId);
    if (exists) {
      alert("Spilleren er allerede i listen.");
      return;
    }

    setOrderIds((prev) => {
      const next = [...prev];
      next[index] = newId;
      return next;
    });

    setPlayers((prev) => {
      const map = new Map(prev.map((p) => [p.user_id, p]));
      map.set(newId, {
        user_id: newId,
        visningsnavn: vn,
        elo: eloMap[vn] ?? 1000,
        tidligste_tid: null,
      });
      return Array.from(map.values());
    });

    setSwapIndex(null);
    setSwapOpen(false);
    setSearch("");
  }

  function removePlayer(id: string) {
    setOrderIds((prev) => prev.filter((x) => x !== id));
    setPlayers((prev) => prev.filter((p) => p.user_id !== id));
  }

  function movePlayerUp(id: string) {
    setOrderIds((prev) => {
      const i = prev.indexOf(id);
      if (i <= 0) return prev;
      const copy = [...prev];
      [copy[i - 1], copy[i]] = [copy[i], copy[i - 1]];
      return copy;
    });
  }

  /* --- Plan (visuel rækkefølge) --- */
  const plan = useMemo(() => {
    // kamp-positioner i den visuelle rækkefølge: [0..N-1], og hvilke spillere (gruppe) de viser
    return matchOrder.map((groupIdx, pos) => ({
      pos, // visuel position (bruges som gi for DB)
      groupIdx,
      court: courtsOrder[pos] ?? pos + 1,
      players: groups[groupIdx] ?? [],
    }));
  }, [groups, matchOrder, courtsOrder]);

  /* --- Flyt kamp op (bytter position 'pos' med 'pos-1') --- */
  const moveMatchUp = (pos: number) => {
    if (pos <= 0 || locked) return;

    // 1) Byt matchOrder (visuel rækkefølge af grupper)
    setMatchOrder((prev) => {
      const next = [...prev];
      [next[pos - 1], next[pos]] = [next[pos], next[pos - 1]];
      return next;
    });

    // 2) Byt courtsOrder (baner pr. position)
    setCourtsOrder((prev) => {
      const next = [...prev];
      [next[pos - 1], next[pos]] = [next[pos], next[pos - 1]];
      return next;
    });

    // 3) Byt matchTimes
    setMatchTimes((prev) => {
      const next = { ...prev };
      [next[pos - 1], next[pos]] = [next[pos], next[pos - 1]];
      return next;
    });

    // 4) Byt roundsPerPos
    setRoundsPerPos((prev) => {
      const next = { ...prev };
      [next[pos - 1], next[pos]] = [next[pos], next[pos - 1]];
      return next;
    });

    // 5) Byt scores for alle sæt under de to positioner
    setScores((prev) => {
      const next: Record<string, Score> = { ...prev };

      const swapKeys = (aPos: number, bPos: number) => {
        // find alle set-index vi kender for a og b
        const aKeys = Object.keys(prev).filter((k) => k.startsWith(`${aPos}-`));
        const bKeys = Object.keys(prev).filter((k) => k.startsWith(`${bPos}-`));

        // midlertidige kopier
        const aVals: Record<number, Score> = {};
        const bVals: Record<number, Score> = {};

        aKeys.forEach((k) => {
          const si = parseInt(k.split("-")[1], 10);
          aVals[si] = prev[k];
          delete next[k];
        });
        bKeys.forEach((k) => {
          const si = parseInt(k.split("-")[1], 10);
          bVals[si] = prev[k];
          delete next[k];
        });

        // skriv tilbage “byttet”
        Object.entries(aVals).forEach(([siStr, val]) => {
          const si = parseInt(siStr, 10);
          next[`${bPos}-${si}`] = val;
        });
        Object.entries(bVals).forEach(([siStr, val]) => {
          const si = parseInt(siStr, 10);
          next[`${aPos}-${si}`] = val;
        });
      };

      swapKeys(pos, pos - 1);
      return next;
    });
  };

  /* --- Elo-siden (samlet diff) --- */
  const dayDiffSorted = useMemo(() => {
    const sets: any[] = [];
    plan.forEach(({ pos, players }, visualPos) => {
      const r = roundsPerPos[pos] ?? 3;
      for (let si = 0; si < r; si++) {
        const rot = ROTATIONS[si % ROTATIONS.length];
        const a1 = players[rot[0][0]]?.visningsnavn || "?";
        const a2 = players[rot[0][1]]?.visningsnavn || "?";
        const b1 = players[rot[1][0]]?.visningsnavn || "?";
        const b2 = players[rot[1][1]]?.visningsnavn || "?";
        const sc = scores[`${visualPos}-${si}`] ?? { a: 0, b: 0 }; // NB: bruger visuel pos i UI
        const done = sc.a !== 0 || sc.b !== 0 ? erFærdigtSæt(sc.a, sc.b) : false;
        sets.push({
          id: 1_000_000 + visualPos * 100 + si,
          kampid: 900_000 + visualPos,
          date: event?.date ?? "1970-01-01",
          holdA1: a1,
          holdA2: a2,
          holdB1: b1,
          holdB2: b2,
          scoreA: sc.a,
          scoreB: sc.b,
          finish: done,
          event: true,
          tiebreak: "false",
        });
      }
    });
    const { eloChanges } = beregnEloForKampe(sets as any, eloMap);
    const totals: Record<string, number> = {};
    for (const s of sets) {
      if (s.scoreA === 0 && s.scoreB === 0) continue;
      const ch = eloChanges?.[s.id];
      if (!ch) continue;
      Object.entries(ch).forEach(([navn, e]: any) => {
        const diff = typeof (e as any)?.diff === "number" ? (e as any).diff : 0;
        totals[navn] = (totals[navn] ?? 0) + diff;
      });
    }
    return Object.entries(totals)
      .map(([navn, diff]) => ({ navn, diff }))
      .sort((a, b) => b.diff - a.diff);
  }, [plan, roundsPerPos, scores, eloMap, event?.date]);

  const header = useMemo(() => ({ emojiLeft: "🍺", emojiRight: "🍺" }), []);

  if (!event) return <div className="p-4">Indlæser…</div>;

  // Helper: præcis match – udeluk fx "TorsdagsTøserne"
  const isThursdayBeer = (name?: string | null) => {
    if (!name) return false;
    const s = name
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    return /\btorsdags\s*bold\b/.test(s) || /\bbajer(e)?\b/.test(s);
  };

  /* ======================== RENDER ======================== */
  return (
    <div className="mx-auto px-2 sm:px-3 lg:px-4 max-w-[1600px] text-gray-900 dark:text-gray-100">
      <style jsx global>{`
        input[type="number"]::-webkit-outer-spin-button,
        input[type="number"]::-webkit-inner-spin-button {
          -webkit-appearance: none;
          margin: 0;
        }
        input[type="number"] {
          -moz-appearance: textfield;
          appearance: textfield;
        }
        .tabnums {
          font-variant-numeric: tabular-nums;
        }
      `}</style>

      {/* Header */}
      <div className="mt-1 mb-2 text-center">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-green-600">
          {header.emojiLeft} {event.name} {header.emojiRight}{" "}
          {locked && (
            <span className="ml-2 text-xs align-middle px-2 py-0.5 rounded-full bg-green-600 text-white">
              🔒 Offentliggjort
            </span>
          )}
        </h1>
        <div className="text-xs opacity-70 mt-1">
          {event.date} · {fmtTime(event.start_time)}–{fmtTime(event.end_time)} · {event.location}
        </div>

        {/* Top controls: vælg kun TorsdagsBold & Bajere */}
        <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
          <label className="text-sm">
            <span className="opacity-80 mr-2">Skift event</span>
            {(() => {
              const tbEvents = (eventsList || [])
                .filter((ev) => isThursdayBeer(ev.name))
                .sort((a, b) =>
                  a.date === b.date ? (String(a.start_time) < String(b.start_time) ? -1 : 1) : a.date < b.date ? -1 : 1
                );
              const currentIsTB = isThursdayBeer(event?.name);
              return (
                <select
                  className="border rounded px-2 py-1 text-sm bg-white dark:bg-zinc-900 border-green-400/70 dark:border-green-800/70"
                  value={currentIsTB ? event!.id : ""}
                  onChange={(e) => {
                    const id = e.target.value;
                    if (!id) return;
                    router.push(`/admin/torsdagspadel/event/${id}`);
                  }}
                >
                  {!currentIsTB && (
                    <option value="" disabled>
                      Vælg et TorsdagsBold & Bajere-event…
                    </option>
                  )}
                  {tbEvents.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.date} · {fmtTime(ev.start_time)} – {ev.location} · {ev.name}
                    </option>
                  ))}
                </select>
              );
            })()}
          </label>

          <label className="text-sm flex items-center gap-2 px-2 py-1 rounded-md border bg-white dark:bg-zinc-900 border-green-300 dark:border-green-700">
            <input
              type="checkbox"
              checked={locked}
              onChange={async (e) => {
                const { data, error } = await (supabase.from("events") as any)
                  .update({ status: e.target.checked ? "published" : "planned" })
                  .eq("id", event!.id)
                  .select("*")
                  .maybeSingle();
                if (!error && data) setEvent(data);
              }}
            />
            <span>Programmet offentliggøres</span>
          </label>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 sm:gap-4">
        {/* Venstre */}
        <section className="md:col-span-3 rounded-xl p-3 bg-green-50/70 dark:bg-green-900/10 border border-green-400/80 dark:border-green-800">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold text-green-900 dark:text-green-200">Spillere ({orderedPlayers.length})</h2>
            <button
              type="button"
              className="text-xs underline text-green-700 dark:text-green-300"
              onClick={() => loadPlayersFromSignups()}
            >
              Opdater
            </button>
          </div>

          {/* Spillerliste (ELO-sorteret) */}
          <div className="mt-1 space-y-2">
            {loadingPlayers ? (
              <div>Indlæser…</div>
            ) : orderedPlayers.length === 0 ? (
              <div className="text-sm opacity-70">Ingen tilmeldte endnu.</div>
            ) : (
              chunk4(orderedPlayers).map((block, bi) => (
                <div
                  key={`block-${bi}`}
                  className="rounded-lg border border-green-500/80 dark:border-green-700/80 bg-white/95 dark:bg-zinc-900 shadow-sm"
                >
                  <div className="flex items-center justify-between px-3 py-2 bg-green-100/60 dark:bg-green-900/30">
                    <div className="font-semibold text-green-900 dark:text-green-200">Gruppe {bi + 1}</div>
                  </div>

                  <ul className="px-3 py-2 divide-y divide-green-100 dark:divide-green-900/30">
                    {block.map((p, idx) => {
                      const i = bi * 4 + idx;
                      const uid = orderIds[i];
                      return (
                        <li key={`${uid}-${i}`} className="py-1.5 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">
                              {i + 1}. {p?.visningsnavn || "(ukendt)"}
                            </div>
                            <div className="text-[11px] opacity-70">
                              ELO {p?.elo ?? 1000}
                              {p?.tidligste_tid ? <> · {p.tidligste_tid}</> : null}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => movePlayerUp(uid)}
                              disabled={locked}
                              className={`p-1.5 rounded-md border text-xs hover:bg-green-50 dark:hover:bg-green-900/30 border-green-300 dark:border-green-700 text-green-700 dark:text-green-300 ${
                                locked ? "opacity-50 cursor-not-allowed" : ""
                              }`}
                              title={locked ? "Låst" : "Ryk spiller op"}
                            >
                              ⬆️
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (locked) return;
                                setSwapIndex(i);
                                setSwapOpen(true);
                                setSearch("");
                              }}
                              disabled={locked}
                              className={`p-1.5 rounded-md border text-xs hover:bg-blue-50 border-blue-300 text-blue-700 dark:hover:bg-blue-900/30 dark:border-blue-700 dark:text-blue-200 ${
                                locked ? "opacity-50 cursor-not-allowed" : ""
                              }`}
                              title={locked ? "Låst" : "Skift spiller"}
                            >
                              🔁
                            </button>
                            <button
                              type="button"
                              onClick={() => removePlayer(uid)}
                              disabled={locked}
                              className={`p-1.5 rounded-md border text-xs hover:bg-red-50 dark:hover:bg-red-900/30 border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 ${
                                locked ? "opacity-50 cursor-not-allowed" : ""
                              }`}
                              title={locked ? "Låst" : "Fjern spiller"}
                            >
                              🗑️
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Midten */}
        <section className="md:col-span-7 border rounded-xl p-3 bg-white/80 dark:bg-zinc-900/60 border-green-400 dark:border-green-800">
          {!plan.length ? (
            <div className="text-sm opacity-70">Tilmeldinger hentes fra event_signups.</div>
          ) : (
            <CenterMatches
              plan={plan}
              moveMatchUp={moveMatchUp}
              courtsOrder={courtsOrder}
              setCourtsOrder={setCourtsOrder}
              setCourtLabel={(pos, value) => {
                setCourtsOrder((prev) => {
                  const next = [...prev];
                  next[pos] = (value || "").trim() || pos + 1;
                  return next;
                });
                const sets = roundsPerPos[pos] ?? 3;
                for (let si = 0; si < sets; si++)
                  void upsertEventResultRow({
                    eventId: event!.id,
                    gi: pos,
                    si,
                    courtLabel: value,
                    start: matchTimes[pos]?.start,
                    end: matchTimes[pos]?.end,
                  });
              }}
              matchTimes={matchTimes}
              setMatchTimes={setMatchTimes}
              roundsPerPos={roundsPerPos}
              addRoundForPos={(pos) => {
                setRoundsPerPos((prev) => {
                  const nextCnt = (prev[pos] ?? 3) + 1;
                  void upsertEventResultRow({
                    eventId: event!.id,
                    gi: pos,
                    si: nextCnt - 1,
                    scoreA: 0,
                    scoreB: 0,
                  });
                  return { ...prev, [pos]: nextCnt };
                });
              }}
              scores={scores}
              setScore={(pos, si, side, raw, gPlayers) => {
                const n = (() => {
                  const t = raw.replace(/\D/g, "");
                  return t === "" ? 0 : Math.min(7, Math.max(0, parseInt(t, 10)));
                })();
                const key = `${pos}-${si}`;
                setScores((s) => {
                  const prev = s[key] ?? { a: 0, b: 0 };
                  const next = { ...prev, [side]: n };

                  const rot = ROTATIONS[si % ROTATIONS.length];
                  void upsertEventResultRow({
                    eventId: event!.id,
                    gi: pos,
                    si,
                    courtLabel: courtsOrder[pos],
                    start: matchTimes[pos]?.start,
                    end: matchTimes[pos]?.end,
                    a1: gPlayers[rot[0][0]]?.visningsnavn || "",
                    a2: gPlayers[rot[0][1]]?.visningsnavn || "",
                    b1: gPlayers[rot[1][0]]?.visningsnavn || "",
                    b2: gPlayers[rot[1][1]]?.visningsnavn || "",
                    scoreA: next.a,
                    scoreB: next.b,
                    tiebreak: false,
                  });

                  return { ...s, [key]: next };
                });
              }}
              eloMap={eloMap}
              event={event}
              courtSuggestions={["CC", "1", "2", "3"]}
            />
          )}
        </section>

        {/* Højre */}
        <section className="md:col-span-2 border rounded-xl p-3 bg-white/90 dark:bg-zinc-900/60 border-green-400 dark:border-green-800 flex flex-col md:sticky md:top-2 h-fit">
          <h2 className="font-semibold mb-2 text-green-900 dark:text-green-200">📈 Dagens Elo</h2>
          {dayDiffSorted.length === 0 ? (
            <div className="text-sm opacity-70">Ingen udfyldte sæt endnu.</div>
          ) : (
            <div className="space-y-1 max-h-[480px] overflow-auto pr-1">
              {dayDiffSorted.map(({ navn, diff }) => (
                <div key={navn} className="flex items-center justify-between text-sm">
                  <span className="truncate max-w-[60%]">{navn}</span>
                  <span className={diff >= 0 ? "text-green-600 tabnums" : "text-red-500 tabnums"}>
                    {emojiForPluspoint(diff)} {diff >= 0 ? "+" : ""}
                    {diff.toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Swap modal */}
      <SwapModal
        open={swapOpen && !locked}
        onClose={() => {
          setSwapOpen(false);
          setSwapIndex(null);
        }}
        searchResults={searchResults}
        search={search}
        setSearch={setSearch}
        loadingProfiles={loadingProfiles}
        onPick={(p) => {
          if (swapIndex == null) return;
          replacePlayerAt(swapIndex, p as any);
        }}
      />
    </div>
  );
}

/* ===================== Midterkolonnen ===================== */
function CenterMatches({
  plan,
  moveMatchUp,
  courtsOrder,
  setCourtsOrder,
  setCourtLabel,
  matchTimes,
  setMatchTimes,
  roundsPerPos,
  addRoundForPos,
  scores,
  setScore,
  eloMap,
  event,
  courtSuggestions,
}: {
  plan: Array<{ pos: number; groupIdx: number; court: string | number; players: EventPlayer[] }>;
  moveMatchUp: (pos: number) => void;
  courtsOrder: (string | number)[];
  setCourtsOrder: React.Dispatch<React.SetStateAction<(string | number)[]>>;
  setCourtLabel: (pos: number, value: string) => void;
  matchTimes: Record<number, { start: string; end: string }>;
  setMatchTimes: React.Dispatch<React.SetStateAction<Record<number, { start: string; end: string }>>>;
  roundsPerPos: Record<number, number>;
  addRoundForPos: (pos: number) => void;
  scores: Record<string, { a: number; b: number }>;
  setScore: (pos: number, si: number, side: "a" | "b", raw: string, gPlayers: EventPlayer[]) => void;
  eloMap: Record<string, number>;
  event: EventRow;
  courtSuggestions: string[];
}) {
  const setKey = (pos: number, si: number) => `${pos}-${si}`;
  const scoreOf = (s?: { a: number; b: number }) => ({ a: s?.a ?? 0, b: s?.b ?? 0 });

  const ScoreBox = ({
    value,
    onChange,
    title,
  }: {
    value: number;
    onChange: (val: string) => void;
    title: string;
  }) => (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-7]"
      maxLength={1}
      value={String(value)}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => onChange(e.target.value)}
      className="w-7 border rounded px-0.5 py-0.5 text-center text-sm tabnums bg-white dark:bg-zinc-900 border-green-300 dark:border-green-700"
      title={title}
    />
  );

  return (
    <div className="space-y-3">
      {plan.map(({ pos, players }, visualIndex) => {
        const kampNr = visualIndex + 1; // vises i UI
        const runder = roundsPerPos[pos] ?? 3;
        const mt = matchTimes[pos] ?? {
          start: (event.start_time || "17:00").slice(0, 5),
          end: (event.end_time || "18:30").slice(0, 5),
        };

        return (
          <div key={`kamp-${pos}`} className="rounded-lg border dark:border-zinc-800 overflow-hidden">
            {/* Header linje */}
            <div className="px-3 py-2 bg-green-100/70 dark:bg-green-900/30 flex flex-wrap items-center gap-2 justify-between">
              <div className="font-semibold text-green-900 dark:text-green-200">Kamp #{kampNr}</div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => moveMatchUp(visualIndex)}
                  disabled={visualIndex === 0}
                  className={`text-xs px-2 py-1 rounded border bg-white/80 hover:bg-green-50 border-green-300 dark:border-green-700 dark:bg-zinc-900 ${
                    visualIndex === 0 ? "opacity-50 cursor-not-allowed" : ""
                  }`}
                  title="Flyt kampen én op"
                >
                  ⬆️ Flyt op
                </button>

                <label className="text-sm flex items-center gap-1">
                  Bane
                  <select
                    className="border rounded px-2 py-1 text-sm bg-white dark:bg-zinc-900 border-green-300 dark:border-green-700"
                    value={String(courtsOrder[visualIndex] ?? "")}
                    onChange={(e) => {
                      // vi gemmer på positionen (visualIndex == pos i plan-arrayen)
                      setCourtLabel(pos, e.target.value);
                    }}
                  >
                    {courtSuggestions.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm flex items-center gap-1">
                  <input
                    type="time"
                    name="start"
                    value={mt.start}
                    onChange={(e) => {
                      const nv = e.target.value;
                      setMatchTimes((p) => ({ ...p, [pos]: { ...mt, start: nv } }));
                      for (let i = 0; i < runder; i++)
                        upsertEventResultRow({
                          eventId: event.id,
                          gi: pos,
                          si: i,
                          courtLabel: courtsOrder[visualIndex],
                          start: nv,
                          end: matchTimes[pos]?.end ?? mt.end,
                        });
                    }}
                    className="border rounded px-2 py-1 text-sm bg-white dark:bg-zinc-900 border-green-300 dark:border-green-700"
                    title="Start"
                  />
                  –
                  <input
                    type="time"
                    name="end"
                    value={mt.end}
                    onChange={(e) => {
                      const nv = e.target.value;
                      setMatchTimes((p) => ({ ...p, [pos]: { ...mt, end: nv } }));
                      for (let i = 0; i < runder; i++)
                        upsertEventResultRow({
                          eventId: event.id,
                          gi: pos,
                          si: i,
                          courtLabel: courtsOrder[visualIndex],
                          start: matchTimes[pos]?.start ?? mt.start,
                          end: nv,
                        });
                    }}
                    className="border rounded px-2 py-1 text-sm bg-white dark:bg-zinc-900 border-green-300 dark:border-green-700"
                    title="Slut"
                  />
                </label>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => addRoundForPos(pos)}
                  className="text-xs px-2 py-1 rounded border bg-white/80 hover:bg-green-50 border-green-300 dark:border-green-700 dark:bg-zinc-900"
                  title="Tilføj sæt"
                >
                  + Tilføj sæt
                </button>
              </div>
            </div>

            {/* Sætlinjer */}
            <div className="px-3 py-2 space-y-1">
              {Array.from({ length: runder }).map((_, si) => {
                const rot = ROTATIONS[si % ROTATIONS.length];
                const a1 = players[rot[0][0]];
                const a2 = players[rot[0][1]];
                const b1 = players[rot[1][0]];
                const b2 = players[rot[1][1]];
                const key = setKey(visualIndex, si); // NB: score pr. VISUEL position
                const sc = scoreOf(scores[key]);

                // Forventningspct baseret på tidligere sæt (inden dette)
                const prevSets: any[] = [];
                for (let vi = 0; vi <= visualIndex; vi++) {
                  const rMax = roundsPerPos[plan[vi].pos] ?? 3;
                  const lastSi = vi === visualIndex ? si - 1 : rMax - 1;
                  if (lastSi < 0) continue;
                  const playersPrev = plan[vi]?.players ?? [];
                  for (let s = 0; s <= lastSi; s++) {
                    const r = ROTATIONS[s % ROTATIONS.length];
                    const A1 = playersPrev[r[0][0]]?.visningsnavn || "?";
                    const A2 = playersPrev[r[0][1]]?.visningsnavn || "?";
                    const B1 = playersPrev[r[1][0]]?.visningsnavn || "?";
                    const B2 = playersPrev[r[1][1]]?.visningsnavn || "?";
                    const SS = scoreOf(scores[`${vi}-${s}`]);
                    const done = SS.a !== 0 || SS.b !== 0 ? erFærdigtSæt(SS.a, SS.b) : false;
                    prevSets.push({
                      id: 2_000_000 + vi * 100 + s,
                      kampid: 800_000 + vi,
                      date: event.date ?? "1970-01-01",
                      holdA1: A1,
                      holdA2: A2,
                      holdB1: B1,
                      holdB2: B2,
                      scoreA: SS.a,
                      scoreB: SS.b,
                      finish: done,
                      event: true,
                      tiebreak: "false",
                    });
                  }
                }
                const { nyEloMap } = beregnEloForKampe(prevSets as any, eloMap);
                const rA1 = a1?.visningsnavn ? nyEloMap[a1.visningsnavn] ?? 1500 : 1500;
                const rA2 = a2?.visningsnavn ? nyEloMap[a2.visningsnavn] ?? 1500 : 1500;
                const rB1 = b1?.visningsnavn ? nyEloMap[b1.visningsnavn] ?? 1500 : 1500;
                const rB2 = b2?.visningsnavn ? nyEloMap[b2.visningsnavn] ?? 1500 : 1500;
                const rA = (rA1 + rA2) / 2,
                  rB = (rB1 + rB2) / 2,
                  qa = Math.pow(10, rA / 400),
                  qb = Math.pow(10, rB / 400),
                  pA = qa / (qa + qb),
                  pctA = Math.round(100 * pA),
                  pctB = 100 - pctA,
                  colorA = pctColor(pA),
                  colorB = pctColor(1 - pA);

                const nonZero = sc.a !== 0 || sc.b !== 0;
                const currentSet = {
                  id: 3_000_000 + visualIndex * 100 + si,
                  kampid: 700_000 + visualIndex,
                  date: event.date ?? "1970-01-01",
                  holdA1: a1?.visningsnavn || "?",
                  holdA2: a2?.visningsnavn || "?",
                  holdB1: b1?.visningsnavn || "?",
                  holdB2: b2?.visningsnavn || "?",
                  scoreA: sc.a,
                  scoreB: sc.b,
                  finish: erFærdigtSæt(sc.a, sc.b),
                  event: true,
                  tiebreak: "false",
                };
                const { eloChanges: chForThis } = beregnEloForKampe([...prevSets, currentSet] as any, eloMap);
                let plusTxt = "";
                if (nonZero && chForThis?.[currentSet.id]) {
                  const diffs = Object.values(chForThis[currentSet.id]).map((x: any) =>
                    typeof x?.diff === "number" ? x.diff : 0
                  );
                  const maxPos = Math.max(...diffs.filter((d: number) => d > 0));
                  if (Number.isFinite(maxPos)) plusTxt = `+${maxPos.toFixed(1)}`;
                }

                return (
                  <div key={key} className="flex items-center justify-between gap-2 text-sm">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="opacity-70 shrink-0">Sæt {si + 1}</span>
                      <div className="flex-1 flex items-center gap-2 min-w-0">
                        <span className="truncate basis-0 grow min-w-0">
                          {a1?.visningsnavn || "?"} &amp; {a2?.visningsnavn || "?"}
                        </span>
                        <span className="shrink-0 font-semibold tabnums" style={{ color: colorA }}>
                          {pctA}%
                        </span>
                        <span className="opacity-60 shrink-0">vs</span>
                        <span className="shrink-0 font-semibold tabnums" style={{ color: colorB }}>
                          {pctB}%
                        </span>
                        <span className="truncate basis-0 grow min-w-0 text-right">
                          {b1?.visningsnavn || "?"} &amp; {b2?.visningsnavn || "?"}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex items-center gap-1">
                        <ScoreBox
                          value={sc.a}
                          onChange={(val) => setScore(plan[visualIndex].pos, si, "a", val, players)}
                          title="Score A (0–7)"
                        />
                        <span className="opacity-60">-</span>
                        <ScoreBox
                          value={sc.b}
                          onChange={(val) => setScore(plan[visualIndex].pos, si, "b", val, players)}
                          title="Score B (0–7)"
                        />
                      </div>
                      <span className="text-green-700 font-semibold tabnums min-w-[36px] text-right">{plusTxt}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ===== Modal: Skift spiller ===== */
function SwapModal({
  open,
  onClose,
  onPick,
  searchResults,
  search,
  setSearch,
  loadingProfiles,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (p: Profile & { elo?: number }) => void;
  searchResults: Array<Profile & { elo?: number }>;
  search: string;
  setSearch: (v: string) => void;
  loadingProfiles: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-6">
      <div className="w-full sm:max-w-lg bg-white dark:bg-zinc-900 rounded-t-2xl sm:rounded-2xl shadow-xl border border-green-300 dark:border-green-800">
        <div className="p-3 sm:p-4 border-b border-green-300 dark:border-green-800 flex items-center justify-between">
          <div className="font-semibold">Skift spiller</div>
          <button onClick={onClose} className="text-sm">
            Luk
          </button>
        </div>
        <div className="p-3 sm:p-4">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Søg (visningsnavn)…"
            className="w-full border rounded px-2 py-1 text-sm bg-white/90 dark:bg-zinc-900 border-green-400/70 dark:border-green-800/70"
          />
          <div className="mt-2 max-h-72 overflow-auto rounded border bg-white dark:bg-zinc-900 border-green-300 dark:border-green-800">
            {loadingProfiles && <div className="p-2 text-xs opacity-70">Indlæser…</div>}
            {!loadingProfiles &&
              searchResults.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onPick(p)}
                  className="w-full text-left flex items-center justify-between px-2 py-1 text-sm hover:bg-green-100/70 dark:hover:bg-green-900/30"
                >
                  <div className="truncate">
                    {p.visningsnavn || "Ukendt"} <span className="opacity-70">· ELO {p.elo}</span>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded border border-green-300 dark:border-green-700 text-green-700 dark:text-green-300">
                    Skift
                  </span>
                </button>
              ))}
            {!loadingProfiles && !searchResults.length && <div className="p-2 text-xs opacity-70">Ingen…</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

