"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LoadingState, PageShell } from "@/app/components/ui";
import { supabase } from "@/lib/supabaseClient";
import { CURRENT_HOLD_SEASON, getRecentHoldSeasons } from "@/lib/holdSeasons";

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

const CURRENT_SEASON = CURRENT_HOLD_SEASON;
const INITIAL_VISIBLE_MATCHES = 3;
const INITIAL_VISIBLE_PLAYERS = 3;
const PLAYER_STATS_SEASONS = getRecentHoldSeasons(CURRENT_SEASON, 3);
const PLAYER_STATS_MATCH_LIMIT = 3000;
const PLAYER_STATS_ROW_LIMIT = 3000;

function formatSeasonLabel(season: string) {
  const [year, term] = season.split(" ");
  const formattedTerm = term ? term.charAt(0).toUpperCase() + term.slice(1) : season;
  return `${formattedTerm} ${year}`;
}

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

function pillClasses(tone: "neutral" | "success" | "warning" = "neutral") {
  if (tone === "success") {
    return "rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-700";
  }
  if (tone === "warning") {
    return "rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-bold text-rose-700";
  }
  return "rounded-full bg-[#eceef2] px-2.5 py-1 text-[11px] font-bold text-[#656b79]";
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

        if (
          !season ||
          !PLAYER_STATS_SEASONS.includes(season as (typeof PLAYER_STATS_SEASONS)[number])
        ) {
          continue;
        }

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

  function getResultTone(kamp: Kamp) {
    if (isWon(kamp)) return "success";
    if (isLost(kamp)) return "warning";
    return "neutral";
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

  const currentTime = new Intl.DateTimeFormat("da-DK", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

  if (loading) {
    return <LoadingState text="Henter hold og kampe..." />;
  }

  if (error) {
    return (
      <PageShell className="bg-[#1a1a2e] px-0 py-0 md:px-6 md:py-6">
        <div className="mx-auto flex min-h-screen w-full max-w-[820px] flex-col overflow-hidden bg-[#f4f5f7] md:min-h-[min(100vh,980px)] md:rounded-[34px] md:border md:border-white/10 md:shadow-[0_28px_80px_rgba(0,0,0,0.35)]">
          <header className="bg-gradient-to-br from-[#f01f78] to-[#c0135a] px-4 pb-5 pt-4 text-white md:px-6">
            <div className="mb-4 flex items-center justify-between text-[11px] font-semibold opacity-90">
              <span>Padelhuset</span>
              <span>{currentTime}</span>
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/75">
              Holdkampe
            </p>
            <h1 className="mt-1 text-2xl font-black tracking-tight">Holdkampe</h1>
            <p className="mt-2 text-sm text-white/80">Overblik for sæsonen {CURRENT_SEASON}</p>
          </header>

          <div className="flex-1 px-4 pb-10 pt-4 md:px-6">
            <section className="rounded-[20px] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.07)]">
              <p className="text-sm font-semibold text-rose-700">Fejl: {error}</p>
            </section>
          </div>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell className="bg-[#1a1a2e] px-0 py-0 md:px-6 md:py-6">
      <div className="mx-auto flex min-h-screen w-full max-w-[820px] flex-col overflow-hidden bg-[#f4f5f7] md:min-h-[min(100vh,980px)] md:rounded-[34px] md:border md:border-white/10 md:shadow-[0_28px_80px_rgba(0,0,0,0.35)]">
        <header className="bg-gradient-to-br from-[#f01f78] to-[#c0135a] px-4 pb-5 pt-4 text-white md:px-6">
          <div className="mb-4 flex items-center justify-between text-[11px] font-semibold opacity-90">
            <button
              type="button"
              onClick={() => {
                if (typeof window !== "undefined") {
                  if (window.history.length > 1) window.history.back();
                  else window.location.href = "/";
                }
              }}
              className="inline-flex items-center rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-white/25"
            >
              ← Tilbage
            </button>
            <span>{currentTime}</span>
          </div>

          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/75">
                Holdkampe
              </p>
              <h1 className="mt-1 text-2xl font-black tracking-tight">Sæsonoverblik</h1>
              <p className="mt-2 text-sm text-white/80">{CURRENT_SEASON}</p>
            </div>

            <div className="grid min-w-[150px] grid-cols-2 gap-2">
              <div className="rounded-[18px] bg-white/14 px-3 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">
                  Hold
                </p>
                <p className="mt-1 text-xl font-black">{hold.length}</p>
              </div>
              <div className="rounded-[18px] bg-white/14 px-3 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">
                  Kampe
                </p>
                <p className="mt-1 text-xl font-black">
                  {kommendeKampe.length + senesteKampe.length}
                </p>
              </div>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 pb-28 pt-4 md:px-6">
          <div className="space-y-4">
            <section className="rounded-[20px] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.07)]">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-[13px] font-bold uppercase tracking-[0.12em] text-[#2d3340]">
                  Vælg hold
                </h2>
                <span className="text-xs font-bold text-[#f01f78]">Gå til holdsiden</span>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {hold.map((team) => {
                  const stats = getTeamStats(team.id);

                  return (
                    <Link
                      key={team.id}
                      href={`/holdkampe/${team.id}`}
                      className="rounded-[18px] bg-[#fbfbfc] p-4 shadow-[0_1px_8px_rgba(0,0,0,0.04)] transition hover:-translate-y-0.5"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs text-[#838999]">{team.division}</p>
                          <h3 className="mt-1 truncate text-sm font-extrabold text-[#1f2430]">
                            {team.name}
                          </h3>
                        </div>

                        <div className="flex shrink-0 items-center gap-1.5">
                          <span className={pillClasses("success")}>V {stats.wins}</span>
                          <span className={pillClasses("warning")}>T {stats.losses}</span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>

            <section className="rounded-[20px] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.07)]">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-[13px] font-bold uppercase tracking-[0.12em] text-[#2d3340]">
                  Kommende kampe
                </h2>
                <span className="text-xs font-bold text-[#f01f78]">Næste opgør</span>
              </div>

              {kommendeKampe.length === 0 ? (
                <div className="rounded-[18px] bg-[#fbfbfc] p-4 text-sm text-[#6d7280]">
                  Der er ikke oprettet kampe endnu.
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    {visibleUpcoming.map((kamp) => {
                      const team = getTeamRelation(kamp);
                      const signupCount = getSignupCount(kamp.id);
                      const enoughPlayers = signupCount >= 6;

                      return (
                        <Link
                          key={kamp.id}
                          href={`/holdkampe/kamp/${kamp.id}`}
                          className="block rounded-[18px] bg-[#fbfbfc] p-4 shadow-[0_1px_8px_rgba(0,0,0,0.04)] transition hover:-translate-y-0.5"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-xs font-semibold text-[#f01f78]">
                                {team?.name ?? "Ukendt hold"} • {team?.division ?? ""}
                              </div>

                              <div className="mt-1 text-sm font-extrabold text-[#1f2430]">
                                {kamp.home_away === "home"
                                  ? `${team?.name ?? "Hold"} vs. ${kamp.opponent}`
                                  : `${kamp.opponent} vs. ${team?.name ?? "Hold"}`}
                              </div>

                              <div className="mt-1 text-xs leading-snug text-[#838999]">
                                {formatDate(kamp.match_date)}
                                {kamp.location ? ` • ${kamp.location}` : ""}
                                {kamp.round ? ` • Runde ${kamp.round}` : ""}
                              </div>
                            </div>

                            <span className={pillClasses(enoughPlayers ? "success" : "warning")}>
                              {signupCount}
                            </span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>

                  {kommendeKampe.length > INITIAL_VISIBLE_MATCHES && (
                    <button
                      onClick={() => setShowAllUpcoming((prev) => !prev)}
                      className="mt-3 w-full rounded-[14px] bg-[#fff0f5] px-4 py-2.5 text-sm font-bold text-[#f01f78]"
                    >
                      {showAllUpcoming ? "Vis færre" : "Vis flere"}
                    </button>
                  )}
                </>
              )}
            </section>

            <section className="rounded-[20px] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.07)]">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-[13px] font-bold uppercase tracking-[0.12em] text-[#2d3340]">
                  Seneste kampe
                </h2>
                <span className="text-xs font-bold text-[#f01f78]">Resultater</span>
              </div>

              {senesteKampe.length === 0 ? (
                <div className="rounded-[18px] bg-[#fbfbfc] p-4 text-sm text-[#6d7280]">
                  Der er ingen spillede kampe endnu.
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    {visiblePlayed.map((kamp) => {
                      const team = getTeamRelation(kamp);

                      return (
                        <Link
                          key={kamp.id}
                          href={`/holdkampe/kamp/${kamp.id}`}
                          className="block rounded-[18px] bg-[#fbfbfc] p-4 shadow-[0_1px_8px_rgba(0,0,0,0.04)] transition hover:-translate-y-0.5"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-xs font-semibold text-[#f01f78]">
                                {team?.name ?? "Ukendt hold"} • {team?.division ?? ""}
                              </div>

                              <div className="mt-1 text-sm font-extrabold text-[#1f2430]">
                                {kamp.home_away === "home"
                                  ? `${team?.name ?? "Hold"} vs. ${kamp.opponent}`
                                  : `${kamp.opponent} vs. ${team?.name ?? "Hold"}`}
                              </div>

                              <div className="mt-1 text-xs leading-snug text-[#838999]">
                                {formatDate(kamp.match_date)}
                                {kamp.location ? ` • ${kamp.location}` : ""}
                                {kamp.round ? ` • Runde ${kamp.round}` : ""}
                              </div>
                            </div>

                            <span className={pillClasses(getResultTone(kamp))}>
                              {formatDisplayedScore(kamp)}
                            </span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>

                  {senesteKampe.length > INITIAL_VISIBLE_MATCHES && (
                    <button
                      onClick={() => setShowAllPlayed((prev) => !prev)}
                      className="mt-3 w-full rounded-[14px] bg-[#fff0f5] px-4 py-2.5 text-sm font-bold text-[#f01f78]"
                    >
                      {showAllPlayed ? "Vis færre" : "Vis flere"}
                    </button>
                  )}
                </>
              )}
            </section>

            <section className="rounded-[20px] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.07)]">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-[13px] font-bold uppercase tracking-[0.12em] text-[#2d3340]">
                  Spiller stats
                </h2>
                <span className="text-right text-[11px] font-semibold text-[#838999]">
                  {PLAYER_STATS_SEASONS.map(formatSeasonLabel).join(" • ")}
                </span>
              </div>

              {playerStats.length === 0 ? (
                <div className="rounded-[18px] bg-[#fbfbfc] p-4 text-sm text-[#6d7280]">
                  Ingen spillerstats fundet endnu.
                </div>
              ) : (
                <>
                  <div className="space-y-3">
                    {visiblePlayers.map((player, index) => (
                      <div
                        key={player.visningsnavn}
                        className="rounded-[18px] bg-[#fbfbfc] p-4 shadow-[0_1px_8px_rgba(0,0,0,0.04)]"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="rounded-full bg-[#fff0f5] px-2.5 py-1 text-[11px] font-bold text-[#f01f78]">
                                #{index + 1}
                              </span>
                              <div className="truncate text-sm font-extrabold text-[#1f2430]">
                                {player.visningsnavn}
                              </div>
                            </div>

                            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs font-semibold">
                              <span className={pillClasses("success")}>V {player.wins}</span>
                              <span className={pillClasses("warning")}>T {player.losses}</span>
                              <span className={pillClasses()}>{player.matches} kampe</span>
                            </div>

                            <div className="mt-2 text-xs text-[#838999]">
                              Seneste vundne kamp: {formatShortDate(player.lastWonMatchDate)}
                            </div>
                          </div>

                          <div className="shrink-0 rounded-full bg-[#fff0f5] px-3 py-1.5 text-sm font-black text-[#f01f78]">
                            {formatWinrate(player.winrate)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {playerStats.length > INITIAL_VISIBLE_PLAYERS && (
                    <button
                      onClick={() => setShowAllPlayers((prev) => !prev)}
                      className="mt-3 w-full rounded-[14px] bg-[#fff0f5] px-4 py-2.5 text-sm font-bold text-[#f01f78]"
                    >
                      {showAllPlayers ? "Vis færre" : "Vis flere"}
                    </button>
                  )}
                </>
              )}
            </section>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
