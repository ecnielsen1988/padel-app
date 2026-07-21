"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LoadingState, PageHeader, PageShell, StatusPill } from "@/app/components/ui";
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

  if (loading) {
    return <LoadingState text="Henter hold og kampe..." />;
  }

  if (error) {
    return (
      <PageShell>
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
          <PageHeader
            eyebrow="Holdkampe"
            title="Holdkampe"
            description={`Overblik for sæsonen ${CURRENT_SEASON}`}
          />
          <section className="padel-surface">
            <p className="text-sm font-semibold text-rose-700">Fejl: {error}</p>
          </section>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
        <PageHeader
          eyebrow="Holdkampe"
          title="Holdkampe"
          description={`Overblik for sæsonen ${CURRENT_SEASON}`}
          action={
            <div className="grid min-w-[240px] grid-cols-2 gap-3">
              <div className="rounded-[22px] border border-white/15 bg-white/10 px-4 py-3 text-white backdrop-blur">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/75">
                  Hold
                </div>
                <div className="mt-1 text-2xl font-black">{hold.length}</div>
              </div>
              <div className="rounded-[22px] border border-white/15 bg-white/10 px-4 py-3 text-white backdrop-blur">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/75">
                  Kampe
                </div>
                <div className="mt-1 text-2xl font-black">
                  {kommendeKampe.length + senesteKampe.length}
                </div>
              </div>
            </div>
          }
        />

        <section className="padel-surface">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <p className="padel-eyebrow">Sæsonens hold</p>
              <h2 className="text-2xl font-black tracking-tight text-slate-900">Vælg hold</h2>
            </div>
            <p className="text-sm text-slate-500">Gå direkte ind på holdets side</p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {hold.map((team) => {
              const stats = getTeamStats(team.id);

              return (
                <Link
                  key={team.id}
                  href={`/holdkampe/${team.id}`}
                  className="group rounded-[24px] border border-slate-200/80 bg-[linear-gradient(135deg,#ffffff_0%,#fff5f8_100%)] px-4 py-4 shadow-[0_10px_30px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_36px_rgba(240,31,120,0.14)]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        {team.division}
                      </div>
                      <h3 className="mt-1 truncate text-base font-black tracking-tight text-slate-900 group-hover:text-[#d61b6f]">
                        {team.name}
                      </h3>
                    </div>

                    <div className="flex shrink-0 items-center gap-2 text-xs font-bold">
                      <StatusPill tone="success">V {stats.wins}</StatusPill>
                      <StatusPill tone="warning">T {stats.losses}</StatusPill>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="padel-surface">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <p className="padel-eyebrow">Næste opgør</p>
              <h2 className="text-2xl font-black tracking-tight text-slate-900">Kommende kampe</h2>
            </div>
            <p className="text-sm text-slate-500">De næste holdkampe</p>
          </div>

          {kommendeKampe.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
              <div className="text-3xl">📅</div>
              <p className="mt-2 text-sm text-slate-600">Der er ikke oprettet kampe endnu.</p>
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
                      className="block rounded-[24px] border border-slate-200/80 bg-white px-4 py-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_34px_rgba(15,23,42,0.10)]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                            {team?.name ?? "Ukendt hold"} • {team?.division ?? ""}
                          </div>

                          <div className="mt-1 text-base font-black tracking-tight text-slate-900">
                            {kamp.home_away === "home"
                              ? `${team?.name ?? "Hold"} vs. ${kamp.opponent}`
                              : `${kamp.opponent} vs. ${team?.name ?? "Hold"}`}
                          </div>

                          <div className="mt-2 text-sm leading-snug text-slate-500">
                            {formatDate(kamp.match_date)}
                            {kamp.location ? ` • ${kamp.location}` : ""}
                            {kamp.round ? ` • Runde ${kamp.round}` : ""}
                          </div>
                        </div>

                        <div className={enoughPlayers ? "shrink-0" : "shrink-0"}>
                          <StatusPill tone={enoughPlayers ? "success" : "warning"}>
                          {signupCount}
                          </StatusPill>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>

              {kommendeKampe.length > INITIAL_VISIBLE_MATCHES && (
                <button
                  onClick={() => setShowAllUpcoming((prev) => !prev)}
                  className="mt-4 w-full rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
                >
                  {showAllUpcoming ? "Vis færre" : "Vis flere"}
                </button>
              )}
            </>
          )}
        </section>

        <section className="padel-surface">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <p className="padel-eyebrow">Seneste resultater</p>
              <h2 className="text-2xl font-black tracking-tight text-slate-900">Seneste kampe</h2>
            </div>
            <p className="text-sm text-slate-500">De nyeste resultater</p>
          </div>

          {senesteKampe.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
              <div className="text-3xl">🏁</div>
              <p className="mt-2 text-sm text-slate-600">Der er ingen spillede kampe endnu.</p>
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
                      className="block rounded-[24px] border border-slate-200/80 bg-white px-4 py-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_34px_rgba(15,23,42,0.10)]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                            {team?.name ?? "Ukendt hold"} • {team?.division ?? ""}
                          </div>

                          <div className="mt-1 text-base font-black tracking-tight text-slate-900">
                            {kamp.home_away === "home"
                              ? `${team?.name ?? "Hold"} vs. ${kamp.opponent}`
                              : `${kamp.opponent} vs. ${team?.name ?? "Hold"}`}
                          </div>

                          <div className="mt-2 text-sm leading-snug text-slate-500">
                            {formatDate(kamp.match_date)}
                            {kamp.location ? ` • ${kamp.location}` : ""}
                            {kamp.round ? ` • Runde ${kamp.round}` : ""}
                          </div>
                        </div>

                        <div className="shrink-0">
                          <StatusPill tone={getResultTone(kamp)}>
                          {formatDisplayedScore(kamp)}
                          </StatusPill>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>

              {senesteKampe.length > INITIAL_VISIBLE_MATCHES && (
                <button
                  onClick={() => setShowAllPlayed((prev) => !prev)}
                  className="mt-4 w-full rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
                >
                  {showAllPlayed ? "Vis færre" : "Vis flere"}
                </button>
              )}
            </>
          )}
        </section>

        <section className="padel-surface">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <p className="padel-eyebrow">Form og resultater</p>
              <h2 className="text-2xl font-black tracking-tight text-slate-900">Spiller stats</h2>
            </div>
            <p className="max-w-md text-right text-sm text-slate-500">
              {PLAYER_STATS_SEASONS.map(formatSeasonLabel).join(" • ")} • sorteret efter winrate
            </p>
          </div>

          {playerStats.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
              <div className="text-3xl">📊</div>
              <p className="mt-2 text-sm text-slate-600">Ingen spillerstats fundet endnu.</p>
            </div>
          ) : (
            <>
              <div className="space-y-3">
                {visiblePlayers.map((player, index) => (
                  <div
                    key={player.visningsnavn}
                    className="rounded-[24px] border border-slate-200/80 bg-white px-4 py-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-[#fff0f6] px-2.5 py-1 text-[11px] font-black text-[#d61b6f]">
                            #{index + 1}
                          </span>
                          <div className="truncate text-base font-black tracking-tight text-slate-900">
                            {player.visningsnavn}
                          </div>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold">
                          <StatusPill tone="success">V {player.wins}</StatusPill>
                          <StatusPill tone="warning">T {player.losses}</StatusPill>
                          <StatusPill>{player.matches} kampe</StatusPill>
                        </div>

                        <div className="mt-2 text-sm text-slate-500">
                          Seneste vundne kamp: {formatShortDate(player.lastWonMatchDate)}
                        </div>
                      </div>

                      <div className="shrink-0 rounded-full bg-[#fff0f6] px-3 py-1.5 text-sm font-black text-[#d61b6f]">
                        {formatWinrate(player.winrate)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {playerStats.length > INITIAL_VISIBLE_PLAYERS && (
                <button
                  onClick={() => setShowAllPlayers((prev) => !prev)}
                  className="mt-4 w-full rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
                >
                  {showAllPlayers ? "Vis færre" : "Vis flere"}
                </button>
              )}
            </>
          )}
        </section>
      </div>
    </PageShell>
  );
}
