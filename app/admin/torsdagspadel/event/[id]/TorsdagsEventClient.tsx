"use client";

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { beregnEloForKampe } from "@/lib/beregnElo";
import { buildEventRulesText, parseEventRulesText } from "@/lib/eventConfig";

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

type NewResultInsert = {
  date: string;
  finish: boolean;
  tiebreak: boolean;
  event: boolean;
  kampid: number;
  holdA1: string;
  holdA2: string;
  holdB1: string;
  holdB2: string;
  scoreA: number;
  scoreB: number;
  indberettet_af: string;
};

type SignupRow = {
  visningsnavn: string | null;
  event_dato: string | null; // YYYY-MM-DD
  kan_spille: boolean | null;
  tidligste_tid: string | null; // "HH:MM:SS" eller "HH:MM"
};

type SignupPlayer = {
  visningsnavn: string;
  elo: number;
  tidligste_tid: string;
  profileId?: string;
};

/* ======================== Tema (Bentley Grøn) ======================== */
/* Vi bruger arbitrary Tailwind-farver i hele filen: #0b6b3a */
const GREEN = "#0b6b3a";

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
const THURSDAY_COURT_SUGGESTIONS = ["CC", "1", "2", "3"] as const;
const AVAILABILITY_TIMES = ["17:00", "17:30", "18:40", "20:20"] as const;

function normalizeSignupTime(value?: string | null) {
  return (value || "").slice(0, 5) || "—";
}

function availabilityDot(time: string) {
  if (time === "17:00") return { color: "bg-emerald-500", title: "Kan fra 17:00" };
  if (time === "17:30") return { color: "bg-sky-500", title: "Kan fra 17:30" };
  if (time === "18:40") return { color: "bg-amber-400", title: "Kan fra 18:40" };
  if (time === "20:20") return { color: "bg-rose-500", title: "Kan fra 20:20" };
  return { color: "bg-zinc-400", title: time === "—" ? "Tid mangler" : `Kan fra ${time}` };
}

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

function buildPlannedEventResultRows(params: {
  eventId: string;
  plan: Array<{ gi: number; court: string | number; players: { visningsnavn?: string | null }[] }>;
  roundsPerCourt: Record<number, number>;
  courtsOrder: (string | number)[];
  matchTimes: Record<number, { start: string; end: string }>;
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

async function ensureProgramPersistedToEventResult(params: {
  eventId: string;
  plan: Array<{ gi: number; court: string | number; players: { visningsnavn?: string | null }[] }>;
  roundsPerCourt: Record<number, number>;
  courtsOrder: (string | number)[];
  matchTimes: Record<number, { start: string; end: string }>;
}) {
  const rows = buildPlannedEventResultRows(params);
  if (!rows.length) return;

  const CHUNK = 500;
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

  // updated_by er ikke i payload, men beholdt som evt. fremtidig audit.
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
export default function TorsdagsEventClient({ eventId }: { eventId: string }) {
  const router = useRouter();
  const autoSyncedRef = useRef<string | null>(null);
  const forcedPlayerOrderRef = useRef<string[] | null>(null);

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

  // NYT: tilmeldinger
  const [loadingSignups, setLoadingSignups] = useState(false);
  const [signups, setSignups] = useState<SignupPlayer[]>([]);
  const [fineDebtByName, setFineDebtByName] = useState<Record<string, number>>({});

  const locked = event?.status === "published";

  

  /* --- fetch event + liste --- */
useEffect(() => {
  if (!eventId) return;

  (async () => {
    const { data: ev, error } = await supabase
      .from("events")
      .select("*")
      .eq("id", eventId)
      .maybeSingle<EventRow>();

    if (error) console.warn("events load error:", error.message);
    setEvent(ev ?? null);

    // Hent også listen så "Skift event" dropdown virker
    try {
      const res = await fetch("/api/events?all=1", { cache: "no-store" });
      const json = await res.json();
      setEventsList((json?.data ?? []) as EventRow[]);
    } catch (e) {
      console.warn("events list fetch failed:", e);
      setEventsList([]);
    }
  })();
}, [eventId]);

  const persistEventMeta = useCallback(
    async (metaPatch: {
      playerOrder?: string[];
      matchOrder?: number[];
      availabilityOverrides?: Record<string, string>;
    }) => {
      if (!event?.id) return;

      const parsed = parseEventRulesText(event.rules_text);
      const nextRulesText = buildEventRulesText(parsed.visibleRulesText, {
        ...parsed.meta,
        ...(metaPatch.playerOrder !== undefined ? { playerOrder: metaPatch.playerOrder } : {}),
        ...(metaPatch.matchOrder !== undefined ? { matchOrder: metaPatch.matchOrder } : {}),
        ...(metaPatch.availabilityOverrides !== undefined
          ? { availabilityOverrides: metaPatch.availabilityOverrides }
          : {}),
      });

      const { data, error } = await supabase
        .from("events")
        .update({ rules_text: nextRulesText })
        .eq("id", event.id)
        .select("*")
        .maybeSingle();

      if (error) {
        console.warn("persistEventMeta error:", error.message);
        return;
      }

      if (data) setEvent(data as EventRow);
    },
    [event]
  );


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

  useEffect(() => {
    (async () => {
      setLoadingProfiles(true);
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("id, visningsnavn")
          .order("visningsnavn", { ascending: true });
        if (error) throw error;
        setAllProfiles((data ?? []) as Profile[]);
      } catch (error) {
        console.warn("profiles list load error:", error);
        setAllProfiles([]);
      } finally {
        setLoadingProfiles(false);
      }
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
    // Hent event_players
    const { data: ep, error: epErr } = await supabase
      .from("event_players")
      .select("user_id, visningsnavn")
      .eq("event_id", eventId)
      .eq("status", "registered");

    if (epErr) console.warn("event_players error:", epErr.message);

    const filtered = (ep ?? [])
      .map((x: any) => {
        const vn = (x.visningsnavn || "").trim();
        return {
          user_id: x.user_id,
          visningsnavn: vn,
          elo: vn ? (eloMap[vn] ?? 1000) : 1000,
        };
      });

    const seeded = sortByElo(filtered) as EventPlayer[];
    const parsed = parseEventRulesText(event?.rules_text);
    const savedPlayerOrder = Array.isArray(parsed.meta.playerOrder)
      ? parsed.meta.playerOrder
      : [];

    const forcedPlayerOrder = forcedPlayerOrderRef.current;

    if (forcedPlayerOrder && forcedPlayerOrder.length > 0) {
      const byId = new Map(seeded.map((player) => [player.user_id, player] as const));
      const preferred = forcedPlayerOrder
        .map((id: string) => byId.get(id))
        .filter((player: EventPlayer | undefined): player is EventPlayer => Boolean(player));
      const usedIds = new Set(preferred.map((player) => player.user_id));
      const remainder = seeded.filter((player) => !usedIds.has(player.user_id));
      const nextPlayers = [...preferred, ...remainder];
      setPlayers(nextPlayers);
      setOrderIds(nextPlayers.map((p) => p.user_id));
      forcedPlayerOrderRef.current = null;
    } else if (savedPlayerOrder.length > 0) {
      const byId = new Map(seeded.map((player) => [player.user_id, player] as const));
      const preferred = savedPlayerOrder
        .map((id: string) => byId.get(id))
        .filter((player: EventPlayer | undefined): player is EventPlayer => Boolean(player));
      const usedIds = new Set(preferred.map((player) => player.user_id));
      const remainder = seeded.filter((player) => !usedIds.has(player.user_id));
      const nextPlayers = [...preferred, ...remainder];
      setPlayers(nextPlayers);
      setOrderIds(nextPlayers.map((p) => p.user_id));
    } else {
      setPlayers(seeded);
      setOrderIds(seeded.map((p) => p.user_id));
    }
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
    void persistEventMeta({ playerOrder: [] });
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
    else {
      void persistEventMeta({ playerOrder: [] });
      await loadPlayers();
    }
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
    const nextOrder = orderIds.map((id, i) => (i === index ? np.id : id));
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
    void persistEventMeta({ playerOrder: nextOrder });
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
      void persistEventMeta({ playerOrder: copy });
      return copy;
    });
  }

  function moveMatchToPosition(sourceGroupIndex: number, nextPositionInput: string) {
    const targetPosition = Math.max(1, Number.parseInt(nextPositionInput, 10) || 1) - 1;
    setGroupOrder((prev) => {
      const currentIndex = prev.indexOf(sourceGroupIndex);
      if (currentIndex === -1) return prev;
      const boundedTarget = Math.max(0, Math.min(prev.length - 1, targetPosition));
      if (boundedTarget === currentIndex) return prev;
      const next = [...prev];
      next.splice(currentIndex, 1);
      next.splice(boundedTarget, 0, sourceGroupIndex);
      void persistEventMeta({ matchOrder: next });
      return next;
    });
  }

  const orderedPlayers: EventPlayer[] = useMemo(() => {
    const map = new Map(players.map((p) => [p.user_id, p]));
    return orderIds.map((id) => map.get(id)!).filter(Boolean);
  }, [players, orderIds]);

  const availabilityOverrides = useMemo(() => {
    const parsed = parseEventRulesText(event?.rules_text);
    return parsed.meta.availabilityOverrides ?? {};
  }, [event?.rules_text]);

  const signupTimeByName = useMemo(
    () =>
      Object.fromEntries(
        signups.map((signup) => [
          signup.visningsnavn,
          availabilityOverrides[signup.visningsnavn] ?? signup.tidligste_tid,
        ])
      ),
    [signups, availabilityOverrides]
  );

  async function cycleAvailabilityForPlayer(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    const current = signupTimeByName[trimmed] ?? "17:00";
    const currentIndex = Math.max(0, AVAILABILITY_TIMES.indexOf(current as (typeof AVAILABILITY_TIMES)[number]));
    const next = AVAILABILITY_TIMES[(currentIndex + 1) % AVAILABILITY_TIMES.length];
    await persistEventMeta({
      availabilityOverrides: {
        ...availabilityOverrides,
        [trimmed]: next,
      },
    });
  }

  useEffect(() => {
    const names = orderedPlayers
      .map((player) => (player.visningsnavn || "").trim())
      .filter(Boolean);

    if (names.length === 0) {
      setFineDebtByName({});
      return;
    }

    (async () => {
      const response = await fetch("/api/torsdag/admin/debts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names }),
      });
      const payload = await response.json();

      if (!response.ok) {
        console.warn("torsdag debts load error:", payload?.error ?? "Ukendt fejl");
        setFineDebtByName({});
        return;
      }
      setFineDebtByName((payload?.debts ?? {}) as Record<string, number>);
    })();
  }, [orderedPlayers]);

  const debtorsToday = useMemo(
    () =>
      orderedPlayers
        .map((player) => {
          const name = (player.visningsnavn || "").trim();
          return {
            navn: name,
            amountOre: fineDebtByName[name] ?? 0,
          };
        })
        .filter((player) => player.navn && player.amountOre > 0)
        .sort((a, b) => b.amountOre - a.amountOre || a.navn.localeCompare(b.navn)),
    [orderedPlayers, fineDebtByName]
  );

  const groups = useMemo(() => chunk4(orderedPlayers), [orderedPlayers]);

  /* --- init courts/rounds/groupOrder --- */
  useEffect(() => {
    if (!event) return;

    setCourtsOrder((prev) => {
      const need = groups.length;
      const next: (string | number)[] = new Array(need);
      for (let i = 0; i < need; i++) {
        const had = prev?.[i];
        next[i] = had != null && had !== "" ? had : thursdayCourts[i % thursdayCourts.length];
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

    setGroupOrder(() => {
      const len = groups.length;
      const parsed = parseEventRulesText(event.rules_text);
      const savedMatchOrder = Array.isArray(parsed.meta.matchOrder)
        ? parsed.meta.matchOrder.filter((value: number) => Number.isInteger(value))
        : [];
      const validSavedOrder =
        savedMatchOrder.length === len &&
        new Set(savedMatchOrder).size === len &&
        savedMatchOrder.every((value: number) => value >= 0 && value < len);

      if (validSavedOrder) return savedMatchOrder;

      return Array.from({ length: len }, (_, i) => i);
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

  const plan = basePlan;

  /* --- default tider --- */
  useEffect(() => {
    if (!event) return;
    setMatchTimes((prev) => {
      const next = { ...prev };
      for (let gi = 0; gi < basePlan.length; gi++) {
        if (!next[gi])
          next[gi] = thursdayTime(gi);
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
    void persistEventMeta({ matchOrder: nextGroup });

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

  const courtSuggestions = useMemo(() => [...THURSDAY_COURT_SUGGESTIONS], []);

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

  /* --- Publicer program toggle (og sikr event_result) --- */
  async function setProgramPublished(next: boolean) {
    if (!event) return;

    try {
      if (next) {
        if (!plan.length) {
          alert("Ingen kampe at publicere. Tilføj spillere først.");
          return;
        }
        await ensureProgramPersistedToEventResult({
          eventId: event.id,
          plan,
          roundsPerCourt,
          courtsOrder,
          matchTimes,
        });
      }

      const res = await fetch("/api/event-admin", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: event.id,
          status: next ? "published" : "planned",
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error ?? "Ukendt fejl ved publicering.");
      }

      if (json?.data) {
        setEvent(json.data as EventRow);
      }

      alert(next ? "Program publiceret og gemt i event_result ✔️" : "Event sat tilbage til planned.");
    } catch (e: any) {
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
    const { error } = await newresultsTbl.insert(rows as any[]);
    if (error) {
      alert("Kunne ikke indsende: " + error.message);
      return;
    }

    alert(`Indsendt ${rows.length} sæt ✔️ (første kampid i batch: ${startKampId})`);
  }

  /* --- Hent tilmeldinger (NY) --- */
  async function syncSignupsToEvent(rows: SignupPlayer[]) {
    if (!eventId || locked || rows.length === 0) return;
    const eventPlayersTbl = supabase.from("event_players") as any;

    const signupRows = rows.filter((row) => row.profileId);
    const signupIds = signupRows.map((row) => row.profileId as string);

    const { data: existingPlayers, error: existingPlayersError } = await supabase
      .from("event_players")
      .select("user_id")
      .eq("event_id", eventId)
      .eq("status", "registered");

    if (existingPlayersError) {
      console.warn("existing event players error:", existingPlayersError.message);
      return;
    }

    const existingIds = new Set(((existingPlayers ?? []) as Array<{ user_id?: string | null }>)
      .map((row) => String(row.user_id ?? "").trim())
      .filter(Boolean));

    const payload = signupRows.map((row) => ({
      event_id: eventId,
      user_id: row.profileId,
      visningsnavn: row.visningsnavn,
      status: "registered",
    }));

    if (payload.length > 0) {
      const { error } = await eventPlayersTbl.upsert(payload, {
        onConflict: "event_id,user_id",
      });

      if (error) {
        console.warn("signup sync error:", error.message);
        return;
      }
    }

    const idsToRemove = Array.from(existingIds).filter((id) => !signupIds.includes(id));
    if (idsToRemove.length > 0) {
      const { error: deleteError } = await supabase
        .from("event_players")
        .delete()
        .eq("event_id", eventId)
        .in("user_id", idsToRemove);
      if (deleteError) {
        console.warn("signup sync delete error:", deleteError.message);
        return;
      }
    }

    const sortedSignupIds = rows
      .filter((row) => row.profileId)
      .sort((a, b) => b.elo - a.elo || a.visningsnavn.localeCompare(b.visningsnavn))
      .map((row) => row.profileId as string);

    const remainingIds = orderIds.filter((id) => !sortedSignupIds.includes(id));
    const nextOrder = [...sortedSignupIds, ...remainingIds];
    forcedPlayerOrderRef.current = nextOrder;
    setOrderIds(nextOrder);
    void persistEventMeta({ playerOrder: nextOrder });
    await loadPlayers();
  }

  async function fetchSignups(autoSync = false) {
    if (!event?.date) return;
    setLoadingSignups(true);
    try {
      const { data, error } = await supabase
        .from("event_signups")
        .select("visningsnavn, event_dato, kan_spille, tidligste_tid")
        .eq("event_dato", event.date)
        .eq("kan_spille", true);

      if (error) throw error;

      const rows = (data ?? []) as SignupRow[];

      const mapped = rows
        .map((r) => {
          const vn = (r.visningsnavn || "").trim();
          if (!vn) return null;
          const elo = Math.round(eloMap[vn] ?? 1000);
          const profile = allProfiles.find((p) => (p.visningsnavn || "").trim() === vn);
          const tid = normalizeSignupTime(r.tidligste_tid);
          return { visningsnavn: vn, elo, tidligste_tid: tid, profileId: profile?.id };
        })
        .filter(Boolean) as SignupPlayer[];

      mapped.sort((a, b) => b.elo - a.elo || a.visningsnavn.localeCompare(b.visningsnavn));

      setSignups(mapped);
      if (autoSync) await syncSignupsToEvent(mapped);
    } catch (e: any) {
      console.error(e);
      alert("Kunne ikke hente tilmeldinger: " + (e?.message ?? e));
    } finally {
      setLoadingSignups(false);
    }
  }

  useEffect(() => {
    if (!event?.date || allProfiles.length === 0) return;
    if (autoSyncedRef.current === eventId) return;
    autoSyncedRef.current = eventId;
    void fetchSignups(true);
  }, [event?.date, allProfiles, eventId]);

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
        <h1 className={`text-2xl sm:text-3xl font-extrabold tracking-tight`} style={{ color: GREEN }}>
          {header.emojiLeft} {event.name} {header.emojiRight}{" "}
          {locked && (
            <span
              className="ml-2 text-xs align-middle px-2 py-0.5 rounded-full text-white"
              style={{ backgroundColor: GREEN }}
            >
              🔒 Offentliggjort
            </span>
          )}
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
            className="border rounded px-2 py-1 text-sm bg-white dark:bg-zinc-900"
            style={{ borderColor: GREEN }}
            value={event.id}
            onChange={(e) => router.push(`/admin/torsdagspadel/torsdagsevent/${e.target.value}`)}
          >
            {eventOptions.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.date} · {fmtTime(ev.start_time)} – {ev.location} · {ev.name}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={() => setShowEdit(true)}
          className="px-3 py-1 rounded-md border text-sm"
          style={{ backgroundColor: "rgba(11,107,58,0.08)", borderColor: GREEN, color: GREEN }}
        >
          Redigér
        </button>

        <label
          className="text-sm flex items-center gap-2 px-2 py-1 rounded-md border bg-white dark:bg-zinc-900"
          style={{ borderColor: GREEN }}
        >
          <input type="checkbox" checked={locked} onChange={(e) => void setProgramPublished(e.target.checked)} />
          <span>Programmet offentliggøres</span>
        </label>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 sm:gap-4">
        {/* Venstre */}
        <section
          className="md:col-span-3 rounded-xl p-3 border"
          style={{ backgroundColor: "rgba(11,107,58,0.06)", borderColor: GREEN }}
        >
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold" style={{ color: GREEN }}>
              Spillere ({orderedPlayers.length})
            </h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="text-xs underline"
                style={{ color: GREEN }}
                onClick={() => loadPlayers()}
              >
                Opdater
              </button>
            </div>
          </div>

          {/* Søg / Tilføj manuelt */}
          <div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={locked ? "Programmet er låst" : "Søg (visningsnavn)…"}
              disabled={locked}
              className={`w-full border rounded px-2 py-1 text-sm bg-white/90 dark:bg-zinc-900 ${
                locked ? "opacity-60 cursor-not-allowed" : ""
              }`}
              style={{ borderColor: GREEN }}
            />
            {!!search && !locked && (
              <div
                className="mt-1 max-h-56 overflow-auto rounded border bg-white dark:bg-zinc-900"
                style={{ borderColor: GREEN }}
              >
                {loadingProfiles && <div className="p-2 text-xs opacity-70">Indlæser…</div>}
                {!loadingProfiles &&
                  searchResults.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => addPlayer(p.id, p.visningsnavn)}
                      className="w-full text-left flex items-center justify-between px-2 py-1 text-sm hover:bg-black/5 dark:hover:bg-white/5"
                      title="Tilføj spiller"
                    >
                      <div className="truncate">
                        {p.visningsnavn || "Ukendt"} <span className="opacity-70">· ELO {p.elo}</span>
                      </div>
                      <span
                        className="text-xs px-2 py-0.5 rounded border"
                        style={{ borderColor: GREEN, color: GREEN }}
                      >
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

          {/* NYT: Hent tilmeldinger */}
          <div className="mt-3">
            <button
              type="button"
              onClick={() => void fetchSignups(true)}
              className="w-full px-3 py-2 rounded-md text-white"
              style={{ backgroundColor: GREEN }}
              disabled={!event?.date}
              title="Hent tilmeldinger fra event_signups for denne dato"
            >
              📥 Hent tilmeldinger
            </button>
            {loadingSignups ? <div className="mt-2 text-sm opacity-70">Indlæser tilmeldinger…</div> : null}
          </div>

          {/* Spillere i eventet */}
          <div className="mt-3 space-y-2">
            {loadingPlayers ? (
              <div>Indlæser…</div>
            ) : orderedPlayers.length === 0 ? (
              <div className="text-sm opacity-70">Ingen spillere endnu.</div>
            ) : (
              groups.map((block, bi) => (
                <div
                  key={`block-${bi}`}
                  className="rounded-lg border bg-white/95 dark:bg-zinc-900 shadow-sm"
                  style={{ borderColor: GREEN }}
                >
                  <div
                    className="flex items-center justify-between border-b px-3 py-2"
                    style={{ borderColor: GREEN }}
                  >
                    <div className="font-semibold" style={{ color: GREEN }}>
                      Gruppe {bi + 1}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-500">Kamp nr.</span>
                      <input
                        type="number"
                        min="1"
                        max={plan.length}
                        value={groupOrder.indexOf(bi) + 1}
                        onChange={(event) => moveMatchToPosition(bi, event.target.value)}
                        className="w-14 rounded border bg-white px-2 py-1 text-center text-sm"
                        style={{ borderColor: GREEN }}
                      />
                    </div>
                  </div>
                  <ul className="px-3 py-2 divide-y dark:divide-zinc-800">
                    {block.map((p) => {
                      const uid = p.user_id;
                      const i = orderIds.indexOf(uid);
                      const timeDot = availabilityDot(signupTimeByName[(p?.visningsnavn || "").trim()] ?? "—");
                      return (
                        <li key={uid} className="py-1.5 flex items-center justify-between gap-2">
                          <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_72px_24px] items-center gap-2">
                            <div className="truncate text-sm font-medium">
                              {p?.visningsnavn || ""}
                              {(fineDebtByName[(p?.visningsnavn || "").trim()] ?? 0) > 0 && <span title="Skylder til bødekassen"> 💰</span>}
                            </div>
                            <div className="text-right text-xs font-semibold tabnums text-zinc-600">
                              {Math.round(p?.elo ?? 1000)}
                            </div>
                            <div className="flex justify-center">
                              <button
                                type="button"
                                onClick={() => void cycleAvailabilityForPlayer((p?.visningsnavn || "").trim())}
                                aria-label={`Skift mødetid for ${(p?.visningsnavn || "").trim()}`}
                                className={`inline-block h-2.5 w-2.5 rounded-full ${timeDot.color}`}
                                title={timeDot.title}
                              ></button>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => movePlayerUp(uid)}
                              disabled={locked}
                              className="p-1.5 rounded-md border text-xs"
                              style={{
                                borderColor: GREEN,
                                color: GREEN,
                                opacity: locked ? 0.5 : 1,
                                cursor: locked ? "not-allowed" as any : "pointer",
                              }}
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
                              className="p-1.5 rounded-md border text-xs"
                              style={{
                                borderColor: GREEN,
                                color: GREEN,
                                opacity: locked ? 0.5 : 1,
                                cursor: locked ? "not-allowed" as any : "pointer",
                              }}
                              title={locked ? "Låst" : "Skift spiller"}
                            >
                              🔁
                            </button>
                            <button
                              type="button"
                              onClick={() => removePlayer(uid)}
                              disabled={locked}
                              className="p-1.5 rounded-md border text-xs"
                              style={{
                                borderColor: "#dc2626",
                                color: "#dc2626",
                                opacity: locked ? 0.5 : 1,
                                cursor: locked ? "not-allowed" as any : "pointer",
                              }}
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
        <section
          className="md:col-span-7 border rounded-xl p-3 bg-white/80 dark:bg-zinc-900/60"
          style={{ borderColor: GREEN }}
        >
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
              signupTimeByName={signupTimeByName}
              fineDebtByName={fineDebtByName}
            />
          )}
        </section>

        {/* Højre */}
        <section
          className="md:col-span-2 border rounded-xl p-3 bg-white/90 dark:bg-zinc-900/60 flex flex-col md:sticky md:top-2 h-fit"
          style={{ borderColor: GREEN }}
        >
          <h2 className="font-semibold mb-2" style={{ color: GREEN }}>
            📈 Dagens Elo
          </h2>
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
              className="w-full px-3 py-2 rounded-md text-white hover:opacity-95"
              style={{ backgroundColor: GREEN }}
              title="Indsend alle gyldige sæt til newresults"
            >
              ✅ Indsend resultater
            </button>
          </div>
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <h3 className="font-semibold text-amber-900">💸 Skylder til bødekassen</h3>
            {debtorsToday.length === 0 ? (
              <p className="mt-2 text-sm text-amber-800/80">Ingen af dagens spillere skylder lige nu.</p>
            ) : (
              <div className="mt-2 space-y-1">
                {debtorsToday.map((player) => (
                  <div key={player.navn} className="flex items-center justify-between gap-2 text-sm text-amber-900">
                    <span className="min-w-0 truncate">💰 {player.navn}</span>
                    <span className="shrink-0 font-semibold">{player.amountOre / 100} kr.</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Modals */}
      {showEdit && event && (
        <EditModal
          event={event}
          onClose={() => setShowEdit(false)}
          onSave={async (patch) => {
            const cleanPatch = Object.fromEntries(Object.entries(patch).filter(([_, v]) => v !== undefined));
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
  plan,
  courtsOrder,
  setCourtLabel,
  matchTimes,
  setMatchTimes,
  roundsPerCourt,
  addRoundForMatch,
  moveCourtUp,
  scores,
  setScore,
  eloMap,
  event,
  courtSuggestions,
  signupTimeByName,
  fineDebtByName,
}: {
  plan: Array<{ gi: number; court: string | number; players: EventPlayer[] }>;
  courtsOrder: (string | number)[];
  setCourtLabel: (gi: number, value: string) => void;
  matchTimes: Record<number, { start: string; end: string }>;
  setMatchTimes: React.Dispatch<React.SetStateAction<Record<number, { start: string; end: string }>>>;
  roundsPerCourt: Record<number, number>;
  addRoundForMatch: (gi: number) => void;
  moveCourtUp: (gi: number) => void;
  scores: Record<string, { a: number; b: number }>;
  setScore: (gi: number, si: number, side: "a" | "b", raw: string) => void;
  eloMap: Record<string, number>;
  event: EventRow;
  courtSuggestions: string[];
  signupTimeByName: Record<string, string>;
  fineDebtByName: Record<string, number>;
}) {
  const setKey = (gi: number, si: number) => `${gi}-${si}`;
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
      className="w-9 border rounded px-1 py-0.5 text-center text-sm tabnums bg-white dark:bg-zinc-900"
      style={{ borderColor: GREEN }}
      title={title}
    />
  );

  const playerLabel = (player?: EventPlayer) => {
    const navn = (player?.visningsnavn || "?").trim();
    return (
      <>
        <span className="truncate">{navn}</span>
        {(fineDebtByName[navn] ?? 0) > 0 && <span title="Skylder til bødekassen">💰</span>}
      </>
    );
  };

  return (
    <div className="space-y-3">
      {plan.map((g, index) => {
        const gi = g.gi;
        const kampNr = index + 1;
        const runder = roundsPerCourt[gi] ?? 3;
        const mt =
          matchTimes[gi] ?? {
            start: (event.start_time || "17:00").slice(0, 5),
            end: (event.end_time || "18:30").slice(0, 5),
          };
        const locked = event?.status === "published";

        return (
          <div key={`kamp-${gi}`} className="rounded-lg border dark:border-zinc-800 overflow-hidden" style={{ borderColor: GREEN }}>
            {/* Header linje */}
            <div
              className="px-3 py-2 flex flex-wrap items-center gap-2 justify-between"
              style={{ backgroundColor: "rgba(11,107,58,0.10)" }}
            >
              <div className="font-semibold" style={{ color: GREEN }}>
                Kamp #{kampNr}
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm flex items-center gap-1">
                  Bane
                  <select
                    className="border rounded px-2 py-1 text-sm bg-white dark:bg-zinc-900"
                    style={{ borderColor: GREEN }}
                    value={String(courtsOrder[gi] ?? "")}
                    onChange={(e) => setCourtLabel(gi, e.target.value)}
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
                      setMatchTimes((p) => ({ ...p, [gi]: { ...mt, start: nv } }));
                      for (let i = 0; i < runder; i++)
                        upsertEventResultRow({
                          eventId: event.id,
                          gi,
                          si: i,
                          courtLabel: courtsOrder[gi],
                          start: nv,
                          end: matchTimes[gi]?.end ?? mt.end,
                        });
                    }}
                    className="border rounded px-2 py-1 text-sm bg-white dark:bg-zinc-900"
                    style={{ borderColor: GREEN }}
                    title="Start"
                  />
                  –
                  <input
                    type="time"
                    name="end"
                    value={mt.end}
                    onChange={(e) => {
                      const nv = e.target.value;
                      setMatchTimes((p) => ({ ...p, [gi]: { ...mt, end: nv } }));
                      for (let i = 0; i < runder; i++)
                        upsertEventResultRow({
                          eventId: event.id,
                          gi,
                          si: i,
                          courtLabel: courtsOrder[gi],
                          start: matchTimes[gi]?.start ?? mt.start,
                          end: nv,
                        });
                    }}
                    className="border rounded px-2 py-1 text-sm bg-white dark:bg-zinc-900"
                    style={{ borderColor: GREEN }}
                    title="Slut"
                  />
                </label>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => addRoundForMatch(gi)}
                  className="text-xs px-2 py-1 rounded border bg-white/80 dark:bg-zinc-900"
                  style={{ borderColor: GREEN }}
                  title="Tilføj sæt"
                >
                  + Tilføj sæt
                </button>
                <button
                  type="button"
                  onClick={() => moveCourtUp(gi)}
                  className="text-xs px-2 py-1 rounded border bg-white/80 dark:bg-zinc-900"
                  style={{ borderColor: GREEN }}
                  title="Ryk kampen op"
                >
                  ⬆️
                </button>
              </div>
            </div>

            {/* Sætlinjer */}
            <div className="px-3 py-2 space-y-1">
              {Array.from({ length: runder }).map((_, si) => {
                const rot = ROTATIONS[si % ROTATIONS.length];
                const a1 = g.players[rot[0][0]];
                const a2 = g.players[rot[0][1]];
                const b1 = g.players[rot[1][0]];
                const b2 = g.players[rot[1][1]];
                const key = setKey(gi, si);
                const sc = scoreOf(scores[key]);

                // Forventning
                const prevSets: any[] = [];
                for (let gg = 0; gg <= gi; gg++) {
                  const rMax = roundsPerCourt[gg] ?? 3;
                  const lastSi = gg === gi ? si - 1 : rMax - 1;
                  if (lastSi < 0) continue;
                  const players = (plan.find((x) => x.gi === gg)?.players) ?? [];
                  for (let s = 0; s <= lastSi; s++) {
                    const r = ROTATIONS[s % ROTATIONS.length];
                    const A1 = players[r[0][0]]?.visningsnavn || "?";
                    const A2 = players[r[0][1]]?.visningsnavn || "?";
                    const B1 = players[r[1][0]]?.visningsnavn || "?";
                    const B2 = players[r[1][1]]?.visningsnavn || "?";
                    const SS = scoreOf(scores[setKey(gg, s)]);
                    const done = SS.a !== 0 || SS.b !== 0 ? erFærdigtSæt(SS.a, SS.b) : false;
                    prevSets.push({
                      id: 2_000_000 + gg * 100 + s,
                      kampid: 800_000 + gg,
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
                const rA1 = a1?.visningsnavn ? nyEloMap[a1.visningsnavn] ?? 1500 : 1500,
                  rA2 = a2?.visningsnavn ? nyEloMap[a2.visningsnavn] ?? 1500 : 1500;
                const rB1 = b1?.visningsnavn ? nyEloMap[b1.visningsnavn] ?? 1500 : 1500,
                  rB2 = b2?.visningsnavn ? nyEloMap[b2.visningsnavn] ?? 1500 : 1500;
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
                  id: 3_000_000 + gi * 100 + si,
                  kampid: 700_000 + gi,
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
                        <span className="truncate basis-0 grow min-w-0 inline-flex items-center gap-1">
                          {playerLabel(a1)} <span>&amp;</span> {playerLabel(a2)}
                        </span>
                        <span className="shrink-0 font-semibold tabnums" style={{ color: colorA }}>
                          {pctA}%
                        </span>
                        <span className="opacity-60 shrink-0">vs</span>
                        <span className="shrink-0 font-semibold tabnums" style={{ color: colorB }}>
                          {pctB}%
                        </span>
                        <span className="truncate basis-0 grow min-w-0 text-right inline-flex items-center justify-end gap-1">
                          {playerLabel(b1)} <span>&amp;</span> {playerLabel(b2)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="flex items-center gap-1">
                        <ScoreBox value={sc.a} onChange={(val) => setScore(gi, si, "a", val)} title="Score A (0–7)" />
                        <span className="opacity-60">-</span>
                        <ScoreBox value={sc.b} onChange={(val) => setScore(gi, si, "b", val)} title="Score B (0–7)" />
                      </div>
                      <span className="font-semibold tabnums min-w-[52px] text-right" style={{ color: GREEN }}>
                        {plusTxt}
                      </span>
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
function EditModal({
  event,
  onClose,
  onSave,
  onResetEmptySets,
}: {
  event: EventRow;
  onClose: () => void;
  onSave: (patch: Partial<EventRow>) => void;
  onResetEmptySets: () => void;
}) {
  const [draft, setDraft] = useState<Partial<EventRow>>({ ...event });
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-6">
      <div
        className="w-full sm:max-w-3xl bg-white dark:bg-zinc-900 rounded-t-2xl sm:rounded-2xl shadow-xl border"
        style={{ borderColor: GREEN }}
      >
        <div className="p-3 sm:p-4 border-b flex items-center justify-between" style={{ borderColor: GREEN }}>
          <div className="font-semibold">Redigér event</div>
          <button onClick={onClose} className="text-sm">
            Luk
          </button>
        </div>
        <div className="p-3 sm:p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-sm">
            Navn
            <input
              className="mt-1 w-full border rounded px-2 py-1 bg-white dark:bg-zinc-900"
              style={{ borderColor: GREEN }}
              value={draft.name ?? ""}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
          <label className="text-sm">
            Sted
            <select
              className="mt-1 w-full border rounded px-2 py-1 bg-white dark:bg-zinc-900"
              style={{ borderColor: GREEN }}
              value={draft.location ?? "Helsinge"}
              onChange={(e) => setDraft({ ...draft, location: e.target.value as EventRow["location"] })}
            >
              <option>Helsinge</option>
              <option>Gilleleje</option>
            </select>
          </label>
          <label className="text-sm">
            Dato
            <input
              type="date"
              className="mt-1 w-full border rounded px-2 py-1 bg-white dark:bg-zinc-900"
              style={{ borderColor: GREEN }}
              value={draft.date ?? ""}
              onChange={(e) => setDraft({ ...draft, date: e.target.value })}
            />
          </label>
          <label className="text-sm">
            Start
            <input
              type="time"
              className="mt-1 w-full border rounded px-2 py-1 bg-white dark:bg-zinc-900"
              style={{ borderColor: GREEN }}
              value={(draft.start_time ?? "").slice(0, 5)}
              onChange={(e) => setDraft({ ...draft, start_time: e.target.value + ":00" })}
            />
          </label>
          <label className="text-sm">
            Slut
            <input
              type="time"
              className="mt-1 w-full border rounded px-2 py-1 bg-white dark:bg-zinc-900"
              style={{ borderColor: GREEN }}
              value={(draft.end_time ?? "").slice(0, 5)}
              onChange={(e) => setDraft({ ...draft, end_time: e.target.value + ":00" })}
            />
          </label>
          <label className="text-sm">
            Max spillere
            <input
              type="number"
              min={4}
              step={2}
              className="mt-1 w-full border rounded px-2 py-1 bg-white dark:bg-zinc-900"
              style={{ borderColor: GREEN }}
              value={draft.max_players ?? 16}
              onChange={(e) => setDraft({ ...draft, max_players: Number(e.target.value) })}
            />
          </label>
          <label className="text-sm">
            Min ELO
            <input
              type="number"
              className="mt-1 w-full border rounded px-2 py-1 bg-white dark:bg-zinc-900"
              style={{ borderColor: GREEN }}
              value={draft.min_elo ?? ""}
              onChange={(e) => setDraft({ ...draft, min_elo: e.target.value === "" ? null : Number(e.target.value) })}
            />
          </label>
          <label className="text-sm">
            Max ELO
            <input
              type="number"
              className="mt-1 w-full border rounded px-2 py-1 bg-white dark:bg-zinc-900"
              style={{ borderColor: GREEN }}
              value={draft.max_elo ?? ""}
              onChange={(e) => setDraft({ ...draft, max_elo: e.target.value === "" ? null : Number(e.target.value) })}
            />
          </label>
          <label className="text-sm col-span-full">
            Fritekst / regler
            <input
              className="mt-1 w-full border rounded px-2 py-1 bg-white dark:bg-zinc-900"
              style={{ borderColor: GREEN }}
              value={draft.rules_text ?? ""}
              onChange={(e) => setDraft({ ...draft, rules_text: e.target.value })}
            />
          </label>
          <label className="text-sm col-span-full">
            Tilmeldingslink
            <input
              className="mt-1 w-full border rounded px-2 py-1 bg-white dark:bg-zinc-900"
              style={{ borderColor: GREEN }}
              value={draft.signup_url ?? ""}
              onChange={(e) => setDraft({ ...draft, signup_url: e.target.value })}
            />
          </label>
          <label className="text-sm flex items-center gap-2 col-span-full">
            <input
              type="checkbox"
              checked={!!draft.is_published}
              onChange={(e) => setDraft({ ...draft, is_published: e.target.checked })}
            />
            Offentliggjort
          </label>
        </div>
        <div
          className="p-3 sm:p-4 border-t flex items-center justify-between gap-2"
          style={{ borderColor: GREEN }}
        >
          <button
            className="px-3 py-1 rounded-md border bg-white hover:bg-black/5 dark:hover:bg-white/5"
            style={{ borderColor: GREEN }}
            onClick={onResetEmptySets}
          >
            🧹 Nulstil tomme sæt
          </button>
          <div className="flex items-center gap-2">
            <button
              className="px-3 py-1 rounded-md border bg-white hover:bg-black/5 dark:hover:bg-white/5"
              onClick={onClose}
            >
              Annullér
            </button>
            <button
              className="px-3 py-1 rounded-md text-white hover:opacity-95"
              style={{ backgroundColor: GREEN }}
              onClick={() => onSave(draft)}
            >
              Gem
            </button>
          </div>
        </div>
      </div>
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
      <div
        className="w-full sm:max-w-lg bg-white dark:bg-zinc-900 rounded-t-2xl sm:rounded-2xl shadow-xl border"
        style={{ borderColor: GREEN }}
      >
        <div className="p-3 sm:p-4 border-b flex items-center justify-between" style={{ borderColor: GREEN }}>
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
            className="w-full border rounded px-2 py-1 text-sm bg-white/90 dark:bg-zinc-900"
            style={{ borderColor: GREEN }}
          />
          <div
            className="mt-2 max-h-72 overflow-auto rounded border bg-white dark:bg-zinc-900"
            style={{ borderColor: GREEN }}
          >
            {loadingProfiles && <div className="p-2 text-xs opacity-70">Indlæser…</div>}
            {!loadingProfiles &&
              searchResults.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onPick(p)}
                  className="w-full text-left flex items-center justify-between px-2 py-1 text-sm hover:bg-black/5 dark:hover:bg-white/5"
                >
                  <div className="truncate">
                    {p.visningsnavn || "Ukendt"} <span className="opacity-70">· ELO {p.elo}</span>
                  </div>
                  <span
                    className="text-xs px-2 py-0.5 rounded border"
                    style={{ borderColor: GREEN, color: GREEN }}
                  >
                    Skift
                  </span>
                </button>
              ))}
            {!loadingProfiles && !searchResults.length && (
              <div className="p-2 text-xs opacity-70">Ingen…</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
