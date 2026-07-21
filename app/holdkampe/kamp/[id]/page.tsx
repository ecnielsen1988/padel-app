"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { LoadingState, PageShell } from "@/app/components/ui";
import { supabase } from "@/lib/supabaseClient";

type MatchData = {
  id: string;
  team_id: string;
  opponent: string;
  match_date: string | null;
  home_away: "home" | "away";
  location: string | null;
  round: number | null;
  season: string;
  status: "upcoming" | "played";
  result_for: number | null;
  result_against: number | null;
};

type TeamData = {
  id: string;
  name: string;
  division: string;
  season: string;
};

type TeamMember = {
  id: string;
  visningsnavn: string;
  member_type: "primary" | "reserve";
  sort_order: number | null;
};

type MatchPlayerRow = {
  id?: string;
  match_id?: string;
  visningsnavn: string;
  status: "afventer" | "tilmeldt" | "afbud";
  wins: number;
  losses: number;
};

function formatDate(dateString: string | null) {
  if (!dateString) return "Dato mangler";

  const date = new Date(dateString);

  return new Intl.DateTimeFormat("da-DK", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getMatchTitle(match: MatchData, team: TeamData | null) {
  if (!team) return "";

  return match.home_away === "home"
    ? `${team.name} vs. ${match.opponent}`
    : `${match.opponent} vs. ${team.name}`;
}

function formatTeamScore(playerTotal: number) {
  return playerTotal / 2;
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

export default function HoldkampSide({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [match, setMatch] = useState<MatchData | null>(null);
  const [team, setTeam] = useState<TeamData | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [rows, setRows] = useState<Record<string, MatchPlayerRow>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      setLoading(true);
      setError(null);
      setMessage(null);

      const matchRes = await supabase
        .from("hold_matches")
        .select(`
          id,
          team_id,
          opponent,
          match_date,
          home_away,
          location,
          round,
          season,
          status,
          result_for,
          result_against
        `)
        .eq("id", id)
        .maybeSingle();

      if (cancelled) return;

      if (matchRes.error || !matchRes.data) {
        setError(matchRes.error?.message ?? "Kamp ikke fundet");
        setLoading(false);
        return;
      }

      const matchData = matchRes.data as MatchData;
      setMatch(matchData);

      const [teamRes, membersRes, playersRes] = await Promise.all([
        supabase
          .from("hold_teams")
          .select("id, name, division, season")
          .eq("id", matchData.team_id)
          .eq("season", matchData.season)
          .maybeSingle(),

        supabase
          .from("hold_team_members")
          .select("id, visningsnavn, member_type, sort_order")
          .eq("team_id", matchData.team_id)
          .eq("season", matchData.season)
          .order("sort_order", { ascending: true }),

        supabase
          .from("hold_match_players")
          .select("id, match_id, visningsnavn, status, wins, losses")
          .eq("match_id", matchData.id),
      ]);

      if (cancelled) return;

      if (teamRes.error) {
        setError(teamRes.error.message);
        setLoading(false);
        return;
      }

      if (membersRes.error) {
        setError(membersRes.error.message);
        setLoading(false);
        return;
      }

      if (playersRes.error) {
        setError(playersRes.error.message);
        setLoading(false);
        return;
      }

      if (!teamRes.data) {
        setError("Hold ikke fundet");
        setLoading(false);
        return;
      }

      const teamData = teamRes.data as TeamData;
      const memberData = (membersRes.data ?? []) as TeamMember[];
      const existingRows = (playersRes.data ?? []) as MatchPlayerRow[];

      setTeam(teamData);
      setMembers(memberData);

      const rowMap: Record<string, MatchPlayerRow> = {};

      for (const member of memberData) {
        rowMap[member.visningsnavn] = {
          visningsnavn: member.visningsnavn,
          status: "afventer",
          wins: 0,
          losses: 0,
        };
      }

      for (const row of existingRows) {
        rowMap[row.visningsnavn] = {
          id: row.id,
          match_id: row.match_id,
          visningsnavn: row.visningsnavn,
          status: row.status,
          wins: Number(row.wins ?? 0),
          losses: Number(row.losses ?? 0),
        };
      }

      setRows(rowMap);
      setLoading(false);
    }

    fetchData();

    return () => {
      cancelled = true;
    };
  }, [id]);

  const primaryPlayers = useMemo(
    () => members.filter((m) => m.member_type === "primary"),
    [members]
  );

  const reservePlayers = useMemo(
    () => members.filter((m) => m.member_type === "reserve"),
    [members]
  );

  const playerWinsTotal = useMemo(() => {
    return Object.values(rows).reduce((sum, row) => sum + Number(row.wins || 0), 0);
  }, [rows]);

  const playerLossesTotal = useMemo(() => {
    return Object.values(rows).reduce((sum, row) => sum + Number(row.losses || 0), 0);
  }, [rows]);

  const resultFor = useMemo(() => formatTeamScore(playerWinsTotal), [playerWinsTotal]);
  const resultAgainst = useMemo(
    () => formatTeamScore(playerLossesTotal),
    [playerLossesTotal]
  );
  const currentTime = new Intl.DateTimeFormat("da-DK", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

  function updateStatus(visningsnavn: string, status: "afventer" | "tilmeldt" | "afbud") {
    setRows((prev) => ({
      ...prev,
      [visningsnavn]: {
        ...(prev[visningsnavn] ?? {
          visningsnavn,
          wins: 0,
          losses: 0,
        }),
        status,
      },
    }));
  }

  function updateNumberField(
    visningsnavn: string,
    field: "wins" | "losses",
    value: string
  ) {
    const parsed = Math.max(0, Number(value || 0));

    setRows((prev) => ({
      ...prev,
      [visningsnavn]: {
        ...(prev[visningsnavn] ?? {
          visningsnavn,
          status: "afventer",
          wins: 0,
          losses: 0,
        }),
        [field]: Number.isFinite(parsed) ? parsed : 0,
      },
    }));
  }

  async function handleSave() {
    if (!match) return;

    setSaving(true);
    setError(null);
    setMessage(null);

    const payload = Object.values(rows).map((row) => ({
      match_id: match.id,
      visningsnavn: row.visningsnavn,
      status: row.status,
      wins: Number(row.wins || 0),
      losses: Number(row.losses || 0),
    }));

    const { error: upsertError } = await supabase
      .from("hold_match_players")
      .upsert(payload, {
        onConflict: "match_id,visningsnavn",
      });

    if (upsertError) {
      setError(upsertError.message);
      setSaving(false);
      return;
    }

    const hasAnyResult = payload.some((row) => row.wins > 0 || row.losses > 0);

    const { error: matchUpdateError } = await supabase
      .from("hold_matches")
      .update({
        result_for: hasAnyResult ? resultFor : null,
        result_against: hasAnyResult ? resultAgainst : null,
        status: hasAnyResult ? "played" : "upcoming",
      })
      .eq("id", match.id);

    if (matchUpdateError) {
      setError(matchUpdateError.message);
      setSaving(false);
      return;
    }

    setMatch((prev) =>
      prev
        ? {
            ...prev,
            result_for: hasAnyResult ? resultFor : null,
            result_against: hasAnyResult ? resultAgainst : null,
            status: hasAnyResult ? "played" : "upcoming",
          }
        : prev
    );

    setMessage("Kampen er gemt.");
    setSaving(false);
  }

  function renderStatusButton(
    visningsnavn: string,
    currentStatus: "afventer" | "tilmeldt" | "afbud",
    statusOption: "afventer" | "tilmeldt" | "afbud",
    label: string
  ) {
    const active = currentStatus === statusOption;

    const activeClass =
      statusOption === "afventer"
        ? "bg-gray-800 text-white dark:bg-slate-200 dark:text-slate-900"
        : statusOption === "tilmeldt"
        ? "bg-green-600 text-white dark:bg-green-500 dark:text-white"
        : "bg-red-600 text-white dark:bg-red-500 dark:text-white";

    return (
      <button
        type="button"
        onClick={() => updateStatus(visningsnavn, statusOption)}
        className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition ${
          active
            ? activeClass
            : "bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-700"
        }`}
      >
        {label}
      </button>
    );
  }

  function renderPlayerRow(player: TeamMember, muted = false) {
    const row = rows[player.visningsnavn] ?? {
      visningsnavn: player.visningsnavn,
      status: "afventer" as const,
      wins: 0,
      losses: 0,
    };

    const boxBg = muted
      ? "bg-gray-50 dark:bg-slate-800/70"
      : "bg-pink-50 dark:bg-slate-800";

    return (
      <div key={player.id} className={`rounded-2xl ${boxBg} px-3 py-3`}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 lg:w-[190px]">
            <div className="truncate text-sm font-bold text-gray-900 dark:text-slate-100">
              {player.visningsnavn}
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {renderStatusButton(player.visningsnavn, row.status, "afventer", "Afventer")}
            {renderStatusButton(player.visningsnavn, row.status, "tilmeldt", "Tilmeldt")}
            {renderStatusButton(player.visningsnavn, row.status, "afbud", "Afbud")}
          </div>

          <div className="flex items-center gap-3 lg:justify-end">
            <div className="flex items-center gap-1.5">
              <label className="text-[11px] font-bold text-gray-600 dark:text-slate-300">
                V
              </label>
              <input
                type="number"
                min={0}
                value={row.wins}
                onChange={(e) =>
                  updateNumberField(player.visningsnavn, "wins", e.target.value)
                }
                className="h-8 w-12 rounded-xl border border-pink-200 bg-white px-1 text-center text-sm text-gray-900 outline-none focus:border-pink-400 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-pink-400"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <label className="text-[11px] font-bold text-gray-600 dark:text-slate-300">
                T
              </label>
              <input
                type="number"
                min={0}
                value={row.losses}
                onChange={(e) =>
                  updateNumberField(player.visningsnavn, "losses", e.target.value)
                }
                className="h-8 w-12 rounded-xl border border-pink-200 bg-white px-1 text-center text-sm text-gray-900 outline-none focus:border-pink-400 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-pink-400"
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return <LoadingState text="Henter kamp..." />;
  }

  if (error && !match) {
    return (
      <PageShell className="bg-[#1a1a2e] px-0 py-0 md:px-6 md:py-6">
        <div className="mx-auto flex min-h-screen w-full max-w-[820px] flex-col overflow-hidden bg-[#f4f5f7] md:min-h-[min(100vh,980px)] md:rounded-[34px] md:border md:border-white/10 md:shadow-[0_28px_80px_rgba(0,0,0,0.35)]">
          <header className="bg-gradient-to-br from-[#f01f78] to-[#c0135a] px-4 pb-5 pt-4 text-white md:px-6">
            <div className="mb-4 flex items-center justify-between text-[11px] font-semibold opacity-90">
              <span>Padelhuset</span>
              <span>{currentTime}</span>
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/75">Kamp</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight">Holdkamp</h1>
          </header>

          <div className="flex-1 px-4 pb-10 pt-4 md:px-6">
            <section className="rounded-[20px] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.07)]">
              <Link href="/holdkampe" className="mb-3 inline-block text-sm font-semibold text-[#f01f78]">
                ← Tilbage til holdkampe
              </Link>
              <p className="text-sm text-red-600">Fejl: {error}</p>
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
                  else window.location.href = team ? `/holdkampe/${team.id}` : "/holdkampe";
                }
              }}
              className="inline-flex items-center rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-white/25"
            >
              ← Tilbage
            </button>
            <span>{currentTime}</span>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/75">Kamp</p>
            <h1 className="text-2xl font-black tracking-tight">
              {match && team ? getMatchTitle(match, team) : "Holdkamp"}
            </h1>
            <p className="text-sm text-white/80">
              {team?.division ? `${team.division} • ` : ""}
              {match?.round ? `Runde ${match.round} • ` : ""}
              {match ? formatDate(match.match_date) : ""}
              {match?.location ? ` • ${match.location}` : ""}
            </p>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="rounded-full bg-white/18 px-3 py-1 text-sm font-bold text-white">
                Resultat: {resultFor}-{resultAgainst}
              </span>
              <span className="rounded-full bg-white/18 px-3 py-1 text-sm font-bold text-white">
                {match?.status === "played" ? "Spillet" : "Kommende"}
              </span>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 pb-32 pt-4 md:px-6">
          <div className="space-y-4">
            {message && (
              <div className="rounded-[18px] bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                {message}
              </div>
            )}

            {error && (
              <div className="rounded-[18px] bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                {error}
              </div>
            )}

            <section className="rounded-[20px] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.07)]">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-[13px] font-bold uppercase tracking-[0.12em] text-[#2d3340]">Primært hold</h2>
                <span className="text-xs font-bold text-[#f01f78]">Vælg status og V/T</span>
              </div>

              {primaryPlayers.length === 0 ? (
                <div className="rounded-[18px] bg-[#fbfbfc] p-4 text-sm text-[#6d7280]">
                  Ingen primære spillere fundet.
                </div>
              ) : (
                <div className="space-y-2">
                  {primaryPlayers.map((player) => renderPlayerRow(player))}
                </div>
              )}
            </section>

            <section className="rounded-[20px] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.07)]">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-[13px] font-bold uppercase tracking-[0.12em] text-[#2d3340]">Reserver</h2>
                <span className="text-xs font-bold text-[#f01f78]">Samme funktioner</span>
              </div>

              {reservePlayers.length === 0 ? (
                <div className="rounded-[18px] bg-[#fbfbfc] p-4 text-sm text-[#6d7280]">
                  Ingen reserver fundet.
                </div>
              ) : (
                <div className="space-y-2">
                  {reservePlayers.map((player) => renderPlayerRow(player, true))}
                </div>
              )}
            </section>
          </div>
        </div>

        <div className="sticky bottom-0 border-t border-[#ebeef3] bg-[#f4f5f7]/95 px-4 py-4 backdrop-blur md:px-6">
          <div className="rounded-[20px] bg-white p-4 shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-[#6d7280]">2 spillersejre tæller som 1 holdpoint.</div>

              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="rounded-full bg-[#f01f78] px-5 py-3 text-sm font-bold text-white transition hover:bg-[#d61b6f] disabled:opacity-60"
              >
                {saving ? "Gemmer..." : "Gem kamp"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
