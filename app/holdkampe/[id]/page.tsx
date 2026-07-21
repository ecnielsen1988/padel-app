"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { LoadingState, PageShell } from "@/app/components/ui";
import { supabase } from "@/lib/supabaseClient";
import { CURRENT_HOLD_SEASON } from "@/lib/holdSeasons";

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

const CURRENT_SEASON = CURRENT_HOLD_SEASON;

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

function pillClasses(tone: "neutral" | "success" | "warning" = "neutral") {
  if (tone === "success") {
    return "rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-700";
  }
  if (tone === "warning") {
    return "rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-bold text-rose-700";
  }
  return "rounded-full bg-[#eceef2] px-2.5 py-1 text-[11px] font-bold text-[#656b79]";
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
  const currentTime = new Intl.DateTimeFormat("da-DK", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

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
    return <LoadingState text="Henter hold..." />;
  }

  if (error || !hold) {
    return (
      <PageShell className="bg-[#1a1a2e] px-0 py-0 md:px-6 md:py-6">
        <div className="mx-auto flex min-h-screen w-full max-w-[820px] flex-col overflow-hidden bg-[#f4f5f7] md:min-h-[min(100vh,980px)] md:rounded-[34px] md:border md:border-white/10 md:shadow-[0_28px_80px_rgba(0,0,0,0.35)]">
          <header className="bg-gradient-to-br from-[#f01f78] to-[#c0135a] px-4 pb-5 pt-4 text-white md:px-6">
            <div className="mb-4 flex items-center justify-between text-[11px] font-semibold opacity-90">
              <span>Padelhuset</span>
              <span>{currentTime}</span>
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/75">Hold</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight">Holdside</h1>
          </header>

          <div className="flex-1 px-4 pb-10 pt-4 md:px-6">
            <section className="rounded-[20px] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.07)]">
              <Link href="/holdkampe" className="mb-3 inline-block text-sm font-semibold text-[#f01f78]">
                ← Tilbage til holdkampe
              </Link>
              <p className="text-sm text-red-600">Fejl: {error ?? "Hold ikke fundet"}</p>
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
                  else window.location.href = "/holdkampe";
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
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/75">Hold</p>
              <h1 className="mt-1 text-2xl font-black tracking-tight">{hold.name}</h1>
              <p className="mt-2 text-sm text-white/80">{hold.division} • {hold.season}</p>
            </div>

            <div className="rounded-[18px] bg-white/14 px-3 py-3 text-white">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">Kampe</p>
              <p className="mt-1 text-xl font-black">{kampe.length}</p>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 pb-28 pt-4 md:px-6">
          <div className="space-y-4">
            <section className="rounded-[20px] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.07)]">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-[13px] font-bold uppercase tracking-[0.12em] text-[#2d3340]">Holdets kampe</h2>
                <span className="text-xs font-bold text-[#f01f78]">Sorterede efter dato</span>
              </div>

              {kampe.length === 0 ? (
                <div className="rounded-[18px] bg-[#fbfbfc] p-4 text-sm text-[#6d7280]">
                  Der er ikke oprettet kampe endnu.
                </div>
              ) : (
                <div className="space-y-3">
                  {kampe.map((kamp) => {
                    const signupCount = getSignupCount(kamp.id);
                    const enoughPlayers = signupCount >= 6;
                    const won = isWin(kamp);
                    const lost = isLoss(kamp);

                    return (
                      <Link
                        key={kamp.id}
                        href={`/holdkampe/kamp/${kamp.id}`}
                        className="block rounded-[18px] bg-[#fbfbfc] p-4 shadow-[0_1px_8px_rgba(0,0,0,0.04)] transition hover:-translate-y-0.5"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <h3 className="text-sm font-extrabold text-[#1f2430]">
                              {kamp.home_away === "home"
                                ? `${hold.name} vs. ${kamp.opponent}`
                                : `${kamp.opponent} vs. ${hold.name}`}
                            </h3>

                            <p className="mt-1 text-xs leading-snug text-[#838999]">
                              {formatDate(kamp.match_date)}
                              {kamp.location ? ` • ${kamp.location}` : ""}
                              {kamp.round ? ` • Runde ${kamp.round}` : ""}
                            </p>

                            <div className="mt-2">
                              <span className={pillClasses(enoughPlayers ? "success" : "warning")}>
                                {signupCount} tilmeldt
                              </span>
                            </div>
                          </div>

                          <div className="shrink-0">
                            {kamp.status === "played" &&
                            kamp.result_for !== null &&
                            kamp.result_against !== null ? (
                              <span
                                className={pillClasses(
                                  won ? "success" : lost ? "warning" : "neutral"
                                )}
                              >
                                {formatDisplayedScore(kamp)}
                              </span>
                            ) : (
                              <span className={pillClasses()}>Se kamp</span>
                            )}
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="rounded-[20px] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.07)]">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-[13px] font-bold uppercase tracking-[0.12em] text-[#2d3340]">Primært hold</h2>
                <span className="text-xs font-bold text-[#f01f78]">{primaryPlayers.length} spillere</span>
              </div>

              {primaryPlayers.length === 0 ? (
                <div className="rounded-[18px] bg-[#fbfbfc] p-4 text-sm text-[#6d7280]">
                  Ingen primære spillere fundet.
                </div>
              ) : (
                <div className="space-y-3">
                  {primaryPlayers.map((player) => {
                    const stats = getStats(player.visningsnavn);

                    return (
                      <div
                        key={player.id}
                        className="flex items-center justify-between gap-3 rounded-[18px] bg-[#fbfbfc] p-4 shadow-[0_1px_8px_rgba(0,0,0,0.04)]"
                      >
                        <span className="min-w-0 truncate text-sm font-extrabold text-[#1f2430]">
                          {player.visningsnavn}
                        </span>

                        <div className="flex shrink-0 items-center gap-1.5">
                          <span className={pillClasses("success")}>V {stats.wins}</span>
                          <span className={pillClasses("warning")}>T {stats.losses}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="rounded-[20px] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.07)]">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-[13px] font-bold uppercase tracking-[0.12em] text-[#2d3340]">Reserver</h2>
                <span className="text-xs font-bold text-[#f01f78]">{reservePlayers.length} spillere</span>
              </div>

              {reservePlayers.length === 0 ? (
                <div className="rounded-[18px] bg-[#fbfbfc] p-4 text-sm text-[#6d7280]">
                  Ingen reserver fundet.
                </div>
              ) : (
                <div className="space-y-3">
                  {reservePlayers.map((player) => {
                    const stats = getStats(player.visningsnavn);
                    const availability = getReserveAvailability(player.visningsnavn);
                    const canUse = availability > 0;

                    return (
                      <div
                        key={player.id}
                        className="flex items-center justify-between gap-3 rounded-[18px] bg-[#fbfbfc] p-4 shadow-[0_1px_8px_rgba(0,0,0,0.04)]"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-sm font-extrabold text-[#1f2430]">
                            {player.visningsnavn}
                          </span>
                          <span className={pillClasses(canUse ? "success" : "warning")}>
                            {availability > 0 ? `+${availability}` : `${availability}`}
                          </span>
                        </div>

                        <div className="flex shrink-0 items-center gap-1.5">
                          <span className={pillClasses("success")}>V {stats.wins}</span>
                          <span className={pillClasses("warning")}>T {stats.losses}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
