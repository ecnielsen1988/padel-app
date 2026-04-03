"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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

export default function HoldkampeForside() {
  const [hold, setHold] = useState<Hold[]>([]);
  const [kommendeKampe, setKommendeKampe] = useState<Kamp[]>([]);
  const [senesteKampe, setSenesteKampe] = useState<Kamp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [holdStatsMap, setHoldStatsMap] = useState<Record<string, HoldStats>>({});
  const [signupCountMap, setSignupCountMap] = useState<Record<string, number>>({});

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

      if (upcomingMatchIds.length === 0) {
        setSignupCountMap({});
        setLoading(false);
        return;
      }

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

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-pink-50 to-white p-4 md:p-8">
        <div className="mx-auto max-w-6xl rounded-3xl bg-white p-6 shadow-sm ring-1 ring-pink-100">
          <h1 className="text-3xl font-bold text-pink-700">Holdkampe</h1>
          <p className="mt-3 text-gray-500">Henter hold og kampe...</p>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-pink-50 to-white p-4 md:p-8">
        <div className="mx-auto max-w-6xl rounded-3xl bg-white p-6 shadow-sm ring-1 ring-pink-100">
          <h1 className="text-3xl font-bold text-pink-700">Holdkampe</h1>
          <p className="mt-3 text-red-600">Fejl: {error}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-pink-50 to-white p-4 md:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-pink-100">
          <h1 className="text-3xl font-bold text-pink-700">Holdkampe</h1>
          <p className="mt-2 text-gray-600">
            Overblik over holdene og kommende kampe for sæsonen {CURRENT_SEASON}.
          </p>
        </div>

        <section className="mb-8">
          <h2 className="mb-4 text-xl font-bold text-gray-800">Vælg hold</h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {hold.map((team) => {
              const stats = getTeamStats(team.id);

              return (
                <Link
                  key={team.id}
                  href={`/holdkampe/${team.id}`}
                  className="group rounded-3xl bg-white p-5 shadow-sm ring-1 ring-pink-100 transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-xl font-bold text-pink-700 group-hover:text-pink-800">
                        {team.name}
                      </h3>
                      <p className="mt-1 text-sm text-gray-500">{team.division}</p>

                      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm font-semibold">
                        <span className="rounded-full bg-green-100 px-3 py-1 text-green-700">
                          {stats.wins} vundet
                        </span>
                        <span className="rounded-full bg-red-100 px-3 py-1 text-red-700">
                          {stats.losses} tabt
                        </span>
                      </div>
                    </div>

                    <div className="rounded-full bg-pink-100 px-3 py-1 text-xs font-semibold text-pink-700">
                      Se hold
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="mb-8">
          <h2 className="mb-1 text-xl font-bold text-gray-800">Kommende kampe</h2>
          <p className="mb-4 text-sm text-gray-500">
            Her vises næste holdkampe, når de bliver oprettet.
          </p>

          {kommendeKampe.length === 0 ? (
            <div className="rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-pink-100">
              <div className="text-4xl">📅</div>
              <h3 className="mt-3 text-lg font-bold text-gray-800">
                Der er ikke oprettet kampe endnu
              </h3>
              <p className="mt-2 text-sm text-gray-500">
                Når kampene bliver lagt ind, vil de automatisk dukke op her.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {kommendeKampe.map((kamp) => {
                const team = getTeamRelation(kamp);
                const signupCount = getSignupCount(kamp.id);
                const enoughPlayers = signupCount >= 6;

                return (
                  <Link
                    key={kamp.id}
                    href={`/holdkampe/kamp/${kamp.id}`}
                    className="block rounded-3xl bg-white p-5 shadow-sm ring-1 ring-pink-100 transition hover:shadow-md"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-pink-700">
                          {team?.name ?? "Ukendt hold"} • {team?.division ?? ""}
                        </p>

                        <h3 className="mt-1 text-lg font-bold text-gray-900">
                          {kamp.home_away === "home"
                            ? `${team?.name ?? "Hold"} vs. ${kamp.opponent}`
                            : `${kamp.opponent} vs. ${team?.name ?? "Hold"}`}
                        </h3>

                        <p className="mt-1 text-sm text-gray-500">
                          {formatDate(kamp.match_date)}
                          {kamp.location ? ` • ${kamp.location}` : ""}
                          {kamp.round ? ` • Runde ${kamp.round}` : ""}
                        </p>

                        <p
                          className={`mt-2 text-sm ${
                            enoughPlayers
                              ? "font-bold text-green-700"
                              : "font-semibold text-red-600"
                          }`}
                        >
                          {signupCount} tilmeldt
                        </p>
                      </div>

                      <div className="self-start rounded-full bg-pink-100 px-3 py-1 text-xs font-semibold text-pink-700">
                        Se kamp
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-1 text-xl font-bold text-gray-800">Seneste kampe</h2>
          <p className="mb-4 text-sm text-gray-500">
            De senest spillede holdkampe vises her med nyeste først.
          </p>

          {senesteKampe.length === 0 ? (
            <div className="rounded-3xl bg-white p-8 text-center shadow-sm ring-1 ring-pink-100">
              <div className="text-4xl">🏁</div>
              <h3 className="mt-3 text-lg font-bold text-gray-800">
                Der er ingen spillede kampe endnu
              </h3>
              <p className="mt-2 text-sm text-gray-500">
                Når de første holdkampe er spillet, vil de dukke op her.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {senesteKampe.map((kamp) => {
                const team = getTeamRelation(kamp);
                const won = isWon(kamp);
                const lost = isLost(kamp);

                return (
                  <Link
                    key={kamp.id}
                    href={`/holdkampe/kamp/${kamp.id}`}
                    className="block rounded-3xl bg-white p-5 shadow-sm ring-1 ring-pink-100 transition hover:shadow-md"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-pink-700">
                          {team?.name ?? "Ukendt hold"} • {team?.division ?? ""}
                        </p>

                        <h3 className="mt-1 text-lg font-bold text-gray-900">
                          {kamp.home_away === "home"
                            ? `${team?.name ?? "Hold"} vs. ${kamp.opponent}`
                            : `${kamp.opponent} vs. ${team?.name ?? "Hold"}`}
                        </h3>

                        <p className="mt-1 text-sm text-gray-500">
                          {formatDate(kamp.match_date)}
                          {kamp.location ? ` • ${kamp.location}` : ""}
                          {kamp.round ? ` • Runde ${kamp.round}` : ""}
                        </p>
                      </div>

                      <div
                        className={`self-start rounded-full px-4 py-2 text-sm font-bold ${
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
          )}
        </section>
      </div>
    </main>
  );
}
