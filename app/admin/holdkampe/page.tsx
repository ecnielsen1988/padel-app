"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type Team = {
  id: string;
  name: string;
  division: string;
  season: string;
};

type MatchRow = {
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
  hold_teams?: {
    name: string;
    division: string;
  } | {
    name: string;
    division: string;
  }[];
};

const CURRENT_SEASON = "2026 forår";

function formatDate(dateString: string | null) {
  if (!dateString) return "Ingen dato";

  const date = new Date(dateString);

  return new Intl.DateTimeFormat("da-DK", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function toDatetimeLocalValue(isoString: string | null) {
  if (!isoString) return "";
  const d = new Date(isoString);
  const pad = (n: number) => String(n).padStart(2, "0");

  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hour = pad(d.getHours());
  const minute = pad(d.getMinutes());

  return `${year}-${month}-${day}T${hour}:${minute}`;
}

export default function AdminHoldkampePage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [teamId, setTeamId] = useState("");
  const [opponent, setOpponent] = useState("");
  const [matchDate, setMatchDate] = useState("");
  const [homeAway, setHomeAway] = useState<"home" | "away">("home");
  const [location, setLocation] = useState("");
  const [round, setRound] = useState("");

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    setError(null);

    const [teamsRes, matchesRes] = await Promise.all([
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
          season,
          status,
          result_for,
          result_against,
          hold_teams (
            name,
            division
          )
        `)
        .eq("season", CURRENT_SEASON)
        .order("match_date", { ascending: true, nullsFirst: false }),
    ]);

    if (teamsRes.error) {
      setError(teamsRes.error.message);
      setLoading(false);
      return;
    }

    if (matchesRes.error) {
      setError(matchesRes.error.message);
      setLoading(false);
      return;
    }

    const nextTeams = teamsRes.data ?? [];
    setTeams(nextTeams);
    setMatches((matchesRes.data as MatchRow[]) ?? []);

    if (!teamId && nextTeams.length > 0) {
      setTeamId(nextTeams[0].id);
    }

    setLoading(false);
  }

  async function handleCreateMatch(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);

    if (!teamId) {
      setError("Vælg et hold.");
      setSaving(false);
      return;
    }

    if (!opponent.trim()) {
      setError("Skriv en modstander.");
      setSaving(false);
      return;
    }

    const payload = {
      team_id: teamId,
      opponent: opponent.trim(),
      match_date: matchDate ? new Date(matchDate).toISOString() : null,
      home_away: homeAway,
      location: location.trim() || null,
      round: round ? Number(round) : null,
      season: CURRENT_SEASON,
      status: "upcoming" as const,
    };

    const { error: insertError } = await supabase
      .from("hold_matches")
      .insert(payload);

    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }

    setMessage("Kampen er oprettet.");
    setOpponent("");
    setMatchDate("");
    setHomeAway("home");
    setLocation("");
    setRound("");

    await fetchData();
    setSaving(false);
  }

  async function handleDeleteMatch(matchId: string) {
    const ok = window.confirm("Vil du slette denne kamp?");
    if (!ok) return;

    setError(null);
    setMessage(null);

    const { error: deleteError } = await supabase
      .from("hold_matches")
      .delete()
      .eq("id", matchId);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    setMessage("Kampen blev slettet.");
    await fetchData();
  }

  const groupedMatches = useMemo(() => {
    const map = new Map<string, MatchRow[]>();

    for (const match of matches) {
      const team = Array.isArray(match.hold_teams)
        ? match.hold_teams[0]
        : match.hold_teams;

      const teamName = team?.name ?? "Ukendt hold";

      if (!map.has(teamName)) {
        map.set(teamName, []);
      }

      map.get(teamName)!.push(match);
    }

    return Array.from(map.entries());
  }, [matches]);

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-pink-50 to-white p-4 md:p-8">
        <div className="mx-auto max-w-6xl rounded-3xl bg-white p-6 shadow-sm ring-1 ring-pink-100">
          <h1 className="text-3xl font-bold text-pink-700">Admin • Holdkampe</h1>
          <p className="mt-3 text-gray-500">Henter data...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-pink-50 to-white p-4 md:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-pink-100">
          <h1 className="text-3xl font-bold text-pink-700">Admin • Holdkampe</h1>
          <p className="mt-2 text-gray-600">
            Opret og administrér holdkampe for {CURRENT_SEASON}.
          </p>
        </div>

        <section className="mb-6 rounded-3xl bg-white p-6 shadow-sm ring-1 ring-pink-100">
          <h2 className="text-xl font-bold text-gray-800">Opret kamp</h2>

          <form onSubmit={handleCreateMatch} className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700">
                Hold
              </label>
              <select
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                className="w-full rounded-2xl border border-pink-200 bg-pink-50 px-4 py-3 outline-none focus:border-pink-400"
              >
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>
                    {team.name} • {team.division}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700">
                Modstander
              </label>
              <input
                value={opponent}
                onChange={(e) => setOpponent(e.target.value)}
                placeholder="Fx Hillerød Padel Club"
                className="w-full rounded-2xl border border-pink-200 bg-pink-50 px-4 py-3 outline-none focus:border-pink-400"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700">
                Dato og tid
              </label>
              <input
                type="datetime-local"
                value={matchDate}
                onChange={(e) => setMatchDate(e.target.value)}
                className="w-full rounded-2xl border border-pink-200 bg-pink-50 px-4 py-3 outline-none focus:border-pink-400"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700">
                Hjemme / ude
              </label>
              <select
                value={homeAway}
                onChange={(e) => setHomeAway(e.target.value as "home" | "away")}
                className="w-full rounded-2xl border border-pink-200 bg-pink-50 px-4 py-3 outline-none focus:border-pink-400"
              >
                <option value="home">Hjemme</option>
                <option value="away">Ude</option>
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700">
                Lokation
              </label>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Fx Padelhuset Hillerød"
                className="w-full rounded-2xl border border-pink-200 bg-pink-50 px-4 py-3 outline-none focus:border-pink-400"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-700">
                Runde
              </label>
              <input
                type="number"
                min={1}
                max={6}
                value={round}
                onChange={(e) => setRound(e.target.value)}
                placeholder="Fx 1"
                className="w-full rounded-2xl border border-pink-200 bg-pink-50 px-4 py-3 outline-none focus:border-pink-400"
              />
            </div>

            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={saving}
                className="rounded-2xl bg-pink-600 px-5 py-3 font-semibold text-white transition hover:bg-pink-700 disabled:opacity-60"
              >
                {saving ? "Gemmer..." : "Opret kamp"}
              </button>
            </div>
          </form>

          {message && (
            <p className="mt-4 rounded-2xl bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
              {message}
            </p>
          )}

          {error && (
            <p className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {error}
            </p>
          )}
        </section>

        <section className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-pink-100">
          <h2 className="text-xl font-bold text-gray-800">Eksisterende kampe</h2>

          {matches.length === 0 ? (
            <div className="mt-4 rounded-2xl bg-pink-50 p-6 text-center">
              <div className="text-3xl">📅</div>
              <p className="mt-3 font-semibold text-gray-800">
                Der er ikke oprettet nogen kampe endnu
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-6">
              {groupedMatches.map(([teamName, teamMatches]) => (
                <div key={teamName}>
                  <h3 className="mb-3 text-lg font-bold text-pink-700">{teamName}</h3>

                  <div className="space-y-3">
                    {teamMatches.map((match) => (
                      <div
                        key={match.id}
                        className="flex flex-col gap-3 rounded-2xl bg-pink-50 p-4 md:flex-row md:items-center md:justify-between"
                      >
                        <div>
                          <p className="text-sm font-semibold text-pink-700">
                            {match.round ? `Runde ${match.round}` : "Ingen runde"}
                          </p>

                          <h4 className="text-lg font-bold text-gray-900">
                            {match.home_away === "home" ? "vs." : "ude mod"} {match.opponent}
                          </h4>

                          <p className="text-sm text-gray-500">
                            {formatDate(match.match_date)}
                            {match.location ? ` • ${match.location}` : ""}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          {match.status === "played" &&
                          match.result_for !== null &&
                          match.result_against !== null ? (
                            <div className="rounded-full bg-white px-4 py-2 text-sm font-bold text-pink-700 ring-1 ring-pink-200">
                              {match.result_for}-{match.result_against}
                            </div>
                          ) : (
                            <div className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-gray-600 ring-1 ring-pink-200">
                              Kommende kamp
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={() => handleDeleteMatch(match.id)}
                            className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-red-600 ring-1 ring-red-200 hover:bg-red-50"
                          >
                            Slet
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}