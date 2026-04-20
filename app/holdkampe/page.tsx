"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Hold = {
  id: string;
  name: string;
  division: string;
  season: string;
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
  team_id: string;
  hold_teams?:
    | {
        name: string;
        division: string;
      }
    | {
        name: string;
        division: string;
      }[];
};

type HoldStats = {
  wins: number;
  losses: number;
};

type MatchPlayerRow = {
  match_id: string;
  status: string | null;
};

type StatsMatchRow = {
  id: string;
  season: string | null;
  match_date: string | null;
};

type PlayerStatsRow = {
  match_id: string;
  visningsnavn: string | null;
  wins: number | null;
  losses: number | null;
};

type PlayerStats = {
  visningsnavn: string;
  wins: number;
  losses: number;
  matches: number;
  winrate: number;
  lastWonMatchDate: string | null;
  lastWonMatchTs: number;
};

const CURRENT_SEASON = "2026 forår";
const INITIAL_VISIBLE_MATCHES = 3;
const INITIAL_VISIBLE_PLAYERS = 3;
const PLAYER_STATS_SEASONS = ["2025 forår", "2025 efterår", "2026 forår"];
const PLAYER_STATS_MATCH_LIMIT = 3000;
const PLAYER_STATS_ROW_LIMIT = 3000;

function formatDate(dateString: string | null) {
  if (!dateString) return "Dato mangler";

  const date = new Date(dateString);

  return new Intl.DateTimeFormat("da-DK", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatShortDate(dateString: string | null) {
  if (!dateString) return "—";

  const date = new Date(dateString);

  return new Intl.DateTimeFormat("da-DK", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(date);
}

function formatWinrate(winrate: number) {
  return `${Math.round(winrate * 100)}%`;
}

export default function HoldkampeForside() {
  const [hold, setHold] = useState<Hold[]>([]);
  const [kommendeKampe, setKommendeKampe] = useState<Kamp[]>([]);
  const [senesteKampe, setSenesteKampe] = useState<Kamp[]>([]);
  const [playerStats, setPlayerStats] = useState<PlayerStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [holdStatsMap, setHoldStatsMap] = useState<Record<string, HoldStats>>({});
  const [signupCountMap, setSignupCountMap] = useState<Record<string, number>>({});

  const [showAllUpcoming, setShowAllUpcoming] = useState(false);
  const [showAllPlayed, setShowAllPlayed] = useState(false);
  const [showAllPlayers, setShowAllPlayers] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      setLoading(true);
      setError(null);

      const [holdRes, kommendeKampeRes, senesteKampeRes, playedMatchesRes] =
        await Promise.all([
          supabase
            .from("hold_teams")
            .select("id, name, division, season")
            .eq("season", CURRENT_SEASON)
            .order("division", { ascending: true }),

          supabase
            .from("hold_matches")
            .select(`
              id,
              team_id,
              opponent,
              match_date,
              home_away,
              location,
              round,
              status,
              result_for,
              result_against,
              hold_teams (
                name,
                division
              )
            `)
            .eq("season", CURRENT_SEASON)
            .eq("status", "upcoming")
            .order("match_date", { ascending: true })
            .limit(12),

          supabase
            .from("hold_matches")
            .select(`
              id,
              team_id,
              opponent,
              match_date,
              home_away,
              location,
              round,
              status,
              result_for,
              result_against,
              hold_teams (
                name,
                division
              )
            `)
            .eq("season", CURRENT_SEASON)
            .eq("status", "played")
            .order("match_date", { ascending: false })
            .limit(12),

          supabase
            .from("hold_matches")
            .select("id, team_id, result_for, result_against")
            .eq("season", CURRENT_SEASON)
            .eq("status", "played"),
        ]);

      if (cancelled) return;

      if (holdRes.error) {
        setError(holdRes.error.message);
        setLoading(false);
        return;
      }

      if (kommendeKampeRes.error) {
        setError(kommendeKampeRes.error.message);
        setLoading(false);
        return;
      }

      if (senesteKampeRes.error) {
        setError(senesteKampeRes.error.message);
        setLoading(false);
        return;
      }

      if (playedMatchesRes.error) {
        setError(playedMatchesRes.error.message);
        setLoading(false);
        return;
      }

      const holdData = holdRes.data ?? [];
      const kommendeData = (kommendeKampeRes.data as Kamp[]) ?? [];
      const senesteData = (senesteKampeRes.data as Kamp[]) ?? [];
      const playedMatchesData = playedMatchesRes.data ?? [];

      setHold(holdData);
      setKommendeKampe(kommendeData);
      setSenesteKampe(senesteData);

      const nextHoldStatsMap: Record<string, HoldStats> = {};

      for (const team of holdData) {
        nextHoldStatsMap[team.id] = {
          wins: 0,
          losses: 0,
        };
      }

      for (const match of playedMatchesData) {
        if (!nextHoldStatsMap[match.team_id]) {
          nextHoldStatsMap[match.team_id] = { wins: 0, losses: 0 };
        }

        const resultFor = Number(match.result_for ?? 0);
        const resultAgainst = Number(match.result_against ?? 0);

        if (resultFor > resultAgainst) {
          nextHoldStatsMap[match.team_id].wins += 1;
        } else if (resultFor < resultAgainst) {
          nextHoldStatsMap[match.team_id].losses += 1;
        }
      }

      setHoldStatsMap(nextHoldStatsMap);

      const upcomingMatchIds = kommendeData.map((kamp) => kamp.id);

      if (upcomingMatchIds.length > 0) {
        const signupsRes = await supabase
          .from("hold_match_players")
          .select("match_id, status")
          .in("match_id", upcomingMatchIds)
          .eq("status", "tilmeldt");

        if (cancelled) return;

        if (signupsRes.error) {
          setError(signupsRes.error.message);
          setLoading(false);
          return;
        }

        const signupRows: MatchPlayerRow[] = signupsRes.data ?? [];
        const nextSignupCountMap: Record<string, number> = {};

        for (const row of signupRows) {
          nextSignupCountMap[row.match_id] =
            (nextSignupCountMap[row.match_id] ?? 0) + 1;
        }

        setSignupCountMap(nextSignupCountMap);
      } else {
        setSignupCountMap({});
      }

      const statsMatchesRes = await supabase
        .from("hold_matches")
        .select("id, season, match_date")
        .in("season", PLAYER_STATS_SEASONS)
        .range(0, PLAYER_STATS_MATCH_LIMIT - 1);

      if (cancelled) return;

      if (statsMatchesRes.error) {
        setError(statsMatchesRes.error.message);
        setLoading(false);
        return;
      }

      const statsMatches: StatsMatchRow[] = statsMatchesRes.data ?? [];
      const statsMatchIds = statsMatches.map((match) => match.id);

      if (statsMatchIds.length === 0) {
        setPlayerStats([]);
        setLoading(false);
        return;
      }

      const matchMetaById = Object.fromEntries(
        statsMatches.map((match) => [match.id, match])
      ) as Record<string, StatsMatchRow>;

      const playerStatsRes = await supabase
        .from("hold_match_players")
        .select(`
          match_id,
          visningsnavn,
          wins,
          losses
        `)
        .in("match_id", statsMatchIds)
        .not("visningsnavn", "is", null)
        .or("wins.gt.0,losses.gt.0")
        .range(0, PLAYER_STATS_ROW_LIMIT - 1);

      if (cancelled) return;

      if (playerStatsRes.error) {
        setError(playerStatsRes.error.message);
        setLoading(false);
        return;
      }

      const playerRows: PlayerStatsRow[] = playerStatsRes.data ?? [];
      const statsMap: Record<string, PlayerStats> = {};

      for (const row of playerRows) {
        const name = row.visningsnavn?.trim();
        if (!name) continue;

        const joinedMatch = matchMetaById[row.match_id];
        const season = joinedMatch?.season ?? null;
        const matchDate = joinedMatch?.match_date ?? null;

        if (!season || !PLAYER_STATS_SEASONS.includes(season)) continue;

        const rowWins = Number(row.wins ?? 0);
        const rowLosses = Number(row.losses ?? 0);
        const matchTs = matchDate ? new Date(matchDate).getTime() : 0;

        if (!statsMap[name]) {
          statsMap[name] = {
            visningsnavn: name,
            wins: 0,
            losses: 0,
            matches: 0,
            winrate: 0,
            lastWonMatchDate: null,
            lastWonMatchTs: 0,
          };
        }

        statsMap[name].wins += rowWins;
        statsMap[name].losses += rowLosses;

        if (rowWins > 0 && matchTs > statsMap[name].lastWonMatchTs) {
          statsMap[name].lastWonMatchTs = matchTs;
          statsMap[name].lastWonMatchDate = matchDate;
        }
      }

      const sortedPlayerStats = Object.values(statsMap)
        .map((player) => {
          const matches = player.wins + player.losses;

          return {
            ...player,
            matches,
            winrate: matches > 0 ? player.wins / matches : 0,
          };
        })
        .filter((player) => player.matches > 0)
        .sort((a, b) => {
          if (b.winrate !== a.winrate) return b.winrate - a.winrate;
          if (b.matches !== a.matches) return b.matches - a.matches;
          if (b.lastWonMatchTs !== a.lastWonMatchTs) {
            return b.lastWonMatchTs - a.lastWonMatchTs;
          }
          return a.visningsnavn.localeCompare(b.visningsnavn, "da");
        });

      setPlayerStats(sortedPlayerStats);
      setLoading(false);
    }

    fetchData();

    return () => {
      cancelled = true;
    };
  }, []);

  function getTeamStats(teamId: string) {
    return holdStatsMap[teamId] ?? { wins: 0, losses: 0 };
  }

  function getSignupCount(matchId: string) {
    return signupCountMap[matchId] ?? 0;
  }

  function getTeamRelation(kamp: Kamp) {
    return Array.isArray(kamp.hold_teams) ? kamp.hold_teams[0] : kamp.hold_teams;
  }

  function isWon(kamp: Kamp) {
    if (kamp.result_for === null || kamp.result_against === null) return false;
    return kamp.result_for > kamp.result_against;
  }

  function isLost(kamp: Kamp) {
    if (kamp.result_for === null || kamp.result_against === null) return false;
    return kamp.result_for < kamp.result_against;
  }

  function formatDisplayedScore(kamp: Kamp) {
    if (kamp.result_for === null || kamp.result_against === null) return "—";

    return kamp.home_away === "home"
      ? `${kamp.result_for}-${kamp.result_against}`
      : `${kamp.result_against}-${kamp.result_for}`;
  }

  const visibleUpcoming = showAllUpcoming
    ? kommendeKampe
    : kommendeKampe.slice(0, INITIAL_VISIBLE_MATCHES);

  const visiblePlayed = showAllPlayed
    ? senesteKampe
    : senesteKampe.slice(0, INITIAL_VISIBLE_MATCHES);

  const visiblePlayers = showAllPlayers
    ? playerStats
    : playerStats.slice(0, INITIAL_VISIBLE_PLAYERS);

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-pink-50 to-white p-3 md:p-6">
        <div className="mx-auto max-w-5xl rounded-2xl bg-white p-4 shadow-sm ring-1 ring-pink-100">
          <h1 className="text-2xl font-bold text-pink-700">Holdkampe</h1>
          <p className="mt-1 text-sm text-gray-500">Henter hold og kampe...</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-pink-50 to-white p-3 md:p-6">
        <div className="mx-auto max-w-5xl rounded-2xl bg-white p-4 shadow-sm ring-1 ring-pink-100">
          <h1 className="text-2xl font-bold text-pink-700">Holdkampe</h1>
          <p className="mt-1 text-sm text-red-600">Fejl: {error}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-pink-50 to-white p-3 md:p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-pink-100">
          <div>
            <h1 className="text-2xl font-bold text-pink-700">Holdkampe</h1>
            <p className="mt-1 text-sm text-gray-600">
              Overblik for sæsonen {CURRENT_SEASON}
            </p>
          </div>
        </div>

        <section>
          <h2 className="mb-3 text-lg font-bold text-gray-800">Vælg hold</h2>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {hold.map((team) => {
              const stats = getTeamStats(team.id);

              return (
                <Link
                  key={team.id}
                  href={`/holdkampe/${team.id}`}
                  className="rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-pink-100 transition hover:shadow-md"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-bold text-pink-700 sm:text-base">
                        {team.name}
                      </h3>
                      <p className="truncate text-xs text-gray-500">{team.division}</p>
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
                </Link>
              );
            })}
          </div>
        </section>

        <section>
          <div className="mb-3">
            <h2 className="text-lg font-bold text-gray-800">Kommende kampe</h2>
            <p className="text-xs text-gray-500">De næste holdkampe</p>
          </div>

          {kommendeKampe.length === 0 ? (
            <div className="rounded-2xl bg-white p-5 text-center shadow-sm ring-1 ring-pink-100">
              <div className="text-3xl">📅</div>
              <p className="mt-2 text-sm text-gray-600">Der er ikke oprettet kampe endnu.</p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {visibleUpcoming.map((kamp) => {
                  const team = getTeamRelation(kamp);
                  const signupCount = getSignupCount(kamp.id);
                  const enoughPlayers = signupCount >= 6;

                  return (
                    <Link
                      key={kamp.id}
                      href={`/holdkampe/kamp/${kamp.id}`}
                      className="block rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-pink-100 transition hover:shadow-md"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-semibold text-pink-700">
                            {team?.name ?? "Ukendt hold"} • {team?.division ?? ""}
                          </div>

                          <div className="mt-0.5 text-sm font-bold text-gray-900">
                            {kamp.home_away === "home"
                              ? `${team?.name ?? "Hold"} vs. ${kamp.opponent}`
                              : `${kamp.opponent} vs. ${team?.name ?? "Hold"}`}
                          </div>

                          <div className="mt-1 text-xs leading-snug text-gray-500">
                            {formatDate(kamp.match_date)}
                            {kamp.location ? ` • ${kamp.location}` : ""}
                            {kamp.round ? ` • Runde ${kamp.round}` : ""}
                          </div>
                        </div>

                        <div
                          className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-bold ${
                            enoughPlayers
                              ? "bg-green-100 text-green-700"
                              : "bg-red-100 text-red-600"
                          }`}
                        >
                          {signupCount}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>

              {kommendeKampe.length > INITIAL_VISIBLE_MATCHES && (
                <button
                  onClick={() => setShowAllUpcoming((prev) => !prev)}
                  className="mt-3 w-full rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-pink-700 shadow-sm ring-1 ring-pink-100"
                >
                  {showAllUpcoming ? "Vis færre" : "Vis flere"}
                </button>
              )}
            </>
          )}
        </section>

        <section>
          <div className="mb-3">
            <h2 className="text-lg font-bold text-gray-800">Seneste kampe</h2>
            <p className="text-xs text-gray-500">De nyeste resultater</p>
          </div>

          {senesteKampe.length === 0 ? (
            <div className="rounded-2xl bg-white p-5 text-center shadow-sm ring-1 ring-pink-100">
              <div className="text-3xl">🏁</div>
              <p className="mt-2 text-sm text-gray-600">Der er ingen spillede kampe endnu.</p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {visiblePlayed.map((kamp) => {
                  const team = getTeamRelation(kamp);
                  const won = isWon(kamp);
                  const lost = isLost(kamp);

                  return (
                    <Link
                      key={kamp.id}
                      href={`/holdkampe/kamp/${kamp.id}`}
                      className="block rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-pink-100 transition hover:shadow-md"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-semibold text-pink-700">
                            {team?.name ?? "Ukendt hold"} • {team?.division ?? ""}
                          </div>

                          <div className="mt-0.5 text-sm font-bold text-gray-900">
                            {kamp.home_away === "home"
                              ? `${team?.name ?? "Hold"} vs. ${kamp.opponent}`
                              : `${kamp.opponent} vs. ${team?.name ?? "Hold"}`}
                          </div>

                          <div className="mt-1 text-xs leading-snug text-gray-500">
                            {formatDate(kamp.match_date)}
                            {kamp.location ? ` • ${kamp.location}` : ""}
                            {kamp.round ? ` • Runde ${kamp.round}` : ""}
                          </div>
                        </div>

                        <div
                          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${
                            won
                              ? "bg-green-100 text-green-700 ring-1 ring-green-200"
                              : lost
                              ? "bg-red-100 text-red-700 ring-1 ring-red-200"
                              : "bg-gray-100 text-gray-700 ring-1 ring-gray-200"
                          }`}
                        >
                          {formatDisplayedScore(kamp)}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>

              {senesteKampe.length > INITIAL_VISIBLE_MATCHES && (
                <button
                  onClick={() => setShowAllPlayed((prev) => !prev)}
                  className="mt-3 w-full rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-pink-700 shadow-sm ring-1 ring-pink-100"
                >
                  {showAllPlayed ? "Vis færre" : "Vis flere"}
                </button>
              )}
            </>
          )}
        </section>

        <section>
          <div className="mb-3">
            <h2 className="text-lg font-bold text-gray-800">Spiller stats</h2>
            <p className="text-xs text-gray-500">
              De seneste 3 sæsoner • sorteret efter winrate
            </p>
          </div>

          {playerStats.length === 0 ? (
            <div className="rounded-2xl bg-white p-5 text-center shadow-sm ring-1 ring-pink-100">
              <div className="text-3xl">📊</div>
              <p className="mt-2 text-sm text-gray-600">Ingen spillerstats fundet endnu.</p>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                {visiblePlayers.map((player, index) => (
                  <div
                    key={player.visningsnavn}
                    className="rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-pink-100"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-pink-100 px-2 py-0.5 text-[11px] font-bold text-pink-700">
                            #{index + 1}
                          </span>
                          <div className="truncate text-sm font-bold text-gray-900">
                            {player.visningsnavn}
                          </div>
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs font-semibold">
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-green-700">
                            V {player.wins}
                          </span>
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-700">
                            T {player.losses}
                          </span>
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-700">
                            {player.matches} kampe
                          </span>
                        </div>

                        <div className="mt-1 text-xs text-gray-500">
                          Seneste vundne kamp: {formatShortDate(player.lastWonMatchDate)}
                        </div>
                      </div>

                      <div className="shrink-0 rounded-full bg-pink-100 px-3 py-1 text-sm font-bold text-pink-700">
                        {formatWinrate(player.winrate)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {playerStats.length > INITIAL_VISIBLE_PLAYERS && (
                <button
                  onClick={() => setShowAllPlayers((prev) => !prev)}
                  className="mt-3 w-full rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-pink-700 shadow-sm ring-1 ring-pink-100"
                >
                  {showAllPlayers ? "Vis færre" : "Vis flere"}
                </button>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}
