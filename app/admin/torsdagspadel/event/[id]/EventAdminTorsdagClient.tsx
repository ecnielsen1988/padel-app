"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { beregnEloForKampe } from "@/lib/beregnElo";

import {
  EventRow,
  Profile,
  EventPlayer,
  Score,
  bentleyGreen,
  fmtTime,
  normName,
  toMinutes,
  toHHMM,
  makeDefaultThursdaySlots,
  grupperAf4,
  ROT,
  erFærdigtSæt,
  persistProgramToEventResult,
  buildAllRows,
  upsertEventResultRow,
  getNextKampId,
  emojiForPluspoint,
} from "./EventAdminHelpers";

import PlayerListColumn from "./PlayerListColumn";
import CenterMatches from "./CenterMatches";
import EloSidebar from "./EloSidebar";
import SlotsModal from "./SlotsModal";
import SwapModal from "./SwapModal";

/** ======================== Types ======================== */
type ScoreMap = Record<string, Score>;
type RoundsMap = Record<number, number>;
type MatchNoMap = Record<number, number>;

type SetInfoMap = Record<
  string,
  {
    pctA: number;
    pctB: number;
    plusTxt: string;
  }
>;

export default function EventAdminTorsdagClient({ eventId }: { eventId: string }) {
  const router = useRouter();

  // ===== STATE =====
  const [event, setEvent] = useState<EventRow | null>(null);
  const [eventsList, setEventsList] = useState<EventRow[]>([]);

  // dagens Elo (bruges både til visning og som start for simulering)
  const [eloMapNow, setEloMapNow] = useState<Record<string, number>>({});

  // alle profiler til søg/tilføj/swap
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);

  // spillerliste venstre kolonne
  const [players, setPlayers] = useState<EventPlayer[]>([]);
  const [orderIds, setOrderIds] = useState<string[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(false); // manuelt hent signups

  // søg/swap
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [search, setSearch] = useState("");
  const [swapOpen, setSwapOpen] = useState(false);
  const [swapIndex, setSwapIndex] = useState<number | null>(null);

  // kampopsætning
  const [matchNoByGroup, setMatchNoByGroup] = useState<MatchNoMap>({});
  const [roundsPerGi, setRoundsPerGi] = useState<RoundsMap>({});
  const [scores, setScores] = useState<ScoreMap>({});
  const [slots, setSlots] = useState<{ court: string; start: string; end: string }[]>([]);
  const [showSlots, setShowSlots] = useState(false);

  // submit
  const [submitting, setSubmitting] = useState(false);

  const locked = event?.status === "published";

  // ============================================================
  // 1) Hent torsdags-events og nuværende event
  // ============================================================
  useEffect(() => {
    if (!eventId) return;
    (async () => {
      const { data: raw } = await supabase
        .from("events")
        .select("*")
        .ilike("name", "%torsdags%");

      // filtrer fx "torsdagstøserne" fra
      const filtered = (raw ?? []).filter((ev: any) => {
        const n = (ev.name || "").toLowerCase();
        return n.includes("torsdags") && !n.includes("tøser") && !n.includes("tøs");
      }) as EventRow[];

      function statusRank(s: EventRow["status"]) {
        if (s === "done" || s === "canceled") return 2; // nederst
        return 1; // planned/published/ongoing øverst
      }

      const torsSorted = [...filtered].sort((a, b) => {
        const ra = statusRank(a.status);
        const rb = statusRank(b.status);
        if (ra !== rb) return ra - rb;
        if (a.date === b.date) {
          return String(a.start_time) < String(b.start_time) ? -1 : 1;
        }
        return a.date < b.date ? -1 : 1;
      });

      setEventsList(torsSorted);

      const { data: ev } = await supabase
        .from("events")
        .select("*")
        .eq("id", eventId)
        .maybeSingle<EventRow>();
      setEvent(ev ?? null);
    })();
  }, [eventId]);

  // ============================================================
  // 2) Hent dagens Elo fra /api/rangliste
  // ============================================================
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/rangliste", { cache: "no-store" });
        const j = await r.json();
        const arr = Array.isArray(j) ? j : j?.data ?? [];
        const map: Record<string, number> = {};
        arr.forEach((row: any) => {
          const vn = (row?.visningsnavn || "").trim();
          if (vn) map[vn] = Math.round(row.elo);
        });
        setEloMapNow(map);
      } catch {
        setEloMapNow({});
      }
    })();
  }, []);

  // ============================================================
  // 3) Hent alle profiler til søg/swap
  // ============================================================
  useEffect(() => {
    (async () => {
      setLoadingProfiles(true);
      const { data } = await supabase
        .from("profiles")
        .select("id,visningsnavn")
        .not("visningsnavn", "is", null);

      setAllProfiles(((data ?? []) as Profile[]).filter((p) => !!p.visningsnavn));
      setLoadingProfiles(false);
    })();
  }, []);

  // ============================================================
  // 4) Hydrér state fra event_result hvis det findes
  // ============================================================
  useEffect(() => {
    if (!event?.id) return;

    (async () => {
      const { data: rows, error } = await supabase
        .from("event_result")
        .select("*")
        .eq("event_id", event.id)
        .order("group_index", { ascending: true })
        .order("set_index", { ascending: true });

      if (error) {
        console.error("event_result load error", error);
        return;
      }
      if (!rows || rows.length === 0) {
        return;
      }

      // groupér pr gruppe
      const byGroup = new Map<number, any[]>();
      for (const r of rows) {
        if (!byGroup.has(r.group_index)) byGroup.set(r.group_index, []);
        byGroup.get(r.group_index)!.push(r);
      }
      const sortedGroups = [...byGroup.keys()].sort((a, b) => a - b);

      // genskab spillere og rækkefølge
      const newPlayersMap = new Map<
        string,
        {
          user_id: string;
          visningsnavn: string | null;
          elo: number;
          tidligste_tid: string | null;
        }
      >();
      const newOrder: string[] = [];

      sortedGroups.forEach((gi) => {
        const setsForGroup = byGroup.get(gi) || [];
        const firstSet = setsForGroup.find((s: any) => s.set_index === 0);
        if (!firstSet) return;

        const groupNames = [firstSet.holdA1, firstSet.holdA2, firstSet.holdB1, firstSet.holdB2].filter(Boolean) as string[];

        groupNames.forEach((navn) => {
          const displayName = (navn || "").trim();
          const uid = `name:${displayName.toLowerCase()}`;
          if (!newPlayersMap.has(uid)) {
            newPlayersMap.set(uid, {
              user_id: uid,
              visningsnavn: displayName,
              // ved hydration bruger vi nutidsElo til visning
              elo: eloMapNow[displayName] ?? 1000,
              tidligste_tid: null,
            });
            newOrder.push(uid);
          }
        });
      });

      // rounds/scorer
      const newRounds: Record<number, number> = {};
      const newScores: Record<string, { a: number; b: number }> = {};

      byGroup.forEach((setsForGroup, gi) => {
        let maxSi = -1;
        setsForGroup.forEach((s: any) => {
          maxSi = Math.max(maxSi, s.set_index);
          newScores[`${gi}-${s.set_index}`] = { a: s.scoreA ?? 0, b: s.scoreB ?? 0 };
        });
        newRounds[gi] = maxSi + 1;
      });

      // slots (bane/tid) fra første sæt
      const newSlots: { court: string; start: string; end: string }[] = [];
      sortedGroups.forEach((gi) => {
        const fs = byGroup.get(gi)?.find((s: any) => s.set_index === 0);
        if (!fs) return;
        newSlots.push({
          court: fs.court_label || "CC",
          start: (fs.start_time || "17:00").slice(0, 5),
          end: (fs.end_time || "18:40").slice(0, 5),
        });
      });

      // kamp rækkefølge (fallback gi+1)
      const newMatchNo: Record<number, number> = {};
      sortedGroups.forEach((gi) => {
        newMatchNo[gi] = gi + 1;
      });

      setPlayers(Array.from(newPlayersMap.values()));
      setOrderIds(newOrder);
      setRoundsPerGi(newRounds);
      setScores(newScores);
      setSlots(newSlots);
      setMatchNoByGroup(newMatchNo);
    })();
  }, [event?.id, eloMapNow]);

  /** ======================== Derived ======================== */
  const orderedPlayers = useMemo(() => {
    const map = new Map(players.map((p) => [p.user_id, p] as const));
    return orderIds.map((id) => map.get(id)).filter(Boolean) as EventPlayer[];
  }, [players, orderIds]);

  const groups = useMemo(() => grupperAf4(orderedPlayers), [orderedPlayers]);

  useEffect(() => {
    const N = groups.length;

    setRoundsPerGi((prev) => {
      const next = { ...prev };
      for (let gi = 0; gi < N; gi++) if (!next[gi]) next[gi] = 3;
      Object.keys(next).forEach((key) => {
        if (parseInt(key, 10) >= N) delete next[key as any];
      });
      return next;
    });

    setMatchNoByGroup((prev) => {
      const next = { ...prev };
      for (let gi = 0; gi < N; gi++) if (!next[gi]) next[gi] = gi + 1;
      Object.keys(next).forEach((key) => {
        if (parseInt(key, 10) >= N) delete next[key as any];
      });
      return next;
    });

    setScores((prev) => {
      const keep: ScoreMap = {};
      for (let gi = 0; gi < N; gi++) {
        Object.keys(prev).forEach((k) => {
          if (k.startsWith(`${gi}-`)) keep[k] = prev[k];
        });
      }
      return keep;
    });

    setSlots((prev) => {
      if (prev.length >= N) return prev.slice(0, N);
      const def = makeDefaultThursdaySlots(N);
      return def.slice(0, N);
    });
  }, [groups.length]);

  const plan = useMemo(() => {
    const withOrder = groups.map((playersInGroup, gi) => ({
      gi,
      matchNo: matchNoByGroup[gi] ?? gi + 1,
      players: playersInGroup,
    }));

    withOrder.sort((a, b) => (a.matchNo === b.matchNo ? a.gi - b.gi : a.matchNo - b.matchNo));

    return withOrder.map((g, idx) => ({
      gi: g.gi,
      players: g.players,
      court: slots[idx]?.court ?? "CC",
      start: slots[idx]?.start ?? "17:00",
      end: slots[idx]?.end ?? "18:40",
    }));
  }, [groups, matchNoByGroup, slots]);

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [] as Array<Profile & { elo?: number }>;

    const already = new Set(orderIds.map((id) => id.replace(/^name:/, "")));

    return allProfiles
      .filter((p) => p.visningsnavn && p.visningsnavn.toLowerCase().includes(q) && !already.has(normName(p.visningsnavn)))
      .slice(0, 50)
      .map((p) => ({ ...p, elo: eloMapNow[(p.visningsnavn || "").trim()] ?? 1000 }));
  }, [search, allProfiles, orderIds, eloMapNow]);

  // Til visning i venstre/højre kolonne
  const displayEloMap = eloMapNow;

  // ============================================================
  // Simulation af aftenen (identisk strategi som “den der virker”)
  // – Start fra dagens Elo, genberegn for hvert sæt ud fra forudgående sæt
  // – Fallback for ukendt Elo = 0 (og *ikke* 1500)
  // – Hvis én af de 4 Elo = 0 → vis 0% / 100% (tydelig fejlindikator)
  // ============================================================
  const { perSetInfoMap, dagensEloDiffs, eloAtStartMapForUI } = useMemo(() => {
    const startMap: Record<string, number> = { ...eloMapNow };

    // Elo ved “dagens start” på UI = dagens Elo (fallback 0)
    const eloAtStartMapForUI: Record<string, number> = {};
    Object.keys(startMap).forEach((n) => (eloAtStartMapForUI[n] = startMap[n]));

    const setKey = (gi: number, si: number) => `${gi}-${si}`;
    const perSetInfoMap: SetInfoMap = {};

    // Helper til at bygge alle forudgående sæt op til et givet sæt
    function buildPrevSets(uptoGi: number, uptoSi: number) {
      const prevSets: any[] = [];
      for (let gi = 0; gi <= uptoGi; gi++) {
        const total = roundsPerGi[gi] ?? 3;
        const lastSi = gi === uptoGi ? uptoSi - 1 : total - 1;
        if (lastSi < 0) continue;

        // find gruppens players i samme plan-orden
        const g = plan.find((x) => x.gi === gi);
        const playersInGroup = g?.players ?? [];

        for (let si = 0; si <= lastSi; si++) {
          const rot = ROT[si % ROT.length];
          const A1 = playersInGroup[rot[0][0]]?.visningsnavn || "?";
          const A2 = playersInGroup[rot[0][1]]?.visningsnavn || "?";
          const B1 = playersInGroup[rot[1][0]]?.visningsnavn || "?";
          const B2 = playersInGroup[rot[1][1]]?.visningsnavn || "?";
          const sc = scores[setKey(gi, si)] ?? { a: 0, b: 0 };
          const done = sc.a !== 0 || sc.b !== 0 ? erFærdigtSæt(sc.a, sc.b) : false;

          prevSets.push({
            id: 2_000_000 + gi * 100 + si,
            kampid: 800_000 + gi,
            date: event?.date ?? "1970-01-01",
            holdA1: A1,
            holdA2: A2,
            holdB1: B1,
            holdB2: B2,
            scoreA: sc.a,
            scoreB: sc.b,
            finish: done,
            event: true,
            tiebreak: "false",
          });

          [A1, A2, B1, B2].forEach((nm) => {
            const k = (nm || "").trim();
            if (!k || k === "?") return;
            if (!(k in eloAtStartMapForUI)) eloAtStartMapForUI[k] = startMap[k] ?? 0;
          });
        }
      }
      return prevSets;
    }

    // Per sæt: beregn pctA/pctB ud fra Elo lige før sættet,
    // og plusTxt ud fra eloChanges hvis sc ≠ 0–0
    plan.forEach((g) => {
      const sets = roundsPerGi[g.gi] ?? 3;

      for (let si = 0; si < sets; si++) {
        const prevSets = buildPrevSets(g.gi, si);
        const { nyEloMap } = beregnEloForKampe(prevSets as any, startMap as any);

        const rot = ROT[si % ROT.length];
        const a1 = g.players[rot[0][0]]?.visningsnavn || "?";
        const a2 = g.players[rot[0][1]]?.visningsnavn || "?";
        const b1 = g.players[rot[1][0]]?.visningsnavn || "?";
        const b2 = g.players[rot[1][1]]?.visningsnavn || "?";

        const rA1 = nyEloMap[a1] ?? 0;
        const rA2 = nyEloMap[a2] ?? 0;
        const rB1 = nyEloMap[b1] ?? 0;
        const rB2 = nyEloMap[b2] ?? 0;

        let pctA = 0;
        let pctB = 100;

        // Hvis alle fire Elo er non-zero → brug klassisk Elo-forventning
        if (rA1 && rA2 && rB1 && rB2) {
          const rA = (rA1 + rA2) / 2;
          const rB = (rB1 + rB2) / 2;
          const qa = Math.pow(10, rA / 400);
          const qb = Math.pow(10, rB / 400);
          const pA = qa / (qa + qb);
          pctA = Math.max(0, Math.min(100, Math.round(100 * pA)));
          pctB = 100 - pctA;
        }
        // ellers: behold 0 / 100 for tydelig fejl

        // plusTxt: kun når dette sæt har sc ≠ 0–0
        const sc = scores[`${g.gi}-${si}`] ?? { a: 0, b: 0 };
        let plusTxt = "";
        if (sc.a !== 0 || sc.b !== 0) {
          const currentSet = {
            id: 3_000_000 + g.gi * 100 + si,
            kampid: 700_000 + g.gi,
            date: event?.date ?? "1970-01-01",
            holdA1: a1,
            holdA2: a2,
            holdB1: b1,
            holdB2: b2,
            scoreA: sc.a,
            scoreB: sc.b,
            finish: erFærdigtSæt(sc.a, sc.b),
            event: true,
            tiebreak: "false",
          };
          const { eloChanges } = beregnEloForKampe([...prevSets, currentSet] as any, startMap as any);
          const ch = eloChanges?.[currentSet.id];
          if (ch) {
            const diffs = Object.values(ch).map((x: any) => (typeof x?.diff === "number" ? x.diff : 0));
            const maxPos = Math.max(...diffs.filter((d: number) => d > 0));
            if (Number.isFinite(maxPos)) plusTxt = `+${maxPos.toFixed(1)}`;
          }
        }

        perSetInfoMap[`${g.gi}-${si}`] = { pctA, pctB, plusTxt };
      }
    });

    // Dagens Elo-diffs: sum af eloChanges for alle sæt med score ≠ 0–0
    const allSets: any[] = [];
    plan.forEach((g) => {
      const sets = roundsPerGi[g.gi] ?? 3;
      for (let si = 0; si < sets; si++) {
        const rot = ROT[si % ROT.length];
        const A1 = g.players[rot[0][0]]?.visningsnavn || "?";
        const A2 = g.players[rot[0][1]]?.visningsnavn || "?";
        const B1 = g.players[rot[1][0]]?.visningsnavn || "?";
        const B2 = g.players[rot[1][1]]?.visningsnavn || "?";
        const sc = scores[`${g.gi}-${si}`] ?? { a: 0, b: 0 };
        if (sc.a === 0 && sc.b === 0) continue;
        allSets.push({
          id: 1_000_000 + g.gi * 100 + si,
          kampid: 900_000 + g.gi,
          date: event?.date ?? "1970-01-01",
          holdA1: A1,
          holdA2: A2,
          holdB1: B1,
          holdB2: B2,
          scoreA: sc.a,
          scoreB: sc.b,
          finish: erFærdigtSæt(sc.a, sc.b),
          event: true,
          tiebreak: "false",
        });
      }
    });

    const totals: Record<string, number> = {};
    if (allSets.length) {
      const { eloChanges } = beregnEloForKampe(allSets as any, startMap as any);
      for (const s of allSets) {
        const ch = eloChanges?.[s.id];
        if (!ch) continue;
        Object.entries(ch).forEach(([navn, v]: any) => {
          const d = typeof v?.diff === "number" ? v.diff : 0;
          totals[navn] = (totals[navn] ?? 0) + d;
        });
      }
    }

    const dagensEloDiffs = Object.entries(totals)
      .map(([navn, diff]) => ({ navn, diff }))
      .sort((a, b) => b.diff - a.diff);

    return { perSetInfoMap, dagensEloDiffs, eloAtStartMapForUI };
  }, [plan, roundsPerGi, scores, eloMapNow, event?.date]);

  /** ======================== Handlers ======================== */
  function movePlayerUp(uid: string) {
    if (locked) return;
    setOrderIds((prev) => {
      const i = prev.indexOf(uid);
      if (i <= 0) return prev;
      const n = [...prev];
      [n[i - 1], n[i]] = [n[i], n[i - 1]];
      return n;
    });
  }

  function removePlayer(uid: string) {
    if (locked) return;
    setOrderIds((prev) => prev.filter((x) => x !== uid));
    setPlayers((prev) => prev.filter((p) => p.user_id !== uid));
  }

  // Helper: re-sorter efter nutidsElo
  function resortByEloNow(nextOrderIds: string[], nextPlayers: EventPlayer[]) {
    const idToName = new Map(nextPlayers.map((p) => [p.user_id, (p.visningsnavn || "").trim()]));
    const scored = nextOrderIds.map((id, idx) => {
      const navn = idToName.get(id) || "";
      const elo = eloMapNow[navn] ?? 0;
      return { id, elo, idx };
    });
    scored.sort((a, b) => (b.elo - a.elo) || (a.idx - b.idx));
    return scored.map((x) => x.id);
  }

  // Tilføj fra søg: brug nutidsElo + autosortering
  function addPlayerFromSearch(p: Profile & { elo?: number }) {
    if (locked) return;
    const vn = (p.visningsnavn || "").trim();
    const fakeId = `name:${vn.toLowerCase()}`;
    if (!vn) return;
    if (orderIds.includes(fakeId)) {
      alert("Spilleren er allerede på listen");
      return;
    }

    setPlayers((prev) => {
      const next = [
        ...prev,
        { user_id: fakeId, visningsnavn: vn, elo: eloMapNow[vn] ?? 0, tidligste_tid: null },
      ];
      setOrderIds(resortByEloNow([...orderIds, fakeId], next));
      return next;
    });
    setSearch("");
  }

  function startSwap(index: number) {
    if (locked) return;
    setSwapIndex(index);
    setSwapOpen(true);
    setSearch("");
  }

  function replacePlayerAt(index: number, prof: Profile & { elo?: number }) {
    if (locked) return;
    const vn = (prof.visningsnavn || "").trim();
    const newId = `name:${vn.toLowerCase()}`;
    if (!vn) return;
    if (orderIds.includes(newId)) {
      alert("Allerede i listen");
      return;
    }

    setPlayers((prev) => {
      const map = new Map(prev.map((pp) => [pp.user_id, pp] as const));
      map.set(newId, {
        user_id: newId,
        visningsnavn: vn,
        elo: eloMapNow[vn] ?? 0,
        tidligste_tid: null,
      });

      const nextPlayers = Array.from(map.values());
      setOrderIds((prevIds) => {
        const ids = [...prevIds];
        ids[index] = newId;
        return resortByEloNow(ids, nextPlayers);
      });

      return nextPlayers;
    });

    setSwapOpen(false);
    setSwapIndex(null);
    setSearch("");
  }

  // Opdater deltagere (nutidsElo til sortering/visning)
  async function fetchSignups() {
    if (!event?.date) return;
    if (locked) return;
    setLoadingPlayers(true);

    const { data, error } = await supabase
      .from("event_signups")
      .select("visningsnavn,tidligste_tid,kan_spille,event_dato")
      .eq("event_dato", event.date);

    if (error) {
      console.error(error);
      alert("Kunne ikke hente tilmeldinger");
      setLoadingPlayers(false);
      return;
    }

    const best = new Map<string, { visningsnavn: string | null; tidligste_tid: string | null }>();

    for (const row of data ?? []) {
      if (!row.visningsnavn || row.kan_spille !== true) continue;
      const key = (row.visningsnavn || "").trim().toLowerCase();
      const prev = best.get(key);
      if (!prev || toMinutes(row.tidligste_tid) < toMinutes(prev.tidligste_tid)) {
        best.set(key, { visningsnavn: row.visningsnavn, tidligste_tid: row.tidligste_tid });
      }
    }

    const list: EventPlayer[] = Array.from(best.values()).map((x) => {
      const vn = (x.visningsnavn || "").trim();
      return {
        user_id: `name:${vn.toLowerCase()}`,
        visningsnavn: vn,
        elo: eloMapNow[vn] ?? 0, // nutidsElo (fallback 0)
        tidligste_tid: toHHMM(x.tidligste_tid),
      };
    });

    list.sort((a, b) => (eloMapNow[b.visningsnavn || ""] ?? 0) - (eloMapNow[a.visningsnavn || ""] ?? 0));

    setPlayers(list);
    setOrderIds(list.map((p) => p.user_id));
    setLoadingPlayers(false);
  }

  function setMatchNo(gi: number, v: number) {
    if (v < 1) v = 1;
    setMatchNoByGroup((prev) => ({ ...prev, [gi]: v }));
  }

  function setScoreHandler(gi: number, si: number, side: "a" | "b", raw: string) {
    const digits = raw.replace(/\D/g, "");
    const val = digits === "" ? 0 : Math.min(7, Math.max(0, parseInt(digits, 10)));
    const key = `${gi}-${si}`;

    setScores((prev) => {
      const nextSet = { ...(prev[key] ?? { a: 0, b: 0 }), [side]: val };
      const nextAll = { ...prev, [key]: nextSet };

      const g = plan.find((x) => x.gi === gi);
      const rot = ROT[si % ROT.length];
      const a1 = g?.players[rot[0][0]]?.visningsnavn || "";
      const a2 = g?.players[rot[0][1]]?.visningsnavn || "";
      const b1 = g?.players[rot[1][0]]?.visningsnavn || "";
      const b2 = g?.players[rot[1][1]]?.visningsnavn || "";

      void upsertEventResultRow({
        eventId: event?.id ?? "",
        gi,
        si,
        courtLabel: g?.court,
        start: g?.start,
        end: g?.end,
        a1,
        a2,
        b1,
        b2,
        scoreA: nextSet.a,
        scoreB: nextSet.b,
        tiebreak: false,
      });

      return nextAll;
    });
  }

  function addRoundForMatch(gi: number) {
    if (locked) return;
    setRoundsPerGi((prev) => {
      const newCount = (prev[gi] ?? 3) + 1;
      void upsertEventResultRow({ eventId: event?.id ?? "", gi, si: newCount - 1, scoreA: 0, scoreB: 0 });
      return { ...prev, [gi]: newCount };
    });
  }

  async function togglePublished(nextChecked: boolean) {
    if (!event) return;
    try {
      if (nextChecked) {
        await persistProgramToEventResult({ eventId: event.id, plan, rounds: roundsPerGi, scores });
      }

      const { data, error } = await (supabase.from("events") as any)
        .update({ status: nextChecked ? "published" : "planned" })
        .eq("id", event.id)
        .select("*")
        .maybeSingle();

      if (error) throw error;
      if (data) setEvent(data);

      alert(nextChecked ? "Program publiceret ✔️" : "Event sat til planned (ikke offentlig)");
    } catch (e: any) {
      alert("Fejl ved publicering: " + (e?.message || e));
    }
  }

  async function handleSubmitResults() {
    if (!event) return;
    try {
      setSubmitting(true);

      const rows = buildAllRows({ eventId: event.id, plan, rounds: roundsPerGi, scores });
      if (rows.length) {
        const { error } = await (supabase.from("event_result") as any).upsert(rows, {
          onConflict: "event_id,group_index,set_index",
        });
        if (error) throw error;
      }

      const { data: auth } = await supabase.auth.getUser();
      const reporter = (auth?.user?.user_metadata as any)?.visningsnavn ?? auth?.user?.email ?? "TorsdagsAdmin";

      let nextKampId = await getNextKampId();
      const kampidByGi: Record<number, number> = {};

      plan.forEach((g) => {
        const cnt = roundsPerGi[g.gi] ?? 3;
        for (let si = 0; si < cnt; si++) {
          const sc = scores[`${g.gi}-${si}`] ?? { a: 0, b: 0 };
          if (sc.a || sc.b) {
            if (!kampidByGi[g.gi]) kampidByGi[g.gi] = nextKampId++;
            break;
          }
        }
      });

      const inserts: any[] = [];
      plan.forEach((g) => {
        const cnt = roundsPerGi[g.gi] ?? 3;
        for (let si = 0; si < cnt; si++) {
          const sc = scores[`${g.gi}-${si}`] ?? { a: 0, b: 0 };
          if (sc.a === 0 && sc.b === 0) continue;
          const rot = ROT[si % ROT.length];
          inserts.push({
            date: event.date,
            finish: erFærdigtSæt(sc.a, sc.b),
            tiebreak: false,
            event: true,
            kampid: kampidByGi[g.gi],
            holdA1: g.players[rot[0][0]]?.visningsnavn || "",
            holdA2: g.players[rot[0][1]]?.visningsnavn || "",
            holdB1: g.players[rot[1][0]]?.visningsnavn || "",
            holdB2: g.players[rot[1][1]]?.visningsnavn || "",
            scoreA: sc.a,
            scoreB: sc.b,
            indberettet_af: reporter,
          });
        }
      });

      if (inserts.length) {
        const { error } = await (supabase.from("newresults") as any).insert(inserts);
        if (error) throw error;
      }

      const { data, error: stErr } = await (supabase.from("events") as any)
        .update({ status: "done" })
        .eq("id", event.id)
        .select("*")
        .maybeSingle();
      if (stErr) throw stErr;
      if (data) setEvent(data);

      alert(`Indsendt ✔️ ${inserts.length} sæt til newresults`);
    } catch (e: any) {
      alert("Fejl ved indsendelse: " + (e?.message || e));
    } finally {
      setSubmitting(false);
    }
  }

  /** ======================== Render ======================== */
  if (!event) return <div className="p-4">Indlæser TorsdagsBold & Bajere…</div>;

  return (
    <div className="mx-auto max-w-[1600px] px-2 sm:px-3 lg:px-4 text-gray-900 dark:text-gray-100">
      {/* HEADER */}
      <header className="mt-1 mb-2 text-center">
        <h1 className={`text-2xl sm:text-3xl font-extrabold tracking-tight ${bentleyGreen.text}`}>
          🍺 {event.name} 🍺{" "}
          {event.status === "published" && (
            <span className="ml-2 text-xs align-middle px-2 py-0.5 rounded-full bg-green-600 text-white">
              🔒 Offentliggjort
            </span>
          )}
          {event.status === "done" && (
            <span className="ml-2 text-xs align-middle px-2 py-0.5 rounded-full bg-green-700 text-white">
              ✅ Afsluttet
            </span>
          )}
        </h1>

        <div className="text-xs opacity-70 mt-1">
          {event.date} · {fmtTime(event.start_time)}–{fmtTime(event.end_time)} · {event.location}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
          {/* Skift event */}
          <label className="text-sm flex items-center gap-2">
            <span className="opacity-80">Skift event</span>
            <select
              className="border rounded px-2 py-1 text-sm bg-white dark:bg-zinc-900 border-green-400/70 dark:border-green-800/70"
              value={event.id}
              onChange={(e) => router.push(`/admin/torsdagspadel/event/${e.target.value}`)}
            >
              {eventsList.map((ev) => (
                <option key={ev.id} value={ev.id}>
                  {ev.date} · {fmtTime(ev.start_time)} – {ev.location} · {ev.name}
                </option>
              ))}
            </select>
          </label>

          {/* Baner/Tider modal */}
          <button
            type="button"
            onClick={() => setShowSlots(true)}
            className="px-3 py-1 rounded-md border text-sm bg-white hover:bg-green-50 dark:bg-zinc-900 dark:border-green-700 border-green-300"
          >
            🗺️ Baner
          </button>

          {/* Publish toggle */}
          <label className="text-sm flex items-center gap-2 px-2 py-1 rounded-md border bg-white dark:bg-zinc-900 border-green-300 dark:border-green-700">
            <input type="checkbox" checked={locked || false} onChange={(e) => void togglePublished(e.target.checked)} />
            <span>Programmet offentliggøres</span>
          </label>

          {/* Submit results */}
          <button
            type="button"
            onClick={handleSubmitResults}
            disabled={submitting || !plan.length}
            className="text-sm px-3 py-1.5 rounded-md border bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
          >
            {submitting ? "Indsender…" : "✅ Indsend & afslut (done)"}
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 sm:gap-4">
        {/* VENSTRE */}
        <PlayerListColumn
          orderedPlayers={orderedPlayers}
          orderIds={orderIds}
          loadingPlayers={loadingPlayers}
          locked={locked || false}
          bentleyGreen={bentleyGreen}
          groups={groups}
          matchNoByGroup={matchNoByGroup}
          setMatchNo={setMatchNo}
          movePlayerUp={movePlayerUp}
          removePlayer={removePlayer}
          startSwap={startSwap}
          search={search}
          setSearch={setSearch}
          searchResults={searchResults}
          loadingProfiles={loadingProfiles}
          addPlayerFromSearch={addPlayerFromSearch}
          onFetchSignups={fetchSignups}
          // Elo som vises ved dagens start + nuværende
          eloAtStartMapForUI={eloAtStartMapForUI}
          displayEloMap={displayEloMap}
        />

        {/* MIDTEN */}
        <CenterMatches
          plan={plan}
          roundsPerGi={roundsPerGi}
          scores={scores}
          setScore={setScoreHandler}
          addRoundForMatch={addRoundForMatch}
          eventDate={event.date}
          locked={locked || false}
          bentleyGreen={bentleyGreen}
          perSetInfoMap={perSetInfoMap}
          ROT={ROT}
        />

        {/* HØJRE */}
        <EloSidebar
          dagensEloDiffs={dagensEloDiffs}
          emojiForPluspoint={emojiForPluspoint}
          bentleyGreen={bentleyGreen}
        />
      </div>

      {/* Modals */}
      {showSlots && (
        <SlotsModal
          slots={slots}
          onClose={() => setShowSlots(false)}
          onSave={(next) => {
            setSlots(next);
            setShowSlots(false);
          }}
        />
      )}

      <SwapModal
        open={swapOpen && !locked}
        onClose={() => {
          setSwapOpen(false);
          setSwapIndex(null);
        }}
        search={search}
        setSearch={setSearch}
        loadingProfiles={loadingProfiles}
        searchResults={searchResults}
        onPick={(p) => {
          if (swapIndex == null) return;
          replacePlayerAt(swapIndex, p);
        }}
      />
    </div>
  );
}
