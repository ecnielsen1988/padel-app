"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { beregnEloForKampe } from "@/lib/beregnElo";
import {
  buildEventRulesText,
  getEventAdminHref,
  parseEventRulesText,
  type PartnerTeamMeta,
} from "@/lib/eventConfig";
import {
  getEventKampidForGroup,
  getEventKampidRange,
  getEventSubmissionState,
} from "@/lib/eventSubmission";

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
  rules_text: string | null;
  signup_url: string | null;
  status: "planned" | "published" | "ongoing" | "done" | "canceled" | null;
};

type Profile = {
  id: string;
  visningsnavn: string | null;
};

type Score = { a: number; b: number };

type MatchPlan = {
  gi: number;
  court: string;
  teams: [PartnerTeamMeta, PartnerTeamMeta];
};

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

const DEFAULT_COURTS_GILLELEJE = ["2", "1", "3", "6", "5"] as const;
const DISPLAY_COURTS_GILLELEJE = ["1", "2", "3", "5", "6"] as const;
const DEFAULT_COURTS_HELSINGE = ["CC", "1", "2", "3"] as const;

const fmtTime = (t?: string | null) => (t ? t.slice(0, 5) : "");

const erFærdigtSæt = (a: number, b: number) => {
  const max = Math.max(a, b);
  const min = Math.min(a, b);
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

const hhmmToDb = (value?: string) =>
  value ? (value.length === 5 ? `${value}:00` : value) : null;

function scoreKey(gi: number, si: number) {
  return `${gi}-${si}`;
}

function pairId() {
  return `team-${Math.random().toString(36).slice(2, 10)}`;
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name.trim();
}

function formatTeamLabel(team: PartnerTeamMeta) {
  return `${firstName(team.playerNames[0])} & ${firstName(team.playerNames[1])}`;
}

function sortPairByElo(
  pair: Profile[],
  eloMap: Record<string, number>
) {
  return [...pair].sort((a, b) => {
    const aElo = eloMap[(a.visningsnavn ?? "").trim()] ?? 1000;
    const bElo = eloMap[(b.visningsnavn ?? "").trim()] ?? 1000;
    return bElo - aElo;
  });
}

async function loadEventResultsToState(
  eventId: string,
  setScores: React.Dispatch<React.SetStateAction<Record<string, Score>>>,
  setRoundsPerCourt: React.Dispatch<React.SetStateAction<Record<number, number>>>
) {
  const { data, error } = await supabase
    .from("event_result")
    .select("group_index,set_index,scoreA,scoreB")
    .eq("event_id", eventId)
    .order("group_index", { ascending: true })
    .order("set_index", { ascending: true });

  if (error) {
    console.warn("event_result load error:", error.message);
    return;
  }

  const nextScores: Record<string, Score> = {};
  const nextRounds: Record<number, number> = {};

  for (const row of (data as any[]) ?? []) {
    const gi = Number(row.group_index ?? 0);
    const si = Number(row.set_index ?? 0);
    nextScores[scoreKey(gi, si)] = {
      a: Number(row.scoreA ?? 0),
      b: Number(row.scoreB ?? 0),
    };
    nextRounds[gi] = Math.max(nextRounds[gi] ?? 0, si + 1);
  }

  setScores(nextScores);
  setRoundsPerCourt(nextRounds);
}

function averageTeamElo(
  team: PartnerTeamMeta,
  eloMap: Record<string, number>
) {
  const a = eloMap[team.playerNames[0]] ?? 1000;
  const b = eloMap[team.playerNames[1]] ?? 1000;
  return (a + b) / 2;
}

function courtSequenceFor(location: EventRow["location"]) {
  return location === "Gilleleje"
    ? [...DEFAULT_COURTS_GILLELEJE].map(String)
    : [...DEFAULT_COURTS_HELSINGE].map(String);
}

function displayCourtSequenceFor(location: EventRow["location"]) {
  return location === "Gilleleje"
    ? [...DISPLAY_COURTS_GILLELEJE].map(String)
    : [...DEFAULT_COURTS_HELSINGE].map(String);
}

function buildMatchPlan(
  teams: PartnerTeamMeta[],
  eloMap: Record<string, number>,
  location: EventRow["location"]
) {
  const sortedTeams = [...teams].sort(
    (a, b) => averageTeamElo(b, eloMap) - averageTeamElo(a, eloMap)
  );

  const rankedMatches: Array<{
    court: string;
    teams: [PartnerTeamMeta, PartnerTeamMeta];
  }> = [];

  const courtSequence = courtSequenceFor(location);
  for (let i = 0; i + 1 < sortedTeams.length; i += 2) {
    rankedMatches.push({
      court: courtSequence[Math.floor(i / 2)] ?? String(Math.floor(i / 2) + 1),
      teams: [sortedTeams[i], sortedTeams[i + 1]],
    });
  }

  const displayOrder = displayCourtSequenceFor(location);
  return rankedMatches
    .sort(
      (a, b) =>
        displayOrder.indexOf(a.court) - displayOrder.indexOf(b.court)
    )
    .map((match, index) => ({
      gi: index,
      court: match.court,
      teams: match.teams,
    }));
}

function pluspointForMatch(
  match: MatchPlan,
  gi: number,
  si: number,
  scores: Record<string, Score>,
  roundsPerCourt: Record<number, number>,
  matches: MatchPlan[],
  eloMap: Record<string, number>,
  eventDate: string
) {
  const prevSets: any[] = [];

  for (const prevMatch of matches) {
    const currentRounds = roundsPerCourt[prevMatch.gi] ?? 3;
    const stopAt = prevMatch.gi === gi ? si - 1 : currentRounds - 1;
    if (stopAt < 0) continue;

    for (let setIndex = 0; setIndex <= stopAt; setIndex += 1) {
      const sc = scores[scoreKey(prevMatch.gi, setIndex)] ?? { a: 0, b: 0 };
      const done = (sc.a !== 0 || sc.b !== 0) && erFærdigtSæt(sc.a, sc.b);
      if (!done) continue;
      prevSets.push({
        id: 6_000_000 + prevMatch.gi * 100 + setIndex,
        kampid: 5_000_000 + prevMatch.gi,
        date: eventDate,
        holdA1: prevMatch.teams[0].playerNames[0],
        holdA2: prevMatch.teams[0].playerNames[1],
        holdB1: prevMatch.teams[1].playerNames[0],
        holdB2: prevMatch.teams[1].playerNames[1],
        scoreA: sc.a,
        scoreB: sc.b,
        finish: done,
        event: true,
        tiebreak: false,
      });
    }
  }

  const sc = scores[scoreKey(gi, si)] ?? { a: 0, b: 0 };
  const nonZero = sc.a !== 0 || sc.b !== 0;
  if (!nonZero) return "";

  const currentSet = {
    id: 7_000_000 + gi * 100 + si,
    kampid: 4_000_000 + gi,
    date: eventDate,
    holdA1: match.teams[0].playerNames[0],
    holdA2: match.teams[0].playerNames[1],
    holdB1: match.teams[1].playerNames[0],
    holdB2: match.teams[1].playerNames[1],
    scoreA: sc.a,
    scoreB: sc.b,
    finish: erFærdigtSæt(sc.a, sc.b),
    event: true,
    tiebreak: false,
  };

  const { eloChanges } = beregnEloForKampe(
    [...prevSets, currentSet] as any,
    eloMap
  );
  const diffs = Object.values(eloChanges?.[currentSet.id] ?? {}).map((value: any) =>
    typeof value?.diff === "number" ? value.diff : 0
  );
  const maxPos = Math.max(...diffs.filter((value: number) => value > 0), -Infinity);
  return Number.isFinite(maxPos) ? `+${maxPos.toFixed(1)}` : "";
}

function initialsFromNames(team: PartnerTeamMeta) {
  return `${team.playerNames[0].slice(0, 1)}${team.playerNames[1].slice(0, 1)}`.toUpperCase();
}

function completedSetRows(
  matches: MatchPlan[],
  roundsPerCourt: Record<number, number>,
  scores: Record<string, Score>,
  eventDate: string
) {
  const sets: any[] = [];

  for (const match of matches) {
    const rounds = roundsPerCourt[match.gi] ?? 3;
    for (let si = 0; si < rounds; si += 1) {
      const sc = scores[scoreKey(match.gi, si)] ?? { a: 0, b: 0 };
      const done = (sc.a !== 0 || sc.b !== 0) && erFærdigtSæt(sc.a, sc.b);
      if (!done) continue;
      sets.push({
        id: 1_500_000 + match.gi * 100 + si,
        kampid: 1_400_000 + match.gi,
        date: eventDate,
        holdA1: match.teams[0].playerNames[0],
        holdA2: match.teams[0].playerNames[1],
        holdB1: match.teams[1].playerNames[0],
        holdB2: match.teams[1].playerNames[1],
        scoreA: sc.a,
        scoreB: sc.b,
        finish: done,
        event: true,
        tiebreak: "false",
      });
    }
  }

  return sets;
}

export default function PartnerEventAdminClient({
  eventId,
}: {
  eventId: string;
}) {
  const router = useRouter();

  const [event, setEvent] = useState<EventRow | null>(null);
  const [eventsList, setEventsList] = useState<EventRow[]>([]);
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  const [eloMap, setEloMap] = useState<Record<string, number>>({});
  const [teams, setTeams] = useState<PartnerTeamMeta[]>([]);
  const [draftPair, setDraftPair] = useState<Profile[]>([]);
  const [search, setSearch] = useState("");
  const [scores, setScores] = useState<Record<string, Score>>({});
  const [roundsPerCourt, setRoundsPerCourt] = useState<Record<number, number>>(
    {}
  );
  const [courtOverrides, setCourtOverrides] = useState<Record<number, string>>(
    {}
  );
  const [matchTimes, setMatchTimes] = useState<
    Record<number, { start: string; end: string }>
  >({});
  const [submissionBusy, setSubmissionBusy] = useState(false);
  const [submissionState, setSubmissionState] = useState<{
    submitted: boolean;
    rowsCount: number;
  }>({ submitted: false, rowsCount: 0 });
  const [loading, setLoading] = useState(true);

  const parsed = useMemo(
    () => parseEventRulesText(event?.rules_text),
    [event?.rules_text]
  );

  const locked = event?.status === "published";
  const matches = useMemo(() => {
    if (!event) return [] as MatchPlan[];
    return buildMatchPlan(teams, eloMap, event.location);
  }, [teams, eloMap, event]);
  const courtSuggestions = useMemo(
    () =>
      event?.location === "Gilleleje"
        ? ["1", "2", "3", "5", "6"]
        : ["CC", "1", "2", "3"],
    [event?.location]
  );
  const dayDiffSorted = useMemo(() => {
    if (!event) return [] as Array<{ navn: string; diff: number }>;
    const sets = completedSetRows(matches, roundsPerCourt, scores, event.date);
    const { eloChanges } = beregnEloForKampe(sets as any, eloMap);
    const totals: Record<string, number> = {};

    for (const set of sets) {
      if (set.scoreA === 0 && set.scoreB === 0) continue;
      const changes = eloChanges?.[set.id];
      if (!changes) continue;
      Object.entries(changes).forEach(([navn, entry]: any) => {
        const diff = typeof entry?.diff === "number" ? entry.diff : 0;
        totals[navn] = (totals[navn] ?? 0) + diff;
      });
    }

    return matches
      .flatMap((match) => match.teams)
      .filter(
        (team, index, arr) => arr.findIndex((entry) => entry.id === team.id) === index
      )
      .map((team) => {
        const diffA = totals[team.playerNames[0]] ?? 0;
        const diffB = totals[team.playerNames[1]] ?? 0;
        return {
          navn: formatTeamLabel(team),
          diff: (diffA + diffB) / 2,
        };
      })
      .filter((entry) => entry.diff !== 0)
      .sort((a, b) => b.diff - a.diff);
  }, [eloMap, event, matches, roundsPerCourt, scores]);
  const header = useMemo(
    () => ({ emojiLeft: "🤝", emojiRight: "🤝" }),
    []
  );

  const courtForMatch = useCallback(
    (match: MatchPlan) => courtOverrides[match.gi] ?? match.court,
    [courtOverrides]
  );

  const syncEventPlayers = useCallback(
    async (nextTeams: PartnerTeamMeta[]) => {
      if (!eventId) return;
      const rows = nextTeams.flatMap((team) =>
        team.playerIds.map((userId, index) => ({
          event_id: eventId,
          user_id: userId,
          visningsnavn: team.playerNames[index],
          status: "registered",
        }))
      );

      await supabase.from("event_players").delete().eq("event_id", eventId);
      if (rows.length > 0) {
        const { error } = await (supabase.from("event_players") as any).upsert(
          rows,
          { onConflict: "event_id,user_id" }
        );
        if (error) {
          console.warn("event_players sync error:", error.message);
        }
      }
    },
    [eventId]
  );

  const persistTeams = useCallback(
    async (nextTeams: PartnerTeamMeta[]) => {
      if (!event) return;
      const nextRulesText = buildEventRulesText(parsed.visibleRulesText, {
        format: "partner",
        partnerTeams: nextTeams,
      });

      const { data, error } = await (supabase.from("events") as any)
        .update({ rules_text: nextRulesText })
        .eq("id", event.id)
        .select("*")
        .single();

      if (error) {
        alert(`Kunne ikke gemme makkerpar: ${error.message}`);
        return;
      }

      setEvent(data as EventRow);
      await syncEventPlayers(nextTeams);
    },
    [event, parsed.visibleRulesText, syncEventPlayers]
  );

  const refreshSubmissionState = useCallback(async () => {
    if (!event?.id || !event?.date) return;
    const state = await getEventSubmissionState(supabase, event);
    setSubmissionState({
      submitted: state.submitted,
      rowsCount: state.count ?? 0,
    });
  }, [event]);

  useEffect(() => {
    (async () => {
      try {
        const eventRequest = supabase
          .from("events")
          .select("*")
          .eq("id", eventId)
          .maybeSingle();

        const profilesRequest = supabase
          .from("profiles")
          .select("id, visningsnavn, status")
          .in("status", ["active", "sleep"])
          .not("visningsnavn", "is", null)
          .order("visningsnavn", { ascending: true });

        const eventsRequest = fetch("/api/events?all=1", { cache: "no-store" });
        const ranglisteRequest = fetch("/api/rangliste", { cache: "no-store" });

        const [{ data: eventRow }, { data: profiles }, eventsRes, rangRes] =
          await Promise.all([
            eventRequest,
            profilesRequest,
            eventsRequest,
            ranglisteRequest,
          ]);

        if (eventRow) {
          setEvent(eventRow as EventRow);
          const meta = parseEventRulesText((eventRow as EventRow).rules_text).meta;
          setTeams(meta.partnerTeams ?? []);
        }

        setAllProfiles(
          ((profiles as any[]) ?? [])
            .map((profile) => ({
              id: profile.id,
              visningsnavn: (profile.visningsnavn ?? "").toString().trim(),
            }))
            .filter((profile) => profile.visningsnavn.length > 0)
        );

        const eventsJson = await eventsRes.json();
        setEventsList(
          (((eventsJson?.data as EventRow[] | undefined) ?? []).filter((row) =>
            parseEventRulesText(row.rules_text).meta.format === "partner"
          ))
        );

        const rangJson = await rangRes.json();
        const rangArr = Array.isArray(rangJson)
          ? rangJson
          : rangJson?.data ?? [];
        const nextEloMap: Record<string, number> = {};
        rangArr.forEach((row: any) => {
          const navn = (row?.visningsnavn ?? "").toString().trim();
          const elo = Number(row?.elo ?? 0);
          if (navn && Number.isFinite(elo)) nextEloMap[navn] = elo;
        });
        setEloMap(nextEloMap);

        await loadEventResultsToState(eventId, setScores, setRoundsPerCourt);

        const { data: metaRows } = await supabase
          .from("event_result")
          .select("group_index,court_label,start_time,end_time")
          .eq("event_id", eventId)
          .order("group_index", { ascending: true })
          .order("set_index", { ascending: true });

        const nextCourts: Record<number, string> = {};
        const nextTimes: Record<number, { start: string; end: string }> = {};
        for (const row of (metaRows as any[]) ?? []) {
          const gi = Number(row.group_index ?? 0);
          if (!Number.isFinite(gi)) continue;
          if (row.court_label && nextCourts[gi] == null) {
            nextCourts[gi] = String(row.court_label);
          }
          if (!nextTimes[gi] && (row.start_time || row.end_time)) {
            nextTimes[gi] = {
              start: fmtTime(row.start_time) || fmtTime(eventRow?.start_time) || "18:00",
              end: fmtTime(row.end_time) || fmtTime(eventRow?.end_time) || "20:00",
            };
          }
        }
        setCourtOverrides(nextCourts);
        setMatchTimes((prev) => ({ ...nextTimes, ...prev }));
      } finally {
        setLoading(false);
      }
    })();
  }, [eventId]);

  useEffect(() => {
    if (!event) return;
    void refreshSubmissionState();
  }, [event, refreshSubmissionState]);

  useEffect(() => {
    if (!eventId) return;
    const interval = window.setInterval(() => {
      void loadEventResultsToState(eventId, setScores, setRoundsPerCourt);
      void refreshSubmissionState();
    }, 60000);

    return () => window.clearInterval(interval);
  }, [eventId, refreshSubmissionState]);

  useEffect(() => {
    if (!event) return;
    setMatchTimes((prev) => {
      const next = { ...prev };
      for (const match of matches) {
        if (!next[match.gi]) {
          next[match.gi] = {
            start: fmtTime(event.start_time) || "18:00",
            end: fmtTime(event.end_time) || "20:00",
          };
        }
      }
      return next;
    });

    setRoundsPerCourt((prev) => {
      const next = { ...prev };
      for (const match of matches) {
        if (!next[match.gi] || next[match.gi] < 1) next[match.gi] = 3;
      }
      return next;
    });
  }, [event, matches]);

  const selectedIds = useMemo(
    () => new Set(teams.flatMap((team) => [...team.playerIds])),
    [teams]
  );

  const searchResults = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return [] as Array<Profile & { elo: number }>;

    return allProfiles
      .filter((profile) => {
        const name = (profile.visningsnavn ?? "").toLowerCase();
        return name.includes(query) && !selectedIds.has(profile.id);
      })
      .slice(0, 20)
      .map((profile) => ({
        ...profile,
        elo: eloMap[(profile.visningsnavn ?? "").trim()] ?? 1000,
      }));
  }, [allProfiles, eloMap, search, selectedIds]);

  async function createTeamFromPair(pair: Profile[]) {
    if (locked) {
      alert("Programmet er offentliggjort. Makkerpar kan ikke ændres nu.");
      return;
    }
    if (pair.length !== 2) {
      alert("Vælg to spillere til makkerparret.");
      return;
    }

    const orderedPair = sortPairByElo(pair, eloMap);

    const newTeam: PartnerTeamMeta = {
      id: pairId(),
      playerIds: [orderedPair[0].id, orderedPair[1].id],
      playerNames: [
        orderedPair[0].visningsnavn?.trim() || "Spiller 1",
        orderedPair[1].visningsnavn?.trim() || "Spiller 2",
      ],
    };

    const nextTeams = [...teams, newTeam];
    setTeams(nextTeams);
    setDraftPair([]);
    await persistTeams(nextTeams);
  }

  function addToDraft(profile: Profile) {
    if (draftPair.find((entry) => entry.id === profile.id)) return;
    if (draftPair.length === 0) {
      setDraftPair([profile]);
      setSearch("");
      return;
    }

    if (draftPair.length === 1) {
      const nextPair = [draftPair[0], profile];
      setDraftPair(nextPair);
      setSearch("");
      void createTeamFromPair(nextPair);
    }
  }

  async function removeTeam(teamId: string) {
    if (locked) {
      alert("Programmet er offentliggjort. Makkerpar kan ikke ændres nu.");
      return;
    }
    const nextTeams = teams.filter((team) => team.id !== teamId);
    setTeams(nextTeams);
    await persistTeams(nextTeams);
  }

  async function upsertEventRow(
    match: MatchPlan,
    setIndex: number,
    scoreA: number,
    scoreB: number
  ) {
    if (!event) return;
    const matchTime = matchTimes[match.gi];
    const payload = {
      event_id: event.id,
      group_index: match.gi,
      set_index: setIndex,
      court_label: courtForMatch(match),
      start_time: hhmmToDb(matchTime?.start ?? fmtTime(event.start_time)),
      end_time: hhmmToDb(matchTime?.end ?? fmtTime(event.end_time)),
      holdA1: match.teams[0].playerNames[0],
      holdA2: match.teams[0].playerNames[1],
      holdB1: match.teams[1].playerNames[0],
      holdB2: match.teams[1].playerNames[1],
      scoreA,
      scoreB,
      tiebreak: false,
    };

    const { error } = await (supabase.from("event_result") as any).upsert(
      [payload],
      { onConflict: "event_id,group_index,set_index" }
    );

    if (error) {
      alert(`Kunne ikke gemme sættet: ${error.message}`);
    }
  }

  function setScore(match: MatchPlan, setIndex: number, side: "a" | "b", raw: string) {
    const value = raw.replace(/\D/g, "");
    const nextValue =
      value === "" ? 0 : Math.min(7, Math.max(0, parseInt(value, 10)));

    setScores((prev) => {
      const current = prev[scoreKey(match.gi, setIndex)] ?? { a: 0, b: 0 };
      const nextScore = { ...current, [side]: nextValue };
      void upsertEventRow(match, setIndex, nextScore.a, nextScore.b);
      return {
        ...prev,
        [scoreKey(match.gi, setIndex)]: nextScore,
      };
    });
  }

  async function addSet(match: MatchPlan) {
    const nextSetIndex = roundsPerCourt[match.gi] ?? 3;
    await upsertEventRow(match, nextSetIndex, 0, 0);
    setRoundsPerCourt((prev) => ({ ...prev, [match.gi]: nextSetIndex + 1 }));
  }

  async function setCourtLabel(match: MatchPlan, value: string) {
    setCourtOverrides((prev) => ({ ...prev, [match.gi]: value }));

    const rounds = roundsPerCourt[match.gi] ?? 3;
    const matchTime = matchTimes[match.gi];
    for (let setIndex = 0; setIndex < rounds; setIndex += 1) {
      const sc = scores[scoreKey(match.gi, setIndex)] ?? { a: 0, b: 0 };
      const payload = {
        event_id: event?.id ?? "",
        group_index: match.gi,
        set_index: setIndex,
        court_label: value,
        start_time: hhmmToDb(matchTime?.start ?? fmtTime(event?.start_time)),
        end_time: hhmmToDb(matchTime?.end ?? fmtTime(event?.end_time)),
        holdA1: match.teams[0].playerNames[0],
        holdA2: match.teams[0].playerNames[1],
        holdB1: match.teams[1].playerNames[0],
        holdB2: match.teams[1].playerNames[1],
        scoreA: sc.a,
        scoreB: sc.b,
        tiebreak: false,
      };

      await (supabase.from("event_result") as any).upsert([payload], {
        onConflict: "event_id,group_index,set_index",
      });
    }
  }

  async function persistProgramAndPublish(nextPublished: boolean) {
    if (!event) return;
    if (matches.length === 0) {
      alert("Tilføj mindst to makkerpar først.");
      return;
    }

    for (const match of matches) {
      const rounds = roundsPerCourt[match.gi] ?? 3;
      for (let setIndex = 0; setIndex < rounds; setIndex += 1) {
        const sc = scores[scoreKey(match.gi, setIndex)] ?? { a: 0, b: 0 };
        await upsertEventRow(match, setIndex, sc.a, sc.b);
      }
    }

    const { data, error } = await (supabase.from("events") as any)
      .update({ status: nextPublished ? "published" : "planned" })
      .eq("id", event.id)
      .select("*")
      .single();

    if (error) {
      alert(`Kunne ikke ændre event-status: ${error.message}`);
      return;
    }

    setEvent(data as EventRow);
    alert(
      nextPublished
        ? "Program publiceret og klar til spiller-input."
        : "Event sat tilbage til planned."
    );
  }

  async function submitWholeEvent() {
    if (!event || submissionBusy) return;
    setSubmissionBusy(true);
    try {
      const state = await getEventSubmissionState(supabase, event);
      if (state.submitted) {
        setSubmissionState({
          submitted: state.submitted,
          rowsCount: state.count ?? 0,
        });
        alert("Eventet er allerede indberettet.");
        return;
      }

      const {
        data: {
          user,
        },
      } = await supabase.auth.getUser();

      if (!user?.id) {
        alert("Du skal være logget ind som admin.");
        return;
      }

      const inserts: NewResultInsert[] = [];
      for (const match of matches) {
        const rounds = roundsPerCourt[match.gi] ?? 3;
        const kampid = getEventKampidForGroup(event, match.gi);
        if (kampid == null) continue;

        for (let setIndex = 0; setIndex < rounds; setIndex += 1) {
          const sc = scores[scoreKey(match.gi, setIndex)] ?? { a: 0, b: 0 };
          if (sc.a === 0 && sc.b === 0) continue;
          inserts.push({
            date: event.date,
            finish: erFærdigtSæt(sc.a, sc.b),
            tiebreak: false,
            event: true,
            kampid,
            holdA1: match.teams[0].playerNames[0],
            holdA2: match.teams[0].playerNames[1],
            holdB1: match.teams[1].playerNames[0],
            holdB2: match.teams[1].playerNames[1],
            scoreA: sc.a,
            scoreB: sc.b,
            indberettet_af: user.id,
          });
        }
      }

      if (inserts.length === 0) {
        alert("Der er ingen udfyldte sæt at indberette endnu.");
        return;
      }

      const { error } = await (supabase.from("newresults") as any).insert(inserts);
      if (error) {
        throw error;
      }

      await refreshSubmissionState();
      alert("Hele makkereventet er indberettet.");
    } catch (error: any) {
      alert(error?.message ?? "Kunne ikke indberette eventet.");
    } finally {
      setSubmissionBusy(false);
    }
  }

  async function undoSubmission() {
    if (!event || submissionBusy) return;
    if (
      !confirm(
        "Vil du fortryde hele indberetningen? Alle sæt fra dette event slettes fra ranglisten."
      )
    ) {
      return;
    }

    setSubmissionBusy(true);
    try {
      const range = getEventKampidRange(event);
      if (!range) {
        alert("Kunne ikke bestemme kamp-id intervallet for eventet.");
        return;
      }

      const { error } = await (supabase.from("newresults") as any)
        .delete()
        .gte("kampid", range.from)
        .lte("kampid", range.to)
        .eq("date", event.date)
        .eq("event", true);

      if (error) {
        throw error;
      }

      await refreshSubmissionState();
      alert("Indberetningen er fortrudt.");
    } catch (error: any) {
      alert(error?.message ?? "Kunne ikke fortryde indberetningen.");
    } finally {
      setSubmissionBusy(false);
    }
  }

  if (loading || !event) {
    return <div className="p-4">Indlæser makkerevent…</div>;
  }

  const selectedDraftIds = new Set(draftPair.map((profile) => profile.id));

  return (
    <div className="mx-auto max-w-[1600px] px-2 text-gray-900 dark:text-gray-100 sm:px-3 lg:px-4">
      <style jsx global>{`
        .tabnums {
          font-variant-numeric: tabular-nums;
        }
      `}</style>

      <div className="mb-2 mt-1 text-center">
        <h1 className="text-2xl font-extrabold tracking-tight text-pink-600 sm:text-3xl">
          {header.emojiLeft} {event.name} {header.emojiRight}
          {locked && (
            <span className="ml-2 rounded-full bg-pink-600 px-2 py-0.5 text-xs align-middle text-white">
              🔒 Offentliggjort
            </span>
          )}
          {submissionState.submitted && (
            <span className="ml-2 rounded-full bg-emerald-600 px-2 py-0.5 text-xs align-middle text-white">
              ✅ Resultater indberettet
            </span>
          )}
        </h1>
        <div className="mt-1 text-xs opacity-70">
          {event.date} · {fmtTime(event.start_time)}–{fmtTime(event.end_time)} ·{" "}
          {event.location}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
        <Link
          href="/admin/event"
          className="rounded-md border border-pink-300 bg-pink-50 px-3 py-1 text-sm text-pink-800 hover:bg-pink-100 dark:border-pink-700 dark:bg-pink-900/20 dark:text-pink-200"
        >
          Eventoversigt
        </Link>
        <label className="text-sm">
          <span className="mr-2 opacity-80">Skift event</span>
          <select
            value={event.id}
            onChange={(e) =>
              router.push(
                getEventAdminHref(
                  e.target.value,
                  eventsList.find((row) => String(row.id) === e.target.value)
                    ?.rules_text
                )
              )
            }
            className="rounded border border-pink-400/70 bg-white px-2 py-1 text-sm dark:border-pink-800/70 dark:bg-zinc-900"
          >
            {eventsList.map((row) => (
              <option key={row.id} value={row.id}>
                {row.date} · {fmtTime(row.start_time)} – {row.location} ·{" "}
                {row.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 rounded-md border border-pink-300 bg-white px-2 py-1 text-sm dark:border-pink-700 dark:bg-zinc-900">
          <input
            type="checkbox"
            checked={locked}
            onChange={(e) => void persistProgramAndPublish(e.target.checked)}
          />
          <span>Programmet offentliggøres</span>
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-12">
        <section className="rounded-xl border border-pink-400/80 bg-pink-50/70 p-3 dark:border-pink-800 dark:bg-pink-900/10 md:col-span-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold text-pink-900 dark:text-pink-200">
              Makkerpar ({teams.length})
            </h2>
            <span className="text-xs text-pink-700 dark:text-pink-300">
              Auto-sorteret
            </span>
          </div>

          <div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={locked ? "Programmet er låst" : "Søg spiller..."}
              disabled={locked}
              className={`w-full rounded border border-pink-400/70 bg-white/90 px-2 py-1 text-sm dark:border-pink-800/70 dark:bg-zinc-900 ${
                locked ? "cursor-not-allowed opacity-60" : ""
              }`}
            />

            {!!search && !locked && (
              <div className="mt-1 max-h-56 overflow-auto rounded border border-pink-300 bg-white dark:border-pink-800 dark:bg-zinc-900">
                {searchResults.map((profile) => (
                  <button
                    key={profile.id}
                    type="button"
                    onClick={() => addToDraft(profile)}
                    disabled={selectedDraftIds.has(profile.id)}
                    className="flex w-full items-center justify-between px-2 py-1 text-left text-sm hover:bg-pink-100/70 disabled:opacity-50 dark:hover:bg-pink-900/30"
                  >
                    <div className="truncate">
                      {profile.visningsnavn}
                      <span className="opacity-70">
                        {" "}
                        · ELO {Math.round(profile.elo)}
                      </span>
                    </div>
                    <span className="rounded border border-pink-300 px-2 py-0.5 text-xs text-pink-700 dark:border-pink-700 dark:text-pink-300">
                      Tilføj
                    </span>
                  </button>
                ))}
                {!searchResults.length && (
                  <div className="p-2 text-xs opacity-70">Ingen…</div>
                )}
              </div>
            )}
          </div>

          <div className="mt-3 rounded-lg border border-pink-500/80 bg-white/95 shadow-sm dark:border-pink-700/80 dark:bg-zinc-900">
            <div className="border-b border-pink-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-pink-700 dark:border-pink-900/30 dark:text-pink-300">
              Næste makkerpar
            </div>
            <div className="space-y-2 px-3 py-2">
              {[0, 1].map((slot) => (
                <div
                  key={`draft-${slot}`}
                  className="flex items-center justify-between rounded-md border border-dashed border-pink-300 px-2 py-2 text-sm dark:border-pink-700"
                >
                  {draftPair[slot] ? (
                    <>
                      <span className="truncate">{draftPair[slot].visningsnavn}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setDraftPair((prev) =>
                            prev.filter((_, index) => index !== slot)
                          )
                        }
                        className="text-xs text-red-600"
                      >
                        Fjern
                      </button>
                    </>
                  ) : (
                    <span className="opacity-70">Vælg spiller {slot + 1}</span>
                  )}
                </div>
              ))}
              <p className="text-xs opacity-70">
                Når spiller nr. 2 vælges, oprettes holdet automatisk og programmet
                opdateres med det samme.
              </p>
            </div>
          </div>

          <div className="mt-3 space-y-2">
            {[...teams]
              .sort(
                (a, b) => averageTeamElo(b, eloMap) - averageTeamElo(a, eloMap)
              )
              .map((team, index) => (
                <div
                  key={team.id}
                  className="rounded-lg border border-pink-500/80 bg-white/95 shadow-sm dark:border-pink-700/80 dark:bg-zinc-900"
                >
                  <div className="flex items-center justify-between gap-2 px-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {index + 1}. {team.playerNames[0]} &amp; {team.playerNames[1]}
                      </div>
                      <div className="text-[11px] opacity-70">
                        Gns. Elo {averageTeamElo(team, eloMap).toFixed(1)}
                      </div>
                    </div>
                    {!locked ? (
                      <button
                        type="button"
                        onClick={() => void removeTeam(team.id)}
                        className="rounded-md border border-red-300 p-1.5 text-xs text-red-600 dark:border-red-700 dark:text-red-400"
                        title="Fjern makkerpar"
                      >
                        🗑️
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            {!teams.length && (
              <div className="text-sm opacity-70">Ingen makkerpar endnu.</div>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-pink-400 bg-white/80 p-3 dark:border-pink-800 dark:bg-zinc-900/60 md:col-span-7">
          {!matches.length ? (
            <div className="text-sm opacity-70">
              Tilføj mindst 2 makkerpar for at generere kampe.
            </div>
          ) : (
            <div className="space-y-3">
              {matches.map((match, index) => {
                const gi = match.gi;
                const rounds = roundsPerCourt[gi] ?? 3;
                const currentCourt = courtForMatch(match);
                const mt = matchTimes[gi] ?? {
                  start: (event.start_time || "18:00").slice(0, 5),
                  end: (event.end_time || "20:00").slice(0, 5),
                };

                return (
                  <div
                    key={`kamp-${gi}`}
                    className="overflow-hidden rounded-lg border dark:border-zinc-800"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 bg-pink-100/70 px-3 py-2 dark:bg-pink-900/30">
                      <div className="font-semibold text-pink-900 dark:text-pink-200">
                        Kamp #{index + 1}
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-1 text-sm">
                          Bane
                          <select
                            className="rounded border border-pink-300 bg-white px-2 py-1 text-sm dark:border-pink-700 dark:bg-zinc-900"
                            value={currentCourt}
                            disabled={submissionState.submitted}
                            onChange={(e) => void setCourtLabel(match, e.target.value)}
                          >
                            {courtSuggestions.map((court) => (
                              <option key={court} value={court}>
                                {court}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="flex items-center gap-1 text-sm">
                          <input
                            type="time"
                            value={mt.start}
                            disabled={submissionState.submitted}
                            onChange={(e) =>
                              setMatchTimes((prev) => ({
                                ...prev,
                                [gi]: { ...mt, start: e.target.value },
                              }))
                            }
                            className="rounded border border-pink-300 bg-white px-2 py-1 text-sm dark:border-pink-700 dark:bg-zinc-900"
                          />
                          –
                          <input
                            type="time"
                            value={mt.end}
                            disabled={submissionState.submitted}
                            onChange={(e) =>
                              setMatchTimes((prev) => ({
                                ...prev,
                                [gi]: { ...mt, end: e.target.value },
                              }))
                            }
                            className="rounded border border-pink-300 bg-white px-2 py-1 text-sm dark:border-pink-700 dark:bg-zinc-900"
                          />
                        </label>
                      </div>
                      <button
                        type="button"
                        onClick={() => void addSet(match)}
                        disabled={submissionState.submitted}
                        className="rounded border border-pink-300 bg-white/80 px-2 py-1 text-xs dark:border-pink-700 dark:bg-zinc-900"
                      >
                        + Tilføj sæt
                      </button>
                    </div>

                    <div className="space-y-1 px-3 py-2">
                      {Array.from({ length: rounds }).map((_, si) => {
                        const sc = scores[scoreKey(gi, si)] ?? { a: 0, b: 0 };
                          const prevSets = completedSetRows(
                          matches.filter((row) => row.gi < gi),
                          roundsPerCourt,
                          scores,
                          event.date
                        );
                        for (let s = 0; s < si; s += 1) {
                          const prevScore = scores[scoreKey(gi, s)] ?? { a: 0, b: 0 };
                          const prevDone =
                            (prevScore.a !== 0 || prevScore.b !== 0) &&
                            erFærdigtSæt(prevScore.a, prevScore.b);
                          if (!prevDone) continue;
                          prevSets.push({
                            id: 2_500_000 + gi * 100 + s,
                            kampid: 2_400_000 + gi,
                            date: event.date,
                            holdA1: match.teams[0].playerNames[0],
                            holdA2: match.teams[0].playerNames[1],
                            holdB1: match.teams[1].playerNames[0],
                            holdB2: match.teams[1].playerNames[1],
                            scoreA: prevScore.a,
                            scoreB: prevScore.b,
                            finish: true,
                            event: true,
                            tiebreak: "false",
                          });
                        }
                        const { nyEloMap } = beregnEloForKampe(prevSets as any, eloMap);
                        const rA =
                          ((nyEloMap[match.teams[0].playerNames[0]] ??
                            eloMap[match.teams[0].playerNames[0]] ??
                            1500) +
                            (nyEloMap[match.teams[0].playerNames[1]] ??
                              eloMap[match.teams[0].playerNames[1]] ??
                              1500)) /
                          2;
                        const rB =
                          ((nyEloMap[match.teams[1].playerNames[0]] ??
                            eloMap[match.teams[1].playerNames[0]] ??
                            1500) +
                            (nyEloMap[match.teams[1].playerNames[1]] ??
                              eloMap[match.teams[1].playerNames[1]] ??
                              1500)) /
                          2;
                        const qa = Math.pow(10, rA / 400);
                        const qb = Math.pow(10, rB / 400);
                        const pA = qa / (qa + qb);
                        const pctA = Math.round(100 * pA);
                        const pctB = 100 - pctA;
                        const plusTxt = pluspointForMatch(
                          match,
                          gi,
                          si,
                          scores,
                          roundsPerCourt,
                          matches,
                          eloMap,
                          event.date
                        );

                        return (
                          <div
                            key={`${gi}-${si}`}
                            className="flex items-center justify-between gap-2 text-sm"
                          >
                            <div className="flex min-w-0 flex-1 items-center gap-2">
                              <span className="shrink-0 opacity-70">Sæt {si + 1}</span>
                              <div className="flex min-w-0 flex-1 items-center gap-2">
                                <span className="min-w-0 grow basis-0 truncate">
                                  {match.teams[0].playerNames[0]} &amp;{" "}
                                  {match.teams[0].playerNames[1]}
                                </span>
                                <span
                                  className="shrink-0 font-semibold tabnums"
                                  style={{ color: pctColor(pA) }}
                                >
                                  {pctA}%
                                </span>
                                <span className="shrink-0 opacity-60">vs</span>
                                <span
                                  className="shrink-0 font-semibold tabnums"
                                  style={{ color: pctColor(1 - pA) }}
                                >
                                  {pctB}%
                                </span>
                                <span className="min-w-0 grow basis-0 truncate text-right">
                                  {match.teams[1].playerNames[0]} &amp;{" "}
                                  {match.teams[1].playerNames[1]}
                                </span>
                              </div>
                            </div>
                            <div className="ml-auto flex min-w-[8rem] shrink-0 items-center justify-end gap-1">
                              <div className="flex w-[4.75rem] items-center justify-end gap-1">
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  pattern="[0-7]"
                                  maxLength={1}
                                  value={String(sc.a)}
                                  onFocus={(e) => e.currentTarget.select()}
                                  onChange={(e) => setScore(match, si, "a", e.target.value)}
                                  disabled={submissionState.submitted}
                                  className="w-7 rounded border border-pink-300 bg-white px-0.5 py-0.5 text-center text-sm dark:border-pink-700 dark:bg-zinc-900"
                                />
                                <span className="opacity-60">-</span>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  pattern="[0-7]"
                                  maxLength={1}
                                  value={String(sc.b)}
                                  onFocus={(e) => e.currentTarget.select()}
                                  onChange={(e) => setScore(match, si, "b", e.target.value)}
                                  disabled={submissionState.submitted}
                                  className="w-7 rounded border border-pink-300 bg-white px-0.5 py-0.5 text-center text-sm dark:border-pink-700 dark:bg-zinc-900"
                                />
                              </div>
                              <span
                                className={`w-[3rem] text-right font-semibold tabnums ${
                                  plusTxt ? "text-pink-700" : "text-transparent"
                                }`}
                              >
                                {plusTxt || "+00,0"}
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
          )}
        </section>

        <section className="flex h-fit flex-col rounded-xl border border-pink-400 bg-white/90 p-3 dark:border-pink-800 dark:bg-zinc-900/60 md:col-span-2 md:sticky md:top-2">
          <h2 className="mb-2 font-semibold text-pink-900 dark:text-pink-200">
            📈 Dagens Elo
          </h2>
          {dayDiffSorted.length === 0 ? (
            <div className="text-sm opacity-70">Ingen udfyldte sæt endnu.</div>
          ) : (
            <div className="max-h-[480px] space-y-1 overflow-auto pr-1">
              {dayDiffSorted.map(({ navn, diff }) => (
                <div key={navn} className="flex items-center justify-between text-sm">
                  <span className="max-w-[60%] truncate">{navn}</span>
                  <span
                    className={diff >= 0 ? "tabnums text-green-600" : "tabnums text-red-500"}
                  >
                    {emojiForPluspoint(diff)} {diff >= 0 ? "+" : ""}
                    {diff.toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="mt-3">
            {submissionState.submitted ? (
              <button
                type="button"
                onClick={() => void undoSubmission()}
                disabled={submissionBusy}
                className="w-full rounded-md bg-amber-500 px-3 py-2 text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                ↩️ Fortryd indberetning
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void submitWholeEvent()}
                disabled={submissionBusy || !locked}
                className="w-full rounded-md bg-pink-600 px-3 py-2 text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                ✅ Indsend resultater
              </button>
            )}
            <p className="mt-2 text-center text-xs text-zinc-500 dark:text-zinc-400">
              {submissionState.submitted
                ? `${submissionState.rowsCount} sæt er allerede sendt til ranglisten.`
                : "Hele eventet indberettes samlet herfra."}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
