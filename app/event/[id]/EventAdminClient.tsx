"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { beregnEloForKampe } from "@/lib/beregnElo";

/* ======================== Typer ======================== */
type EventRow = {
  id: string;
  name: string | null;
  date: string;
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
  signup_url: string | null;
  // ⬇️ Tilføjet "programed" i unionen
  status: "planned" | "published" | "ongoing" | "done" | "canceled" | null;
};
type Profile = { id: string; visningsnavn: string | null };
type EventPlayer = { user_id: string; visningsnavn: string | null; elo: number };
type Score = { a: number; b: number };

type EventResultInsert = {
  event_id: string;
  group_index: number;
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
type EventResultMeta = Pick<
  EventResultInsert,
  "group_index" | "court_label" | "start_time" | "end_time"
> & { updated_at: string };

// ---- NEWRESULTS: Insert-type (KUN de kolonner der findes i din tabel) ----
type NewResultInsert = {
  date: string; // "YYYY-MM-DD"
  finish: boolean;
  tiebreak: boolean;
  event: boolean;
  kampid: number; // fælles for sæt i samme kamp
  holdA1: string;
  holdA2: string;
  holdB1: string;
  holdB2: string;
  scoreA: number;
  scoreB: number;
  indberettet_af: string;
};

/* ======================== Hjælpere ======================== */
const fmtTime = (t?: string | null) => (t ? t.slice(0, 5) : "");
const sortByElo = <T extends { elo?: number | null }>(arr: T[]) =>
  [...arr].sort((a, b) => (b.elo ?? 0) - (a.elo ?? 0));
const chunk4 = <T,>(arr: T[]) => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += 4) out.push(arr.slice(i, i + 4));
  return out;
};
const addMinutes = (hhmm: string, minutes: number) => {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(0, 0, 0, h || 0, m || 0, 0);
  d.setMinutes(d.getMinutes() + minutes);
  return `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
};
const isTorsdag = (name?: string | null) => !!name && /torsdag/i.test(name || "");
const thursdayCourts = ["CC", "1", "2", "3"] as const;
const thursdayTime = (gi: number) =>
  gi < 4
    ? { start: "17:00", end: "18:40" }
    : gi < 8
    ? { start: "18:40", end: "20:20" }
    : { start: "20:20", end: "22:00" };
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

function courtOrderFor(loc: EventRow["location"], groups: number): (string | number)[] {
  if (loc === "Gilleleje") {
    const pattern = ["2", "1", "3", "6", "5"] as const;
    return Array.from({ length: groups }, (_, i) => pattern[i % pattern.length]);
  }
  const out: (string | number)[] = ["CC"];
  for (let i = 1; out.length < groups; i++) out.push(i);
  return out;
}

/* ====== DB helpers: event_result ====== */
async function loadEventResultsToState(
  eventId: string,
  setScores: React.Dispatch<React.SetStateAction<Record<string, Score>>>,
  setRounds: React.Dispatch<React.SetStateAction<Record<number, number>>>
) {
  const { data, error } = await supabase
    .from("event_result")
    .select("*")
    .eq("event_id", eventId)
    .order("group_index")
    .order("set_index");

  if (error || !data) return;

  const scores: Record<string, Score> = {};
  const rounds: Record<number, number> = {};

  (data as EventResultInsert[]).forEach((r) => {
    scores[`${r.group_index}-${r.set_index}`] = {
      a: r.scoreA ?? 0,
      b: r.scoreB ?? 0,
    };
    rounds[r.group_index] = Math.max(rounds[r.group_index] ?? 0, r.set_index + 1);
  });

  setScores(scores);
  setRounds((prev) => {
    const c = { ...prev };
    Object.entries(rounds).forEach(([gi, cnt]) => {
      const g = Number(gi);
      c[g] = Math.max(Number(cnt), c[g] ?? 3);
    });
    return c;
  });
}

// Bygger alle sæt fra det nuværende UI-state, score=0–0 (forudfyld program)
function buildPlannedEventResultRows(params: {
  eventId: string;
  plan: Array<{ gi:number; court:string|number; players: { visningsnavn?: string|null }[] }>;
  roundsPerCourt: Record<number, number>;
  courtsOrder: (string|number)[];
  matchTimes: Record<number, { start:string; end:string }>;
}) {
  const { eventId, plan, roundsPerCourt, courtsOrder, matchTimes } = params;
  const rows: EventResultInsert[] = [];

  for (let gi = 0; gi < plan.length; gi++) {
    const g = plan[gi];
    const sets = Math.max(1, roundsPerCourt[gi] ?? 3);
    const court = courtsOrder[gi] != null ? String(courtsOrder[gi]) : String(g.court ?? gi + 1);
    const times = matchTimes[gi] ?? { start: "17:00", end: "18:30" };

    for (let si = 0; si < sets; si++) {
      const rot = ROTATIONS[si % ROTATIONS.length];
      const a1 = (g.players[rot[0][0]]?.visningsnavn || "").trim();
      const a2 = (g.players[rot[0][1]]?.visningsnavn || "").trim();
      const b1 = (g.players[rot[1][0]]?.visningsnavn || "").trim();
      const b2 = (g.players[rot[1][1]]?.visningsnavn || "").trim();

      rows.push({
        event_id: eventId,
        group_index: gi,
        set_index: si,
        court_label: court || null,
        start_time: hhmmToDb(times.start),
        end_time: hhmmToDb(times.end),
        holdA1: a1 || null,
        holdA2: a2 || null,
        holdB1: b1 || null,
        holdB2: b2 || null,
        scoreA: 0,
        scoreB: 0,
        tiebreak: false,
      });
    }
  }
  return rows;
}

// Upserter hele programmet til event_result inden publicering (idempotent)
async function ensureProgramPersistedToEventResult(params: {
  eventId: string;
  plan: Array<{ gi:number; court:string|number; players: { visningsnavn?: string|null }[] }>;
  roundsPerCourt: Record<number, number>;
  courtsOrder: (string|number)[];
  matchTimes: Record<number, { start:string; end:string }>;
}) {
  const rows = buildPlannedEventResultRows(params);
  if (!rows.length) return;

  const CHUNK = 500; // beskyt mod for store payloads
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { error } = await (supabase.from("event_result") as any).upsert(slice, {
      onConflict: "event_id,group_index,set_index",
    });
    if (error) throw error;
  }
}



async function upsertEventResultRow(p: {
  eventId: string;
  gi: number;
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
  const { data: auth } = await supabase.auth.getUser();
  const updated_by: string | null = auth?.user?.id ?? null;

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

async function persistGroupMeta(
  eventId: string,
  gi: number,
  rounds: Record<number, number>,
  courts: (string | number)[],
  times: Record<number, { start: string; end: string }>
) {
  const sets = rounds[gi] ?? 3;
  const ct = courts[gi];
  const mt = times[gi];
  for (let si = 0; si < sets; si++)
    await upsertEventResultRow({
      eventId,
      gi,
      si,
      courtLabel: ct,
      start: mt?.start,
      end: mt?.end,
    });
}

async function getNextKampId(): Promise<number> {
  type KampIdRow = { kampid: number | string | null };
  const { data, error } = await supabase
    .from("newresults")
    .select("kampid")
    .order("kampid", { ascending: false })
    .limit(1);

  if (error) {
    console.warn("Kunne ikke hente max kampid, starter fra 1:", error.message);
    return 1;
  }

  const lastAny = (data as KampIdRow[] | null)?.[0]?.kampid;
  const lastNum =
    typeof lastAny === "number"
      ? lastAny
      : typeof lastAny === "string"
      ? parseInt(lastAny, 10)
      : 0;

  return (Number.isFinite(lastNum) ? lastNum : 0) + 1;
}

/* ======================== Hovedkomponent ======================== */
export default function EventAdminClient({ eventId }: { eventId: string }) {
  const router = useRouter();

  const [event, setEvent] = useState<EventRow | null>(null);
  const [eventsList, setEventsList] = useState<EventRow[]>([]);
  const [players, setPlayers] = useState<EventPlayer[]>([]);
  const [orderIds, setOrderIds] = useState<string[]>([]);
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [eloMap, setEloMap] = useState<Record<string, number>>({});
  const [loadingPlayers, setLoadingPlayers] = useState(true);
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [search, setSearch] = useState("");
  const [showEdit, setShowEdit] = useState(false);
  const [swapIndex, setSwapIndex] = useState<number | null>(null);
  const [swapOpen, setSwapOpen] = useState(false);

  const [courtsOrder, setCourtsOrder] = useState<(string | number)[]>([]);
  const [roundsPerCourt, setRoundsPerCourt] = useState<Record<number, number>>({});
  const [matchTimes, setMatchTimes] = useState<Record<number, { start: string; end: string }>>({});
  const [scores, setScores] = useState<Record<string, Score>>({});
  const [groupOrder, setGroupOrder] = useState<number[]>([]);

  // 🔒 Låse-flag når programmet er offentliggjort
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

  /* --- Elo map fra /api/rangliste --- */
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

  /* --- Alle profiler til søgning/tilføj --- */
  useEffect(() => {
  (async () => {
    setLoadingProfiles(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, visningsnavn, active")
      .eq("active", true)                    // ⬅️ kun aktive profiler
      .not("visningsnavn", "is", null)
      .order("visningsnavn", { ascending: true });

    const rows = (data ?? [])
      .map((p: any) => ({ id: p.id, visningsnavn: (p.visningsnavn ?? "").toString().trim() }))
      .filter((p) => p.visningsnavn.length > 0);

    setAllProfiles(rows);
    setLoadingProfiles(false);

    if (error) console.warn("profiles load error:", error.message);
  })();
}, []);

  /* --- Load players (event_players) --- */
  useEffect(() => {
    if (!eventId) return;
    void loadPlayers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, eloMap]);

  async function loadPlayers() {
    setLoadingPlayers(true);
    try {
      const { data: ep } = await supabase
        .from("event_players")
        .select("user_id, visningsnavn")
        .eq("event_id", eventId)
        .eq("status", "registered");

      const eloed: EventPlayer[] = (ep ?? []).map((x: any) => {
        const vn = (x.visningsnavn || "").trim();
        return { user_id: x.user_id, visningsnavn: x.visningsnavn, elo: vn ? eloMap[vn] ?? 1000 : 1000 };
      });

      const seeded = sortByElo(eloed) as EventPlayer[];
      setPlayers(seeded);
      setOrderIds(seeded.map((p) => p.user_id));
    } finally {
      setLoadingPlayers(false);
    }
  }

  /* --- DB scorer/sæt ved event skift --- */
  useEffect(() => {
    if (!eventId) return;
    setCourtsOrder([]);
    setMatchTimes({});
    setScores({});
    setRoundsPerCourt({});
    setGroupOrder([]);
    void loadEventResultsToState(eventId, setScores, setRoundsPerCourt);
  }, [eventId]);

  /* --- hjælpefindere --- */
  const findVisningsnavn = useCallback(
    (uid: string) => allProfiles.find((p) => p.id === uid)?.visningsnavn ?? null,
    [allProfiles]
  );

  /* --- spillere add/remove/swap (respekter locked) --- */
  async function addPlayer(uid: string, nameFromList?: string | null) {
    if (!eventId) return;
    if (locked) {
      alert("Programmet er offentliggjort – spillere kan ikke ændres.");
      return;
    }
    const visningsnavn = (nameFromList ?? findVisningsnavn(uid) ?? "").trim();
    if (!visningsnavn) {
      alert("Kunne ikke finde visningsnavn.");
      return;
    }
    const eventPlayersTbl = supabase.from("event_players") as any;
    const { error } = await eventPlayersTbl
      .upsert([{ event_id: eventId, user_id: uid, visningsnavn, status: "registered" }], {
        onConflict: "event_id,user_id",
      })
      .select();

    if (error) {
      alert(error.message);
      return;
    }
    setSearch("");
    await loadPlayers();
  }

  async function removePlayer(uid: string) {
    if (!eventId) return;
    if (locked) {
      alert("Programmet er offentliggjort – spillere kan ikke ændres.");
      return;
    }
    if (!confirm("Fjern spiller fra event?")) return;
    const { error } = await supabase.from("event_players").delete().eq("event_id", eventId).eq("user_id", uid);
    if (error) alert(error.message);
    else await loadPlayers();
  }

  async function replacePlayerAt(index: number, np: Profile & { elo?: number }) {
    if (!eventId) return;
    if (locked) {
      alert("Programmet er offentliggjort – spillere kan ikke ændres.");
      return;
    }
    const cur = orderIds[index];
    if (!cur) return;
    if (np.id === cur) {
      setSwapIndex(null);
      setSearch("");
      return;
    }
    if (orderIds.includes(np.id)) {
      alert("Spilleren er allerede i eventet.");
      return;
    }
    const del = await supabase.from("event_players").delete().eq("event_id", eventId).eq("user_id", cur);
    if (del.error) {
      alert(del.error.message);
      return;
    }
    const vn = (np.visningsnavn || "").trim();
    const eventPlayersTbl = supabase.from("event_players") as any;
    const ins = await eventPlayersTbl.upsert(
      [{ event_id: eventId, user_id: np.id, visningsnavn: vn, status: "registered" }],
      { onConflict: "event_id,user_id" }
    );

    if (ins.error) {
      alert(ins.error.message);
      return;
    }
    setOrderIds((prev) => {
      const next = [...prev];
      next[index] = np.id;
      return next;
    });
    setPlayers((prev) => {
      const map = new Map(prev.map((p) => [p.user_id, p]));
      map.delete(cur);
      map.set(np.id, {
        user_id: np.id,
        visningsnavn: np.visningsnavn,
        elo: ((np.visningsnavn || "").trim() && eloMap[(np.visningsnavn || "").trim()]) ?? 1000,
      } as any);

      return Array.from(map.values());
    });
    setSwapIndex(null);
    setSearch("");
  }

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [] as Array<Profile & { elo?: number }>;
    const already = new Set(orderIds);
    return (allProfiles || [])
      .filter((p) => (p.visningsnavn || "").toLowerCase().includes(q) && !already.has(p.id))
      .slice(0, 50)
      .map((p) => ({ ...p, elo: eloMap[(p.visningsnavn || "").trim()] ?? 1000 }));
  }, [search, allProfiles, orderIds, eloMap]);

  function movePlayerUp(uid: string) {
    if (locked) {
      alert("Programmet er offentliggjort – spillere kan ikke ændres.");
      return;
    }
    setOrderIds((prev) => {
      const i = prev.indexOf(uid);
      if (i <= 0) return prev;
      const copy = [...prev];
      [copy[i - 1], copy[i]] = [copy[i], copy[i - 1]];
      return copy;
    });
  }

  const orderedPlayers: EventPlayer[] = useMemo(() => {
    const map = new Map(players.map((p) => [p.user_id, p]));
    return orderIds.map((id) => map.get(id)!).filter(Boolean);
  }, [players, orderIds]);

  const groups = useMemo(() => chunk4(orderedPlayers), [orderedPlayers]);

  /* --- init courts/rounds/groupOrder --- */
  useEffect(() => {
    if (!event) return;

    setCourtsOrder((prev) => {
      const need = groups.length;
      if (isTorsdag(event.name)) {
        const next: (string | number)[] = [];
        for (let i = 0; i < need; i++) next.push(thursdayCourts[i % thursdayCourts.length]);
        return next;
      }
      const pattern = courtOrderFor(event.location, need);
      const next: (string | number)[] = new Array(need);
      for (let i = 0; i < need; i++) {
        const had = prev?.[i];
        next[i] = had != null && had !== "" ? had : pattern[i];
      }
      return next;
    });

    setRoundsPerCourt((prev) => {
      const n = { ...prev };
      for (let gi = 0; gi < groups.length; gi++) if (!n[gi] || n[gi] < 1) n[gi] = 3;
      Object.keys(n)
        .map(Number)
        .forEach((gi) => {
          if (gi >= groups.length) delete n[gi];
        });
      return n;
    });

    setGroupOrder((prev) => {
      const base = prev.length ? prev.slice(0, groups.length) : Array.from({ length: groups.length }, (_, i) => i);
      for (let i = base.length; i < groups.length; i++) base[i] = i;
      return base;
    });
  }, [event, groups.length]);

  /* --------- basePlan + display-plan (Gilleleje) --------- */
  const basePlan = useMemo(
    () =>
      groupOrder.map((gIndex, pos) => ({
        gi: pos,
        court: courtsOrder[pos] ?? pos + 1,
        players: groups[gIndex] ?? [],
      })),
    [groups, courtsOrder, groupOrder]
  );

  const plan = useMemo(() => {
    if (!event || event.location !== "Gilleleje") return basePlan;
    const displayOrder = ["1", "2", "3", "5", "6"];
    const perCycle = displayOrder.length;
    const orderIdx = (c: string | number) => {
      const i = displayOrder.indexOf(String(c));
      return i === -1 ? 999 : i;
    };
    const out: typeof basePlan = [];
    for (let lo = 0; lo < basePlan.length; lo += perCycle) {
      const hi = Math.min(lo + perCycle, basePlan.length);
      const slice = basePlan.slice(lo, hi).slice();
      slice.sort((a, b) => orderIdx(a.court) - orderIdx(b.court));
      out.push(...slice);
    }
    return out;
  }, [basePlan, event]);

  /* --- default tider --- */
  useEffect(() => {
    if (!event) return;
    setMatchTimes((prev) => {
      const next = { ...prev };
      const tor = isTorsdag(event.name);
      for (let gi = 0; gi < basePlan.length; gi++) {
        if (!next[gi])
          next[gi] = tor
            ? thursdayTime(gi)
            : {
                start: (event.start_time || "17:00").slice(0, 5),
                end: (event.end_time || addMinutes((event.start_time || "17:00").slice(0, 5), 100)).slice(0, 5),
              };
      }
      Object.keys(next)
        .map(Number)
        .forEach((gi) => {
          if (gi >= basePlan.length) delete next[gi];
        });
      return next;
    });
  }, [event, basePlan.length]);

  /* --- load court/time meta fra DB (seneste pr. group_index) --- */
  useEffect(() => {
    if (!event?.id || basePlan.length === 0) return;
    (async () => {
      const { data, error } = await supabase
        .from("event_result")
        .select("group_index, court_label, start_time, end_time, updated_at")
        .eq("event_id", event.id)
        .order("updated_at", { ascending: false });

      if (error || !data?.length) return;

      const seen = new Set<number>();
      const courtByGroup: Record<number, string | number> = {};
      const timeByGroup: Record<number, { start: string; end: string }> = {};

      for (const r of data as EventResultMeta[]) {
        const gi = Number(r.group_index);
        if (!Number.isFinite(gi) || seen.has(gi)) continue;
        seen.add(gi);

        if (r.court_label) courtByGroup[gi] = r.court_label;

        const s = r.start_time ? r.start_time.slice(0, 5) : undefined;
        const e = r.end_time ? r.end_time.slice(0, 5) : undefined;
        if (s || e) {
          const prev = matchTimes[gi] ?? { start: "", end: "" };
          timeByGroup[gi] = { start: s ?? prev.start, end: e ?? prev.end };
        }
      }

      if (Object.keys(courtByGroup).length) {
        setCourtsOrder((prev) => {
          const next = [...prev];
          for (let gi = 0; gi < basePlan.length; gi++) {
            if (courtByGroup[gi] != null) next[gi] = courtByGroup[gi];
          }
          return next;
        });
      }

      if (Object.keys(timeByGroup).length) {
        setMatchTimes((prev) => {
          const next = { ...prev };
          for (let gi = 0; gi < basePlan.length; gi++) {
            if (timeByGroup[gi]) next[gi] = timeByGroup[gi];
          }
          return next;
        });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.id, basePlan.length]);

  /* --- UI helpers --- */
  function setCourtLabel(gi: number, value: string) {
    if (!event?.id) return;
    setCourtsOrder((prev) => {
      const next = [...prev];
      next[gi] = (value || "").trim() || gi + 1;
      return next;
    });
    const sets = roundsPerCourt[gi] ?? 3;
    for (let si = 0; si < sets; si++)
      void upsertEventResultRow({
        eventId: event.id,
        gi,
        si,
        courtLabel: value,
        start: matchTimes[gi]?.start,
        end: matchTimes[gi]?.end,
      });
  }

  function moveCourtUp(gi: number) {
    if (!event?.id || gi <= 0) return;

    const nextGroup = (() => {
      const n = [...groupOrder];
      [n[gi - 1], n[gi]] = [n[gi], n[gi - 1]];
      return n;
    })();
    const nextCourts = (() => {
      const n = [...courtsOrder];
      [n[gi - 1], n[gi]] = [n[gi], n[gi - 1]];
      return n;
    })();
    const nextRounds = (() => {
      const n = { ...roundsPerCourt };
      [n[gi - 1], n[gi]] = [n[gi], n[gi - 1]];
      return n;
    })();
    const nextTimes = (() => {
      const n = { ...matchTimes };
      [n[gi - 1], n[gi]] = [n[gi], n[gi - 1]];
      return n;
    })();

    setGroupOrder(nextGroup);
    setCourtsOrder(nextCourts);
    setRoundsPerCourt(nextRounds);
    setMatchTimes(nextTimes);

    setScores((prev) => {
      const out: typeof prev = {};
      Object.entries(prev).forEach(([k, v]) => {
        const [g, s] = k.split("-").map(Number);
        let ng = g;
        if (g === gi) ng = gi - 1;
        else if (g === gi - 1) ng = gi;
        out[`${ng}-${s}`] = v;
      });
      return out;
    });

    void persistGroupMeta(event.id, gi - 1, nextRounds, nextCourts, nextTimes);
    void persistGroupMeta(event.id, gi, nextRounds, nextCourts, nextTimes);
  }

  function addRoundForMatch(gi: number) {
    setRoundsPerCourt((prev) => {
      const next = (prev[gi] ?? 3) + 1;
      void upsertEventResultRow({
        eventId: event?.id ?? "",
        gi,
        si: next - 1,
        scoreA: 0,
        scoreB: 0,
      });
      return { ...prev, [gi]: next };
    });
  }

  function setScore(gi: number, si: number, side: "a" | "b", raw: string) {
    const n = (() => {
      const t = raw.replace(/\D/g, "");
      return t === "" ? 0 : Math.min(7, Math.max(0, parseInt(t, 10)));
    })();
    const key = `${gi}-${si}`;

    setScores((s) => {
      const prev = s[key] ?? { a: 0, b: 0 };
      const next = { ...prev, [side]: n };

      const rot = ROTATIONS[si % ROTATIONS.length];
      const g = basePlan[gi] || plan.find((x) => x.gi === gi);
      void upsertEventResultRow({
        eventId: event?.id ?? "",
        gi,
        si,
        courtLabel: courtsOrder[gi],
        start: matchTimes[gi]?.start,
        end: matchTimes[gi]?.end,
        a1: g?.players[rot[0][0]]?.visningsnavn || "",
        a2: g?.players[rot[0][1]]?.visningsnavn || "",
        b1: g?.players[rot[1][0]]?.visningsnavn || "",
        b2: g?.players[rot[1][1]]?.visningsnavn || "",
        scoreA: next.a,
        scoreB: next.b,
        tiebreak: false,
      });
      return { ...s, [key]: next };
    });
  }

  function resetEmptyExtraSets() {
    setRoundsPerCourt((prev) => {
      const next = { ...prev };
      for (let gi = 0; gi < basePlan.length; gi++) {
        let r = next[gi] ?? 3;
        while (r > 3) {
          const key = `${gi}-${r - 1}`;
          const sc = scores[key];
          const empty = !sc || ((sc.a ?? 0) === 0 && (sc.b ?? 0) === 0);
          if (empty) r--;
          else break;
        }
        next[gi] = r < 1 ? 1 : r;
      }
      return next;
    });
  }

  const eventOptions = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const up = (eventsList || [])
      .filter((e) => e.date >= today)
      .sort((a, b) => (a.date === b.date ? (a.start_time! < b.start_time! ? -1 : 1) : a.date < b.date ? -1 : 1));
    const past = (eventsList || [])
      .filter((e) => e.date < today)
      .sort((a, b) => (a.date === b.date ? (a.start_time! > b.start_time! ? -1 : 1) : a.date > b.date ? -1 : 1));
    return [...up, ...past];
  }, [eventsList]);

  const courtSuggestions = useMemo(
    () => (event?.location === "Gilleleje" ? ["1", "2", "3", "5", "6"] : ["CC", "1", "2", "3", "4", "5", "6"]),
    [event?.location]
  );

  const dayDiffSorted = useMemo(() => {
    const sets: any[] = [];
    basePlan.forEach((g, gi) => {
      const r = roundsPerCourt[gi] ?? 3;
      for (let si = 0; si < r; si++) {
        const rot = ROTATIONS[si % ROTATIONS.length];
        const a1 = g.players[rot[0][0]]?.visningsnavn || "?";
        const a2 = g.players[rot[0][1]]?.visningsnavn || "?";
        const b1 = g.players[rot[1][0]]?.visningsnavn || "?";
        const b2 = g.players[rot[1][1]]?.visningsnavn || "?";
        const sc = scores[`${gi}-${si}`] ?? { a: 0, b: 0 };
        const done = sc.a !== 0 || sc.b !== 0 ? erFærdigtSæt(sc.a, sc.b) : false;
        sets.push({
          id: 1_000_000 + gi * 100 + si,
          kampid: 900_000 + gi,
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
  }, [basePlan, roundsPerCourt, scores, eloMap, event?.date]);

  const header = useMemo(() => {
    if (!event) return { emojiLeft: "🎾", emojiRight: "🎾" };
    if (event.closed_group) return { emojiLeft: "🍺", emojiRight: "🍺" };
    if (event.only_women) return { emojiLeft: "👯‍♀️", emojiRight: "👯‍♀️" };
    return { emojiLeft: "🎾", emojiRight: "🎾" };
  }, [event]);

  /* --- Toggle “Programmet offentliggøres” -> status planned/programed --- */
  /* --- Toggle “Programmet offentliggøres” -> forudfyld program -> sæt status --- */
async function setProgramPublished(next: boolean) {
  if (!event) return;

  try {
    if (next) {
      // Publicering kræver at der faktisk er et program
      if (!plan.length) {
        alert("Ingen kampe at publicere. Tilføj spillere først.");
        return;
      }

      // 1) Læg hele programmet i event_result (score=0–0) inden status flips
      await ensureProgramPersistedToEventResult({
        eventId: event.id,
        plan,
        roundsPerCourt,
        courtsOrder,
        matchTimes,
      });
    }

    // 2) Flip status (published/planned)
    const { data, error } = await (supabase.from("events") as any)
      .update({ status: next ? "published" : "planned" })
      .eq("id", event.id)
      .select("*")
      .maybeSingle();

    if (error) throw error;
    if (data) setEvent(data);

    if (next) {
      alert("Program publiceret og gemt i event_result ✔️");
    } else {
      alert("Event sat tilbage til planned.");
    }
  } catch (e:any) {
    console.error(e);
    alert("Kunne ikke publicere programmet: " + (e?.message ?? e));
  }
}



  /* --- Submit til newresults --- */
  async function submitResults() {
    if (!event) return;

    const { data: auth } = await supabase.auth.getUser();
    const reporter =
      (auth?.user?.user_metadata as any)?.visningsnavn ??
      auth?.user?.email ??
      "EventAdmin";

    const startKampId = await getNextKampId();

    const giHasData: boolean[] = [];
    basePlan.forEach((_, gi) => {
      const r = roundsPerCourt[gi] ?? 3;
      for (let si = 0; si < r; si++) {
        const sc = scores[`${gi}-${si}`] ?? { a: 0, b: 0 };
        if (sc.a !== 0 || sc.b !== 0) {
          giHasData[gi] = true;
          break;
        }
      }
    });

    let nextId = startKampId;
    const kampidByGi: Record<number, number> = {};
    basePlan.forEach((_, gi) => {
      if (giHasData[gi]) kampidByGi[gi] = nextId++;
    });

    const rows: NewResultInsert[] = [];
    basePlan.forEach((g, gi) => {
      const r = roundsPerCourt[gi] ?? 3;
      for (let si = 0; si < r; si++) {
        const rot = ROTATIONS[si % ROTATIONS.length];
        const a1 = g.players[rot[0][0]]?.visningsnavn || "";
        const a2 = g.players[rot[0][1]]?.visningsnavn || "";
        const b1 = g.players[rot[1][0]]?.visningsnavn || "";
        const b2 = g.players[rot[1][1]]?.visningsnavn || "";
        const sc = scores[`${gi}-${si}`] ?? { a: 0, b: 0 };

        if (sc.a === 0 && sc.b === 0) continue;

        rows.push({
          date: event.date,
          finish: erFærdigtSæt(sc.a, sc.b),
          tiebreak: false,
          event: true,
          kampid: kampidByGi[gi],
          holdA1: a1,
          holdA2: a2,
          holdB1: b1,
          holdB2: b2,
          scoreA: sc.a,
          scoreB: sc.b,
          indberettet_af: reporter,
        });
      }
    });

    if (!rows.length) {
      alert("Ingen sæt at indsende (alle står 0–0).");
      return;
    }

    const newresultsTbl = supabase.from("newresults") as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await newresultsTbl.insert(rows as any[]);
    if (error) {
      alert("Kunne ikke indsende: " + error.message);
      return;
    }

    alert(`Indsendt ${rows.length} sæt ✔️ (første kampid i batch: ${startKampId})`);
  }

  if (!event) return <div className="p-4">Indlæser…</div>;

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
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-pink-600">
          {header.emojiLeft} {event.name} {header.emojiRight} {locked && <span className="ml-2 text-xs align-middle px-2 py-0.5 rounded-full bg-pink-600 text-white">🔒 Offentliggjort</span>}
        </h1>
        <div className="text-xs opacity-70 mt-1">
          {event.date} · {fmtTime(event.start_time)}–{fmtTime(event.end_time)} · {event.location}
        </div>
      </div>

      {/* Top controls */}
      <div className="flex flex-wrap items-center justify-center gap-2 mb-4">
        <label className="text-sm">
          <span className="opacity-80 mr-2">Skift event</span>
          <select
            className="border rounded px-2 py-1 text-sm bg-white dark:bg-zinc-900 border-pink-400/70 dark:border-pink-800/70"
            value={event.id}
            onChange={(e) => router.push(`/event/${e.target.value}`)}
          >
            {eventOptions.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.date} · {fmtTime(ev.start_time)} – {ev.location} · {ev.name}
              </option>
            ))}
          </select>
        </label>

        {/* 🔒 Programmet offentliggøres toggle */}
        <button
  type="button"
  onClick={() => setShowEdit(true)}
  className="px-3 py-1 rounded-md border text-sm bg-pink-50 border-pink-300 text-pink-800 hover:bg-pink-100 dark:bg-pink-900/20 dark:text-pink-200 dark:border-pink-700"
>
  Redigér
</button>

<label className="text-sm flex items-center gap-2 px-2 py-1 rounded-md border bg-white dark:bg-zinc-900 border-pink-300 dark:border-pink-700">
  <input
    type="checkbox"
    checked={locked}
    onChange={(e) => void setProgramPublished(e.target.checked)}
  />
  <span>Programmet offentliggøres</span>
</label>


      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 sm:gap-4">
        {/* Venstre */}
        <section className="md:col-span-3 rounded-xl p-3 bg-pink-50/70 dark:bg-pink-900/10 border border-pink-400/80 dark:border-pink-800">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold text-pink-900 dark:text-pink-200">Spillere ({orderedPlayers.length})</h2>
            <button
              type="button"
              className="text-xs underline text-pink-700 dark:text-pink-300"
              onClick={() => loadPlayers()}
            >
              Opdater
            </button>
          </div>

          <div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={locked ? "Programmet er låst" : "Søg (visningsnavn)…"}
              disabled={locked}
              className={`w-full border rounded px-2 py-1 text-sm bg-white/90 dark:bg-zinc-900 border-pink-400/70 dark:border-pink-800/70 ${locked ? "opacity-60 cursor-not-allowed" : ""}`}
            />
            {!!search && !locked && (
              <div className="mt-1 max-h-56 overflow-auto rounded border bg-white dark:bg-zinc-900 border-pink-300 dark:border-pink-800">
                {loadingProfiles && <div className="p-2 text-xs opacity-70">Indlæser…</div>}
                {!loadingProfiles &&
                  searchResults.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => addPlayer(p.id, p.visningsnavn)}
                      className="w-full text-left flex items-center justify-between px-2 py-1 text-sm hover:bg-pink-100/70 dark:hover:bg-pink-900/30"
                      title="Tilføj spiller"
                    >
                      <div className="truncate">
                        {p.visningsnavn || "Ukendt"} <span className="opacity-70">· ELO {p.elo}</span>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded border border-pink-300 dark:border-pink-700 text-pink-700 dark:text-pink-300">
                        Tilføj
                      </span>
                    </button>
                  ))}
                {!loadingProfiles && !searchResults.length && (
                  <div className="p-2 text-xs opacity-70">Ingen…</div>
                )}
              </div>
            )}
          </div>

          <div className="mt-3 space-y-2">
            {loadingPlayers ? (
              <div>Indlæser…</div>
            ) : orderedPlayers.length === 0 ? (
              <div className="text-sm opacity-70">Ingen spillere endnu.</div>
            ) : (
              chunk4(orderedPlayers).map((block, bi) => (
                <div
                  key={`block-${bi}`}
                  className="rounded-lg border border-pink-500/80 dark:border-pink-700/80 bg-white/95 dark:bg-zinc-900 shadow-sm"
                >
                  <ul className="px-3 py-2 divide-y divide-pink-100 dark:divide-pink-900/30">
                    {block.map((p, idx) => {
                      const i = bi * 4 + idx;
                      const uid = orderIds[i];
                      return (
                        <li key={uid} className="py-1.5 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">
                              {i + 1}. {p?.visningsnavn || "(ukendt)"}
                            </div>
                            <div className="text-[11px] opacity-70">ELO {p?.elo ?? 1000}</div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => movePlayerUp(uid)}
                              disabled={locked}
                              className={`p-1.5 rounded-md border text-xs hover:bg-pink-50 dark:hover:bg-pink-900/30 border-pink-300 dark:border-pink-700 text-pink-700 dark:text-pink-300 ${locked ? "opacity-50 cursor-not-allowed" : ""}`}
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
                              className={`p-1.5 rounded-md border text-xs hover:bg-blue-50 border-blue-300 text-blue-700 dark:hover:bg-blue-900/30 dark:border-blue-700 dark:text-blue-200 ${locked ? "opacity-50 cursor-not-allowed" : ""}`}
                              title={locked ? "Låst" : "Skift spiller"}
                            >
                              🔁
                            </button>
                            <button
                              type="button"
                              onClick={() => removePlayer(uid)}
                              disabled={locked}
                              className={`p-1.5 rounded-md border text-xs hover:bg-pink-50 dark:hover:bg-pink-900/30 border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 ${locked ? "opacity-50 cursor-not-allowed" : ""}`}
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
        <section className="md:col-span-7 border rounded-xl p-3 bg-white/80 dark:bg-zinc-900/60 border-pink-400 dark:border-pink-800">
          {!plan.length ? (
            <div className="text-sm opacity-70">Tilføj spillere for at generere kampe.</div>
          ) : (
            <CenterMatches
              plan={plan}
              courtsOrder={courtsOrder}
              setCourtLabel={setCourtLabel}
              matchTimes={matchTimes}
              setMatchTimes={setMatchTimes}
              roundsPerCourt={roundsPerCourt}
              addRoundForMatch={addRoundForMatch}
              moveCourtUp={moveCourtUp}
              scores={scores}
              setScore={setScore}
              eloMap={eloMap}
              event={event}
              courtSuggestions={courtSuggestions}
            />
          )}
        </section>

        {/* Højre */}
        <section className="md:col-span-2 border rounded-xl p-3 bg-white/90 dark:bg-zinc-900/60 border-pink-400 dark:border-pink-800 flex flex-col md:sticky md:top-2 h-fit">
          <h2 className="font-semibold mb-2 text-pink-900 dark:text-pink-200">📈 Dagens Elo</h2>
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
          <div className="mt-3">
            <button
              type="button"
              onClick={submitResults}
              className="w-full px-3 py-2 rounded-md bg-pink-600 text-white hover:bg-pink-700"
              title="Indsend alle gyldige sæt til newresults"
            >
              ✅ Indsend resultater
            </button>
          </div>
        </section>
      </div>

      {/* Modals */}
      {showEdit && event && (
        <EditModal
          event={event}
          onClose={() => setShowEdit(false)}
          onSave={async (patch) => {
            const cleanPatch = Object.fromEntries(
              Object.entries(patch).filter(([_, v]) => v !== undefined)
            );

            const eventsTbl = supabase.from("events") as any;
            const { data, error } = await eventsTbl
              .update(cleanPatch)
              .eq("id", event.id)
              .select("*")
              .maybeSingle();

            if (!error && data) setEvent(data);
            setShowEdit(false);
          }}
          onResetEmptySets={resetEmptyExtraSets}
        />
      )}
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
          void replacePlayerAt(swapIndex, p);
          setSwapOpen(false);
        }}
      />
    </div>
  );
}

/* ===================== Midterkolonnen ===================== */
function CenterMatches({
  plan, courtsOrder, setCourtLabel, matchTimes, setMatchTimes, roundsPerCourt, addRoundForMatch, moveCourtUp,
  scores, setScore, eloMap, event, courtSuggestions,
}:{
  plan: Array<{ gi:number; court:string|number; players: EventPlayer[] }>;
  courtsOrder:(string|number)[]; setCourtLabel:(gi:number,value:string)=>void;
  matchTimes:Record<number,{start:string;end:string}>; setMatchTimes:React.Dispatch<React.SetStateAction<Record<number,{start:string;end:string}>>>;
  roundsPerCourt:Record<number,number>; addRoundForMatch:(gi:number)=>void; moveCourtUp:(gi:number)=>void;
  scores:Record<string,{a:number;b:number}>; setScore:(gi:number,si:number,side:"a"|"b",raw:string)=>void;
  eloMap:Record<string,number>; event:EventRow; courtSuggestions:string[];
}) {
  const setKey = (gi:number,si:number)=>`${gi}-${si}`;
  const scoreOf = (s?:{a:number;b:number})=>({a:s?.a??0,b:s?.b??0});

  const ScoreBox = ({ value, onChange, title }:{ value:number; onChange:(val:string)=>void; title:string }) => (
    <input type="text" inputMode="numeric" pattern="[0-7]" maxLength={1} value={String(value)} onFocus={(e)=>e.currentTarget.select()} onChange={(e)=>onChange(e.target.value)}
      className="w-7 border rounded px-0.5 py-0.5 text-center text-sm tabnums bg-white dark:bg-zinc-900 border-pink-300 dark:border-pink-700" title={title}/>
  );

  return (
    <div className="space-y-3">
      {plan.map((g, index)=>{
        const gi=g.gi;
        const kampNr=index+1;
        const runder=roundsPerCourt[gi]??3;
        const mt=matchTimes[gi]??{ start:(event.start_time||"17:00").slice(0,5), end:(event.end_time||"18:30").slice(0,5) };
        const locked = event?.status === "published";

        return (
          <div key={`kamp-${gi}`} className="rounded-lg border dark:border-zinc-800 overflow-hidden">
            {/* Header linje */}
            <div className="px-3 py-2 bg-pink-100/70 dark:bg-pink-900/30 flex flex-wrap items-center gap-2 justify-between">
              <div className="font-semibold text-pink-900 dark:text-pink-200">Kamp #{kampNr}</div>
              <div className="flex items-center gap-2">
                <label className="text-sm flex items-center gap-1">Bane
                  <select className="border rounded px-2 py-1 text-sm bg-white dark:bg-zinc-900 border-pink-300 dark:border-pink-700"
                    value={String(courtsOrder[gi]??"")} onChange={(e)=>setCourtLabel(gi, e.target.value)}>
                    {courtSuggestions.map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
                <label className="text-sm flex items-center gap-1">
                  <input type="time" name="start" value={mt.start}
                    onChange={(e)=>{ const nv=e.target.value; setMatchTimes(p=>({ ...p, [gi]:{ ...mt, start:nv } })); for(let i=0;i<runder;i++) upsertEventResultRow({ eventId:event.id, gi, si:i, courtLabel:courtsOrder[gi], start:nv, end:matchTimes[gi]?.end??mt.end }); }}
                    className="border rounded px-2 py-1 text-sm bg-white dark:bg-zinc-900 border-pink-300 dark:border-pink-700" title="Start" />
                  –
                  <input type="time" name="end" value={mt.end}
                    onChange={(e)=>{ const nv=e.target.value; setMatchTimes(p=>({ ...p, [gi]:{ ...mt, end:nv } })); for(let i=0;i<runder;i++) upsertEventResultRow({ eventId:event.id, gi, si:i, courtLabel:courtsOrder[gi], start:matchTimes[gi]?.start??mt.start, end:nv }); }}
                    className="border rounded px-2 py-1 text-sm bg-white dark:bg-zinc-900 border-pink-300 dark:border-pink-700" title="Slut" />
                </label>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={()=>addRoundForMatch(gi)} className="text-xs px-2 py-1 rounded border bg-white/80 hover:bg-pink-50 border-pink-300 dark:border-pink-700 dark:bg-zinc-900" title="Tilføj sæt">+ Tilføj sæt</button>
                <button type="button" onClick={()=>moveCourtUp(gi)} className="text-xs px-2 py-1 rounded border bg-white/80 hover:bg-pink-50 border-pink-300 dark:border-pink-700 dark:bg-zinc-900" title="Ryk kampen op">⬆️</button>
              </div>
            </div>

            {/* Sætlinjer */}
            <div className="px-3 py-2 space-y-1">
              {Array.from({length:runder}).map((_,si)=>{
                const rot=ROTATIONS[si%ROTATIONS.length];
                const a1=g.players[rot[0][0]];
                const a2=g.players[rot[0][1]];
                const b1=g.players[rot[1][0]];
                const b2=g.players[rot[1][1]];
                const key=setKey(gi,si);
                const sc=scoreOf(scores[key]);

                // Forventningspct for visning
                const prevSets:any[]=[];
                for(let gg=0; gg<=gi; gg++){
                  const rMax=roundsPerCourt[gg]??3;
                  const lastSi=gg===gi?si-1:rMax-1;
                  if(lastSi<0) continue;
                  const players=(plan.find(x=>x.gi===gg)?.players)??[];
                  for(let s=0; s<=lastSi; s++){
                    const r=ROTATIONS[s%ROTATIONS.length];
                    const A1=players[r[0][0]]?.visningsnavn||"?";
                    const A2=players[r[0][1]]?.visningsnavn||"?";
                    const B1=players[r[1][0]]?.visningsnavn||"?";
                    const B2=players[r[1][1]]?.visningsnavn||"?";
                    const SS=scoreOf(scores[setKey(gg,s)]);
                    const done=SS.a!==0||SS.b!==0?erFærdigtSæt(SS.a,SS.b):false;
                    prevSets.push({id:2_000_000+gg*100+s,kampid:800_000+gg,date:event.date??"1970-01-01",holdA1:A1,holdA2:A2,holdB1:B1,holdB2:B2,scoreA:SS.a,scoreB:SS.b,finish:done,event:true,tiebreak:"false"});
                  }
                }
                const { nyEloMap } = beregnEloForKampe(prevSets as any, eloMap);
                const rA1=a1?.visningsnavn?nyEloMap[a1.visningsnavn]??1500:1500, rA2=a2?.visningsnavn?nyEloMap[a2.visningsnavn]??1500:1500;
                const rB1=b1?.visningsnavn?nyEloMap[b1.visningsnavn]??1500:1500, rB2=b2?.visningsnavn?nyEloMap[b2.visningsnavn]??1500:1500;
                const rA=(rA1+rA2)/2, rB=(rB1+rB2)/2, qa=Math.pow(10,rA/400), qb=Math.pow(10,rB/400), pA=qa/(qa+qb), pctA=Math.round(100*pA), pctB=100-pctA, colorA=pctColor(pA), colorB=pctColor(1-pA);

                const nonZero = (sc.a !== 0 || sc.b !== 0);
                const currentSet={ id:3_000_000+gi*100+si, kampid:700_000+gi, date:event.date??"1970-01-01",
                  holdA1:a1?.visningsnavn||"?", holdA2:a2?.visningsnavn||"?", holdB1:b1?.visningsnavn||"?", holdB2:b2?.visningsnavn||"?", scoreA:sc.a, scoreB:sc.b,
                  finish: erFærdigtSæt(sc.a,sc.b), event:true, tiebreak:"false" };
                const { eloChanges:chForThis } = beregnEloForKampe([...prevSets, currentSet] as any, eloMap);

                let plusTxt = "";
                if (nonZero && chForThis?.[currentSet.id]) {
                  const diffs = Object.values(chForThis[currentSet.id]).map((x:any)=> typeof x?.diff==="number" ? x.diff : 0);
                  const maxPos = Math.max(...diffs.filter((d:number)=>d>0));
                  if (Number.isFinite(maxPos)) plusTxt = `+${maxPos.toFixed(1)}`;
                }

                return (
                  <div key={key} className="flex items-center justify-between gap-2 text-sm">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="opacity-70 shrink-0">Sæt {si+1}</span>
                      <div className="flex-1 flex items-center gap-2 min-w-0">
                        <span className="truncate basis-0 grow min-w-0">{a1?.visningsnavn||"?"} &amp; {a2?.visningsnavn||"?"}</span>
                        <span className="shrink-0 font-semibold tabnums" style={{color:colorA}}>{pctA}%</span>
                        <span className="opacity-60 shrink-0">vs</span>
                        <span className="shrink-0 font-semibold tabnums" style={{color:colorB}}>{pctB}%</span>
                        <span className="truncate basis-0 grow min-w-0 text-right">{b1?.visningsnavn||"?"} &amp; {b2?.visningsnavn||"?"}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex items-center gap-1">
                        <ScoreBox value={sc.a} onChange={(val)=>setScore(gi,si,"a",val)} title="Score A (0–7)" />
                        <span className="opacity-60">-</span>
                        <ScoreBox value={sc.b} onChange={(val)=>setScore(gi,si,"b",val)} title="Score B (0–7)" />
                      </div>
                      <span className="text-pink-700 font-semibold tabnums min-w-[36px] text-right">{plusTxt}</span>
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

/* ===== Modal: Redigér event ===== */
function EditModal({ event, onClose, onSave, onResetEmptySets }:{
  event:EventRow; onClose:()=>void; onSave:(patch:Partial<EventRow>)=>void; onResetEmptySets:()=>void;
}) {
  const [draft, setDraft] = useState<Partial<EventRow>>({ ...event });
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-6">
      <div className="w-full sm:max-w-3xl bg-white dark:bg-zinc-900 rounded-t-2xl sm:rounded-2xl shadow-xl border border-pink-300 dark:border-pink-800">
        <div className="p-3 sm:p-4 border-b border-pink-300 dark:border-pink-800 flex items-center justify-between">
          <div className="font-semibold">Redigér event</div><button onClick={onClose} className="text-sm">Luk</button>
        </div>
        <div className="p-3 sm:p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-sm">Navn<input className="mt-1 w-full border rounded px-2 py-1 bg-white dark:bg-zinc-900 border-pink-400/70 dark:border-pink-700" value={draft.name??""} onChange={(e)=>setDraft({...draft,name:e.target.value})}/></label>
          <label className="text-sm">Sted<select className="mt-1 w-full border rounded px-2 py-1 bg-white dark:bg-zinc-900 border-pink-400/70 dark:border-pink-700" value={draft.location??"Helsinge"} onChange={(e)=>setDraft({...draft,location:e.target.value as EventRow["location"]})}><option>Helsinge</option><option>Gilleleje</option></select></label>
          <label className="text-sm">Dato<input type="date" className="mt-1 w-full border rounded px-2 py-1 bg-white dark:bg-zinc-900 border-pink-400/70 dark:border-pink-700" value={draft.date??""} onChange={(e)=>setDraft({...draft,date:e.target.value})}/></label>
          <label className="text-sm">Start<input type="time" className="mt-1 w-full border rounded px-2 py-1 bg-white dark:bg-zinc-900 border-pink-400/70 dark:border-pink-700" value={(draft.start_time??"").slice(0,5)} onChange={(e)=>setDraft({...draft,start_time:e.target.value+":00"})}/></label>
          <label className="text-sm">Slut<input type="time" className="mt-1 w-full border rounded px-2 py-1 bg-white dark:bg-zinc-900 border-pink-400/70 dark:border-pink-700" value={(draft.end_time??"").slice(0,5)} onChange={(e)=>setDraft({...draft,end_time:e.target.value+":00"})}/></label>
          <label className="text-sm">Max spillere<input type="number" min={4} step={2} className="mt-1 w-full border rounded px-2 py-1 bg-white dark:bg-zinc-900 border-pink-400/70 dark:border-pink-700" value={draft.max_players??16} onChange={(e)=>setDraft({...draft,max_players:Number(e.target.value)})}/></label>
          <label className="text-sm">Min ELO<input type="number" className="mt-1 w-full border rounded px-2 py-1 bg-white dark:bg-zinc-900 border-pink-400/70 dark:border-pink-700" value={draft.min_elo??""} onChange={(e)=>setDraft({...draft,min_elo:e.target.value===""?null:Number(e.target.value)})}/></label>
          <label className="text-sm">Max ELO<input type="number" className="mt-1 w-full border rounded px-2 py-1 bg-white dark:bg-zinc-900 border-pink-400/70 dark:border-pink-700" value={draft.max_elo??""} onChange={(e)=>setDraft({...draft,max_elo:e.target.value===""?null:Number(e.target.value)})}/></label>
          <label className="text-sm col-span-full">Fritekst / regler<input className="mt-1 w-full border rounded px-2 py-1 bg-white dark:bg-zinc-900 border-pink-400/70 dark:border-pink-700" value={draft.rules_text??""} onChange={(e)=>setDraft({...draft,rules_text:e.target.value})}/></label>
          <label className="text-sm col-span-full">Tilmeldingslink<input className="mt-1 w-full border rounded px-2 py-1 bg-white dark:bg-zinc-900 border-pink-400/70 dark:border-pink-700" value={draft.signup_url??""} onChange={(e)=>setDraft({...draft,signup_url:e.target.value})}/></label>
          <label className="text-sm flex items-center gap-2 col-span-full"><input type="checkbox" checked={!!draft.is_published} onChange={(e)=>setDraft({...draft,is_published:e.target.checked})}/> Offentliggjort</label>
        </div>
        <div className="p-3 sm:p-4 border-t border-pink-300 dark:border-pink-800 flex items-center justify-between gap-2">
          <button className="px-3 py-1 rounded-md border bg-white hover:bg-pink-50 border-pink-400/70 dark:border-pink-700 dark:bg-zinc-900" onClick={onResetEmptySets}>🧹 Nulstil tomme sæt</button>
          <div className="flex items-center gap-2">
            <button className="px-3 py-1 rounded-md border bg-white hover:bg-zinc-50 dark:hover:bg-zinc-800 border-zinc-300 dark:border-zinc-700" onClick={onClose}>Annullér</button>
            <button className="px-3 py-1 rounded-md bg-pink-600 text-white hover:bg-pink-700" onClick={()=>onSave(draft)}>Gem</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===== Modal: Skift spiller ===== */
function SwapModal({ open, onClose, onPick, searchResults, search, setSearch, loadingProfiles }:{
  open:boolean; onClose:()=>void; onPick:(p:Profile & {elo?:number})=>void; searchResults:Array<Profile & {elo?:number}>; search:string; setSearch:(v:string)=>void; loadingProfiles:boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-6">
      <div className="w-full sm:max-w-lg bg-white dark:bg-zinc-900 rounded-t-2xl sm:rounded-2xl shadow-xl border border-pink-300 dark:border-pink-800">
        <div className="p-3 sm:p-4 border-b border-pink-300 dark:border-pink-800 flex items-center justify-between">
          <div className="font-semibold">Skift spiller</div><button onClick={onClose} className="text-sm">Luk</button>
        </div>
        <div className="p-3 sm:p-4">
          <input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Søg (visningsnavn)…"
            className="w-full border rounded px-2 py-1 text-sm bg-white/90 dark:bg-zinc-900 border-pink-400/70 dark:border-pink-800/70" />
          <div className="mt-2 max-h-72 overflow-auto rounded border bg-white dark:bg-zinc-900 border-pink-300 dark:border-pink-800">
            {loadingProfiles && <div className="p-2 text-xs opacity-70">Indlæser…</div>}
            {!loadingProfiles && searchResults.map(p=>(
              <button key={p.id} type="button" onClick={()=>onPick(p)}
                className="w-full text-left flex items-center justify-between px-2 py-1 text-sm hover:bg-pink-100/70 dark:hover:bg-pink-900/30">
                <div className="truncate">{p.visningsnavn||"Ukendt"} <span className="opacity-70">· ELO {p.elo}</span></div>
                <span className="text-xs px-2 py-0.5 rounded border border-pink-300 dark:border-pink-700 text-pink-700 dark:text-pink-300">Skift</span>
              </button>
            ))}
            {!loadingProfiles && !searchResults.length && <div className="p-2 text-xs opacity-70">Ingen…</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

