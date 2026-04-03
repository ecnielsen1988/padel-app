"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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

const CURRENT_SEASON = "2026 forår";

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

export default function HoldkampSide({
  params,
}: {
  params: { id: string };
}) {
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
        .eq("id", params.id)
        .eq("season", CURRENT_SEASON)
        .single();

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
          .eq("season", CURRENT_SEASON)
          .single(),

        supabase
          .from("hold_team_members")
          .select("id, visningsnavn, member_type, sort_order")
          .eq("team_id", matchData.team_id)
          .eq("season", CURRENT_SEASON)
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
  }, [params.id]);

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
  const resultAgainst = useMemo(() => formatTeamScore(playerLossesTotal), [playerLossesTotal]);

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
        ? "bg-gray-800 text-white"
        : statusOption === "tilmeldt"
        ? "bg-green-600 text-white"
        : "bg-red-600 text-white";

    return (
      <button
        type="button"
        onClick={() => updateStatus(visningsnavn, statusOption)}
        className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
          active
            ? activeClass
            : "bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-100"
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

    const boxBg = muted ? "bg-gray-50" : "bg-pink-50";

    return (
      <div
        key={player.id}
        className={`rounded-2xl ${boxBg} px-4 py-3`}
      >
        <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3">
          <div className="min-w-0">
            <div className="truncate font-semibold text-gray-900">
              {player.visningsnavn}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {renderStatusButton(player.visningsnavn, row.status, "afventer", "Afventer")}
            {renderStatusButton(player.visningsnavn, row.status, "tilmeldt", "Tilmeldt")}
            {renderStatusButton(player.visningsnavn, row.status, "afbud", "Afbud")}
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-end gap-2">
              <label className="w-4 text-right text-xs font-medium text-gray-600">V</label>
              <input
                type="number"
                min={0}
                value={row.wins}
                onChange={(e) =>
                  updateNumberField(player.visningsnavn, "wins", e.target.value)
                }
                className="h-8 w-12 rounded-xl border border-pink-200 bg-white px-1 text-center text-sm outline-none focus:border-pink-400"
              />
            </div>

            <div className="flex items-center justify-end gap-2">
              <label className="w-4 text-right text-xs font-medium text-gray-600">T</label>
              <input
                type="number"
                min={0}
                value={row.losses}
                onChange={(e) =>
                  updateNumberField(player.visningsnavn, "losses", e.target.value)
                }
                className="h-8 w-12 rounded-xl border border-pink-200 bg-white px-1 text-center text-sm outline-none focus:border-pink-400"
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-pink-50 to-white p-4 md:p-8">
        <div className="mx-auto max-w-5xl rounded-3xl bg-white p-6 shadow-sm ring-1 ring-pink-100">
          <p className="text-gray-500">Henter kamp...</p>
        </div>
      </main>
    );
  }

  if (error && !match) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-pink-50 to-white p-4 md:p-8">
        <div className="mx-auto max-w-5xl rounded-3xl bg-white p-6 shadow-sm ring-1 ring-pink-100">
          <Link
            href="/holdkampe"
            className="mb-4 inline-block text-sm font-semibold text-pink-700 hover:underline"
          >
            ← Tilbage til holdkampe
          </Link>
          <p className="text-red-600">Fejl: {error}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-pink-50 to-white p-4 md:p-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-pink-100">
          <Link
            href={team ? `/holdkampe/${team.id}` : "/holdkampe"}
            className="mb-4 inline-block text-sm font-semibold text-pink-700 hover:underline"
          >
            ← Tilbage
          </Link>

          <h1 className="text-3xl font-bold text-pink-700">
            {match && team ? getMatchTitle(match, team) : "Holdkamp"}
          </h1>

          <p className="mt-2 text-gray-600">
            {team?.division ? `${team.division} • ` : ""}
            {match?.round ? `Runde ${match.round} • ` : ""}
            {match ? formatDate(match.match_date) : ""}
            {match?.location ? ` • ${match.location}` : ""}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="rounded-full bg-pink-100 px-4 py-2 text-sm font-semibold text-pink-700">
              Resultat: {resultFor}-{resultAgainst}
            </div>

            <div
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                match?.status === "played"
                  ? "bg-green-100 text-green-700"
                  : "bg-gray-100 text-gray-700"
              }`}
            >
              {match?.status === "played" ? "Spillet" : "Kommende"}
            </div>
          </div>
        </div>

        {message && (
          <div className="mb-4 rounded-2xl bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
            {message}
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {error}
          </div>
        )}

        <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-pink-100">
            <h2 className="text-xl font-bold text-gray-800">Primært hold</h2>

            {primaryPlayers.length === 0 ? (
              <p className="mt-4 text-sm text-gray-500">
                Ingen primære spillere fundet.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {primaryPlayers.map((player) => renderPlayerRow(player))}
              </div>
            )}
          </section>

          <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-pink-100">
            <h2 className="text-xl font-bold text-gray-800">Reserver</h2>

            {reservePlayers.length === 0 ? (
              <p className="mt-4 text-sm text-gray-500">Ingen reserver fundet.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {reservePlayers.map((player) => renderPlayerRow(player, true))}
              </div>
            )}
          </section>
        </div>

        <div className="sticky bottom-4">
          <div className="rounded-3xl bg-white p-4 shadow-lg ring-1 ring-pink-100">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-gray-600">
                2 spillersejre tæller som 1 holdpoint.
              </div>

              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="rounded-2xl bg-pink-600 px-5 py-3 font-semibold text-white transition hover:bg-pink-700 disabled:opacity-60"
              >
                {saving ? "Gemmer..." : "Gem kamp"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}