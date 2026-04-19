"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Hold = {
  id: string;
  name: string;
  division: string;
  season: string;
};

type HoldMedlem = {
  id: string;
  visningsnavn: string;
  member_type: "primary" | "reserve";
  sort_order: number | null;
};

type Kamp = {
  id: string;
  opponent: string;
  match_date: string | null;
  home_away: "home" | "away";
  location: string | null;
  round: number | null;
  status: "upcoming" | "played";
  result_for: number | null;
  result_against: number | null;
};

type PlayerStat = {
  visningsnavn: string;
  wins: number;
  losses: number;
};

type MatchPlayerRow = {
  visningsnavn: string;
  wins: number | null;
  losses: number | null;
  match_id: string;
  status: string | null;
};

type PrimaryAssignmentRow = {
  visningsnavn: string;
  team_id: string;
};

type SimpleMatchRow = {
  id: string;
  team_id: string;
};

const CURRENT_SEASON = "2026 forår";

function formatDate(dateString: string | null) {
  if (!dateString) return "Dato mangler";

  const date = new Date(dateString);

  return new Intl.DateTimeFormat("da-DK", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getMatchTimestamp(dateString: string | null) {
  if (!dateString) return Number.MAX_SAFE_INTEGER;
  const ts = new Date(dateString).getTime();
  return Number.isNaN(ts) ? Number.MAX_SAFE_INTEGER : ts;
}

export default function HoldSide({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [hold, setHold] = useState<Hold | null>(null);
  const [medlemmer, setMedlemmer] = useState<HoldMedlem[]>([]);
  const [kampe, setKampe] = useState<Kamp[]>([]);
  const [statsMap, setStatsMap] = useState<Record<string, PlayerStat>>({});
  const [signupCountMap, setSignupCountMap] = useState<Record<string, number>>(
    {}
  );
  const [reserveAvailabilityMap, setReserveAvailabilityMap] = useState<
    Record<string, number>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      setLoading(true);
      setError(null);

      const [holdRes, medlemmerRes, kampeRes] = await Promise.all([
        supabase
          .from("hold_teams")
          .select("id, name, division, season")
          .eq("id", id)
          .eq("season", CURRENT_SEASON)
          .single(),

        supabase
          .from("hold_team_members")
          .select("id, visningsnavn, member_type, sort_order")
          .eq("team_id", id)
          .eq("season", CURRENT_SEASON)
          .order("sort_order", { ascending: true }),

        supabase
          .from("hold_matches")
          .select(`
            id,
            opponent,
            match_date,
            home_away,
            location,
            round,
            status,
            result_for,
            result_against
          `)
          .eq("team_id", id)
          .eq("season", CURRENT_SEASON)
          .order("match_date", { ascending: true }),
      ]);

      if (cancelled) return;

      if (holdRes.error) {
        setError(holdRes.error.message);
        setLoading(false);
        return;
      }

      if (medlemmerRes.error) {
        setError(medlemmerRes.error.message);
        setLoading(false);
        return;
      }

      if (kampeRes.error) {
        setError(kampeRes.error.message);
        setLoading(false);
        return;
      }

      const holdData = holdRes.data;
      const medlemmerData = medlemmerRes.data ?? [];
      const kampeData = (kampeRes.data ?? []).sort((a, b) => {
        return getMatchTimestamp(a.match_date) - getMatchTimestamp(b.match_date);
      });

      setHold(holdData);
      setMedlemmer(medlemmerData);
      setKampe(kampeData);

      const matchIds = kampeData.map((k) => k.id);

      if (matchIds.length === 0) {
        setStatsMap({});
        setSignupCountMap({});
        setReserveAvailabilityMap({});
        setLoading(false);
        return;
      }

      const statsRes = await supabase
        .from("hold_match_players")
        .select("visningsnavn, wins, losses, match_id, status")
        .in("match_id", matchIds);

      if (cancelled) return;

      if (statsRes.error) {
        setError(statsRes.error.message);
        setLoading(false);
        return;
      }

      const rows: MatchPlayerRow[] = statsRes.data ?? [];
      const nextStatsMap: Record<string, PlayerStat> = {};
      const nextSignupCountMap: Record<string, number> = {};

      for (const row of rows) {
        const name = row.visningsnavn;

        if (!nextStatsMap[name]) {
          nextStatsMap[name] = {
            visningsnavn: name,
            wins: 0,
            losses: 0,
          };
        }

        nextStatsMap[name].wins += Number(row.wins ?? 0);
        nextStatsMap[name].losses += Number(row.losses ?? 0);

        if (row.status === "tilmeldt") {
          nextSignupCountMap[row.match_id] =
            (nextSignupCountMap[row.match_id] ?? 0) + 1;
        }
      }

      setStatsMap(nextStatsMap);
      setSignupCountMap(nextSignupCountMap);

      const reservePlayers = medlemmerData.filter(
        (m) => m.member_type === "reserve"
      );

      const reserveNames = reservePlayers.map((r) => r.visningsnavn);

      if (reserveNames.length === 0) {
        setReserveAvailabilityMap({});
        setLoading(false);
        return;
      }

      const primaryAssignmentsRes = await supabase
        .from("hold_team_members")
        .select("visningsnavn, team_id")
        .eq("season", CURRENT_SEASON)
        .eq("member_type", "primary")
        .neq("team_id", id)
        .in("visningsnavn", reserveNames);

      if (cancelled) return;

      if (primaryAssignmentsRes.error) {
        setError(primaryAssignmentsRes.error.message);
        setLoading(false);
        return;
      }

      const primaryAssignments: PrimaryAssignmentRow[] =
        primaryAssignmentsRes.data ?? [];

      const primaryTeamByName: Record<string, string> = {};
      for (const row of primaryAssignments) {
        if (!primaryTeamByName[row.visningsnavn]) {
          primaryTeamByName[row.visningsnavn] = row.team_id;
        }
      }

      const relevantTeamIds = Array.from(
        new Set([id, ...Object.values(primaryTeamByName)])
      );

      const relevantMatchesRes = await supabase
        .from("hold_matches")
        .select("id, team_id")
        .eq("season", CURRENT_SEASON)
        .in("team_id", relevantTeamIds);

      if (cancelled) return;

      if (relevantMatchesRes.error) {
        setError(relevantMatchesRes.error.message);
        setLoading(false);
        return;
      }

      const relevantMatches: SimpleMatchRow[] = relevantMatchesRes.data ?? [];
      const matchIdsByTeam: Record<string, string[]> = {};

      for (const match of relevantMatches) {
        if (!matchIdsByTeam[match.team_id]) {
          matchIdsByTeam[match.team_id] = [];
        }
        matchIdsByTeam[match.team_id].push(match.id);
      }

      const relevantMatchIds = relevantMatches.map((m) => m.id);

      if (relevantMatchIds.length === 0) {
        const fallbackMap: Record<string, number> = {};
        for (const reserve of reservePlayers) {
          fallbackMap[reserve.visningsnavn] = 6;
        }
        setReserveAvailabilityMap(fallbackMap);
        setLoading(false);
        return;
      }

      const reserveUsageRes = await supabase
        .from("hold_match_players")
        .select("visningsnavn, match_id, status")
        .in("visningsnavn", reserveNames)
        .in("match_id", relevantMatchIds);

      if (cancelled) return;

      if (reserveUsageRes.error) {
        setError(reserveUsageRes.error.message);
        setLoading(false);
        return;
      }

      const reserveUsageRows: {
        visningsnavn: string;
        match_id: string;
        status: string | null;
      }[] = reserveUsageRes.data ?? [];

      const currentTeamMatchIdsSet = new Set(matchIdsByTeam[id] ?? []);
      const externalAfbudCountByName: Record<string, number> = {};
      const reserveUsedCountByName: Record<string, number> = {};

      for (const row of reserveUsageRows) {
        const primaryTeamId = primaryTeamByName[row.visningsnavn];
        const primaryTeamMatchIds = primaryTeamId
          ? new Set(matchIdsByTeam[primaryTeamId] ?? [])
          : null;

        if (
          primaryTeamMatchIds &&
          primaryTeamMatchIds.has(row.match_id) &&
          row.status === "afbud"
        ) {
          externalAfbudCountByName[row.visningsnavn] =
            (externalAfbudCountByName[row.visningsnavn] ?? 0) + 1;
        }

        if (
          currentTeamMatchIdsSet.has(row.match_id) &&
          row.status === "tilmeldt"
        ) {
          reserveUsedCountByName[row.visningsnavn] =
            (reserveUsedCountByName[row.visningsnavn] ?? 0) + 1;
        }
      }

      const nextReserveAvailabilityMap: Record<string, number> = {};

      for (const reserve of reservePlayers) {
        const name = reserve.visningsnavn;
        const hasPrimaryElsewhere = Boolean(primaryTeamByName[name]);

        const base = hasPrimaryElsewhere
          ? externalAfbudCountByName[name] ?? 0
          : 6;

        const usedAsReserve = reserveUsedCountByName[name] ?? 0;

        nextReserveAvailabilityMap[name] = base - usedAsReserve;
      }

      setReserveAvailabilityMap(nextReserveAvailabilityMap);
      setLoading(false);
    }

    fetchData();

    return () => {
      cancelled = true;
    };
  }, [id]);

  const primaryPlayers = medlemmer.filter((m) => m.member_type === "primary");
  const reservePlayers = medlemmer.filter((m) => m.member_type === "reserve");

  function getStats(visningsnavn: string) {
    return statsMap[visningsnavn] ?? {
      visningsnavn,
      wins: 0,
      losses: 0,
    };
  }

  function getSignupCount(matchId: string) {
    return signupCountMap[matchId] ?? 0;
  }

  function getReserveAvailability(visningsnavn: string) {
    return reserveAvailabilityMap[visningsnavn] ?? 0;
  }

  function isWin(kamp: Kamp) {
    if (kamp.result_for === null || kamp.result_against === null) return false;
    return kamp.result_for > kamp.result_against;
  }

  function isLoss(kamp: Kamp) {
    if (kamp.result_for === null || kamp.result_against === null) return false;
    return kamp.result_for < kamp.result_against;
  }

  function formatDisplayedScore(kamp: Kamp) {
    if (kamp.result_for === null || kamp.result_against === null) return "—";

    return kamp.home_away === "home"
      ? `${kamp.result_for}-${kamp.result_against}`
      : `${kamp.result_against}-${kamp.result_for}`;
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-pink-50 to-white p-3 md:p-6">
        <div className="mx-auto max-w-5xl rounded-2xl bg-white p-4 shadow-sm ring-1 ring-pink-100">
          <p className="text-sm text-gray-500">Henter hold...</p>
        </div>
      </main>
    );
  }

  if (error || !hold) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-pink-50 to-white p-3 md:p-6">
        <div className="mx-auto max-w-5xl rounded-2xl bg-white p-4 shadow-sm ring-1 ring-pink-100">
          <Link
            href="/holdkampe"
            className="mb-3 inline-block text-sm font-semibold text-pink-700"
          >
            ← Tilbage til holdkampe
          </Link>
          <p className="text-sm text-red-600">Fejl: {error ?? "Hold ikke fundet"}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-pink-50 to-white p-3 md:p-6">
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-pink-100">
          <Link
            href="/holdkampe"
            className="mb-3 inline-block text-sm font-semibold text-pink-700 hover:underline"
          >
            ← Tilbage til holdkampe
          </Link>

          <h1 className="text-2xl font-bold text-pink-700">{hold.name}</h1>
          <p className="mt-1 text-sm text-gray-600">
            {hold.division} • {hold.season}
          </p>
        </div>

        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-pink-100">
          <div className="mb-3">
            <h2 className="text-lg font-bold text-gray-800">Holdets kampe</h2>
            <p className="text-xs text-gray-500">Sorterede efter kampdato</p>
          </div>

          {kampe.length === 0 ? (
            <div className="rounded-2xl bg-pink-50 p-5 text-center">
              <div className="text-3xl">📅</div>
              <p className="mt-2 text-sm font-semibold text-gray-800">
                Der er ikke oprettet kampe endnu
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Kampene kommer til at stå her, når de bliver lagt ind.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {kampe.map((kamp) => {
                const signupCount = getSignupCount(kamp.id);
                const enoughPlayers = signupCount >= 6;
                const won = isWin(kamp);
                const lost = isLoss(kamp);

                return (
                  <Link
                    key={kamp.id}
                    href={`/holdkampe/kamp/${kamp.id}`}
                    className="block rounded-2xl bg-pink-50 px-4 py-3 transition hover:bg-pink-100"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-bold text-gray-900 sm:text-base">
                          {kamp.home_away === "home"
                            ? `${hold.name} vs. ${kamp.opponent}`
                            : `${kamp.opponent} vs. ${hold.name}`}
                        </h3>

                        <p className="mt-1 text-xs leading-snug text-gray-500">
                          {formatDate(kamp.match_date)}
                          {kamp.location ? ` • ${kamp.location}` : ""}
                          {kamp.round ? ` • Runde ${kamp.round}` : ""}
                        </p>

                        <p
                          className={`mt-2 inline-flex rounded-full px-2 py-1 text-[11px] font-bold ${
                            enoughPlayers
                              ? "bg-green-100 text-green-700"
                              : "bg-red-100 text-red-600"
                          }`}
                        >
                          {signupCount} tilmeldt
                        </p>
                      </div>

                      <div className="shrink-0">
                        {kamp.status === "played" &&
                        kamp.result_for !== null &&
                        kamp.result_against !== null ? (
                          <div
                            className={`rounded-full px-3 py-1 text-xs font-bold ring-1 ${
                              won
                                ? "bg-green-100 text-green-700 ring-green-200"
                                : lost
                                ? "bg-red-100 text-red-700 ring-red-200"
                                : "bg-white text-gray-700 ring-gray-200"
                            }`}
                          >
                            {formatDisplayedScore(kamp)}
                          </div>
                        ) : (
                          <div className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-gray-600 ring-1 ring-pink-200">
                            Se kamp
                          </div>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-pink-100">
            <h2 className="text-lg font-bold text-gray-800">Primært hold</h2>

            {primaryPlayers.length === 0 ? (
              <p className="mt-3 text-sm text-gray-500">
                Ingen primære spillere fundet.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {primaryPlayers.map((player) => {
                  const stats = getStats(player.visningsnavn);

                  return (
                    <div
                      key={player.id}
                      className="flex items-center justify-between gap-3 rounded-2xl bg-pink-50 px-3 py-2.5"
                    >
                      <span className="min-w-0 truncate text-sm font-semibold text-gray-900">
                        {player.visningsnavn}
                      </span>

                      <div className="flex shrink-0 items-center gap-1.5 text-xs font-bold">
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-green-700">
                          V {stats.wins}
                        </span>
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-700">
                          T {stats.losses}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-pink-100">
            <h2 className="text-lg font-bold text-gray-800">Reserver</h2>

            {reservePlayers.length === 0 ? (
              <p className="mt-3 text-sm text-gray-500">Ingen reserver fundet.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {reservePlayers.map((player) => {
                  const stats = getStats(player.visningsnavn);
                  const availability = getReserveAvailability(player.visningsnavn);
                  const canUse = availability > 0;

                  return (
                    <div
                      key={player.id}
                      className="flex items-center justify-between gap-3 rounded-2xl bg-gray-50 px-3 py-2.5"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-sm font-semibold text-gray-900">
                          {player.visningsnavn}
                        </span>

                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                            canUse
                              ? "bg-green-100 text-green-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {availability > 0 ? `+${availability}` : `${availability}`}
                        </span>
                      </div>

                      <div className="flex shrink-0 items-center gap-1.5 text-xs font-bold">
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-green-700">
                          V {stats.wins}
                        </span>
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-700">
                          T {stats.losses}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
