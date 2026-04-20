"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
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
  season: string;
  status: "upcoming" | "played";
  result_for: number | null;
  result_against: number | null;
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

const SEASONS = ["2025 forår", "2025 efterår", "2026 forår"];
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

function getMatchTimestamp(dateString: string | null) {
  if (!dateString) return Number.MAX_SAFE_INTEGER;
  const ts = new Date(dateString).getTime();
  return Number.isNaN(ts) ? Number.MAX_SAFE_INTEGER : ts;
}

function getTeamRelation(match: MatchRow) {
  return Array.isArray(match.hold_teams) ? match.hold_teams[0] : match.hold_teams;
}

function getDisplayMatchTitle(match: MatchRow) {
  const team = getTeamRelation(match);
  const teamName = team?.name ?? "Ukendt hold";

  return match.home_away === "home"
    ? `${teamName} vs. ${match.opponent}`
    : `${match.opponent} vs. ${teamName}`;
}

function isWin(match: MatchRow) {
  if (match.result_for === null || match.result_against === null) return false;
  return match.result_for > match.result_against;
}

function isLoss(match: MatchRow) {
  if (match.result_for === null || match.result_against === null) return false;
  return match.result_for < match.result_against;
}

function formatDisplayedScore(match: MatchRow) {
  if (match.result_for === null || match.result_against === null) return "—";

  return match.home_away === "home"
    ? `${match.result_for}-${match.result_against}`
    : `${match.result_against}-${match.result_for}`;
}

export default function AdminHoldkampePage() {
  const [selectedSeason, setSelectedSeason] = useState(CURRENT_SEASON);
  const [teams, setTeams] = useState<Team[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [editingMatchId, setEditingMatchId] = useState<string | null>(null);

  const [teamId, setTeamId] = useState("");
  const [opponent, setOpponent] = useState("");
  const [matchDate, setMatchDate] = useState("");
  const [homeAway, setHomeAway] = useState<"home" | "away">("home");
  const [location, setLocation] = useState("");

  useEffect(() => {
    fetchData();
  }, [selectedSeason]);

  function resetForm(nextTeams?: Team[]) {
    setEditingMatchId(null);
    setOpponent("");
    setMatchDate("");
    setHomeAway("home");
    setLocation("");

    const source = nextTeams ?? teams;
    if (source.length > 0) {
      setTeamId(source[0].id);
    } else {
      setTeamId("");
    }
  }

  async function fetchData() {
    setLoading(true);
    setError(null);

    const [teamsRes, matchesRes] = await Promise.all([
      supabase
        .from("hold_teams")
        .select("id, name, division, season")
        .eq("season", selectedSeason)
        .order("division", { ascending: true })
        .order("name", { ascending: true }),

      supabase
        .from("hold_matches")
        .select(`
          id,
          team_id,
          opponent,
          match_date,
          home_away,
          location,
          season,
          status,
          result_for,
          result_against,
          hold_teams (
            name,
            division
          )
        `)
        .eq("season", selectedSeason)
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

    const nextTeams = (teamsRes.data ?? []).slice().sort((a, b) => {
      const divisionCompare = (a.division ?? "").localeCompare(b.division ?? "", "da");
      if (divisionCompare !== 0) return divisionCompare;
      return a.name.localeCompare(b.name, "da");
    });

    const nextMatches = ((matchesRes.data as MatchRow[]) ?? []).slice().sort((a, b) => {
      const aTeam = getTeamRelation(a);
      const bTeam = getTeamRelation(b);

      const divisionCompare = (aTeam?.division ?? "").localeCompare(
        bTeam?.division ?? "",
        "da"
      );
      if (divisionCompare !== 0) return divisionCompare;

      const teamCompare = (aTeam?.name ?? "").localeCompare(bTeam?.name ?? "", "da");
      if (teamCompare !== 0) return teamCompare;

      return getMatchTimestamp(a.match_date) - getMatchTimestamp(b.match_date);
    });

    setTeams(nextTeams);
    setMatches(nextMatches);

    if (!editingMatchId) {
      if (nextTeams.length > 0) {
        setTeamId((prev) =>
          prev && nextTeams.some((team) => team.id === prev) ? prev : nextTeams[0].id
        );
      } else {
        setTeamId("");
      }
    }

    setLoading(false);
  }

  function startEdit(match: MatchRow) {
    setEditingMatchId(match.id);
    setTeamId(match.team_id);
    setOpponent(match.opponent);
    setMatchDate(toDatetimeLocalValue(match.match_date));
    setHomeAway(match.home_away);
    setLocation(match.location ?? "");
    setMessage(null);
    setError(null);

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);

    if (!teamId) {
      setError('Vælg et hold.');
      setSaving(false);
      return;
    }

    if (!opponent.trim()) {
      setError('Skriv en modstander.');
      setSaving(false);
      return;
    }

    const payload = {
      team_id: teamId,
      opponent: opponent.trim(),
      match_date: matchDate ? new Date(matchDate).toISOString() : null,
      home_away: homeAway,
      location: location.trim() || null,
      season: selectedSeason,
      status: "upcoming" as const,
      round: null,
    };

    if (editingMatchId) {
      const { error: updateError } = await supabase
        .from("hold_matches")
        .update(payload)
        .eq("id", editingMatchId);

      if (updateError) {
        setError(updateError.message);
        setSaving(false);
        return;
      }

      setMessage("Kampen er opdateret.");
    } else {
      const { error: insertError } = await supabase
        .from("hold_matches")
        .insert(payload);

      if (insertError) {
        setError(insertError.message);
        setSaving(false);
        return;
      }

      setMessage("Kampen er oprettet.");
    }

    await fetchData();
    resetForm();
    setSaving(false);
  }

  async function handleDeleteMatch(matchId: string) {
    const ok = window.confirm(
      "Vil du slette denne kamp? Det kan påvirke tilmeldinger og spillerdata på kampen."
    );
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

    if (editingMatchId === matchId) {
      resetForm();
    }

    setMessage("Kampen blev slettet.");
    await fetchData();
  }

  const groupedMatches = useMemo(() => {
    const map = new Map<string, { division: string; teamName: string; matches: MatchRow[] }>();

    for (const match of matches) {
      const team = getTeamRelation(match);
      const division = team?.division ?? "Ukendt serie";
      const teamName = team?.name ?? "Ukendt hold";
      const key = `${division}___${teamName}`;

      if (!map.has(key)) {
        map.set(key, { division, teamName, matches: [] });
      }

      map.get(key)!.matches.push(match);
    }

    return Array.from(map.values()).sort((a, b) => {
      const divisionCompare = a.division.localeCompare(b.division, "da");
      if (divisionCompare !== 0) return divisionCompare;
      return a.teamName.localeCompare(b.teamName, "da");
    });
  }, [matches]);

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-pink-50 to-white p-3 text-slate-900 dark:from-slate-950 dark:to-slate-900 dark:text-slate-100 md:p-6">
        <div className="mx-auto max-w-6xl rounded-2xl bg-white p-4 shadow-sm ring-1 ring-pink-100 dark:bg-slate-900 dark:ring-slate-800">
          <h1 className="text-2xl font-bold text-pink-700 dark:text-pink-300">
            Admin • Holdkampe
          </h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-slate-400">Henter data...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-pink-50 to-white p-3 text-slate-900 dark:from-slate-950 dark:to-slate-900 dark:text-slate-100 md:p-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-pink-100 dark:bg-slate-900 dark:ring-slate-800">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-pink-700 dark:text-pink-300">
                Admin • Holdkampe
              </h1>
              <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
                Opret, redigér og slet kampe. Gå derefter ind på kampen for at indtaste spillerresultater.
              </p>
            </div>

            <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-center">
              <Link
                href="/admin/hold"
                className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-pink-700 ring-1 ring-pink-200 transition hover:bg-pink-100 dark:bg-slate-900 dark:text-pink-300 dark:ring-slate-700 dark:hover:bg-slate-800"
              >
                Admin for hold
              </Link>

              <div className="w-full md:w-64">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
                  Sæson
                </label>
                <select
                  value={selectedSeason}
                  onChange={(e) => {
                    setSelectedSeason(e.target.value);
                    setEditingMatchId(null);
                    setMessage(null);
                    setError(null);
                  }}
                  className="w-full rounded-2xl border border-pink-200 bg-pink-50 px-4 py-3 text-sm outline-none focus:border-pink-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-pink-400"
                >
                  {SEASONS.map((season) => (
                    <option key={season} value={season}>
                      {season}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-pink-100 dark:bg-slate-900 dark:ring-slate-800">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-gray-800 dark:text-slate-100">
                {editingMatchId ? "Redigér kamp" : "Opret kamp"}
              </h2>
              <p className="text-xs text-gray-500 dark:text-slate-400">
                Kampen oprettes i sæsonen {selectedSeason}
              </p>
            </div>

            {editingMatchId && (
              <button
                type="button"
                onClick={() => resetForm()}
                className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                Annullér redigering
              </button>
            )}
          </div>

          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-gray-700 dark:text-slate-200">
                Hold
              </label>
              <select
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                className="w-full rounded-2xl border border-pink-200 bg-pink-50 px-4 py-3 text-sm outline-none focus:border-pink-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-pink-400"
              >
                {teams.length === 0 ? (
                  <option value="">Ingen hold i denne sæson</option>
                ) : (
                  teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.division} • {team.name}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-semibold text-gray-700 dark:text-slate-200">
                Modstander
              </label>
              <input
                value={opponent}
                onChange={(e) => setOpponent(e.target.value)}
                placeholder="Fx Hillerød Padel Club"
                className="w-full rounded-2xl border border-pink-200 bg-pink-50 px-4 py-3 text-sm outline-none focus:border-pink-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-pink-400"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-semibold text-gray-700 dark:text-slate-200">
                Dato og tid
              </label>
              <input
                type="datetime-local"
                value={matchDate}
                onChange={(e) => setMatchDate(e.target.value)}
                className="w-full rounded-2xl border border-pink-200 bg-pink-50 px-4 py-3 text-sm outline-none focus:border-pink-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-pink-400"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-sm font-semibold text-gray-700 dark:text-slate-200">
                Hjemme / ude
              </label>
              <select
                value={homeAway}
                onChange={(e) => setHomeAway(e.target.value as "home" | "away")}
                className="w-full rounded-2xl border border-pink-200 bg-pink-50 px-4 py-3 text-sm outline-none focus:border-pink-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-pink-400"
              >
                <option value="home">Hjemme</option>
                <option value="away">Ude</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="mb-1.5 block text-sm font-semibold text-gray-700 dark:text-slate-200">
                Lokation
              </label>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Fx Padelhuset Hillerød"
                className="w-full rounded-2xl border border-pink-200 bg-pink-50 px-4 py-3 text-sm outline-none focus:border-pink-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-pink-400"
              />
            </div>

            <div className="md:col-span-2 xl:col-span-3 flex flex-wrap gap-2 pt-1">
              <button
                type="submit"
                disabled={saving || teams.length === 0}
                className="rounded-2xl bg-pink-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-pink-700 disabled:opacity-60"
              >
                {saving ? "Gemmer..." : editingMatchId ? "Gem ændringer" : "Opret kamp"}
              </button>

              {editingMatchId && (
                <button
                  type="button"
                  onClick={() => resetForm()}
                  className="rounded-2xl bg-gray-100 px-5 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  Annullér
                </button>
              )}
            </div>
          </form>

          {message && (
            <div className="mt-4 rounded-2xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-700 ring-1 ring-green-100 dark:bg-green-950/40 dark:text-green-300 dark:ring-green-900">
              {message}
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 ring-1 ring-red-100 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900">
              {error}
            </div>
          )}

          {teams.length === 0 && (
            <div className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 ring-1 ring-amber-100 dark:bg-amber-950/30 dark:text-amber-200 dark:ring-amber-900">
              Der findes ingen hold i sæsonen {selectedSeason}. Opret holdene i `hold_teams` først, før du kan oprette kampe.
            </div>
          )}
        </section>

        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-pink-100 dark:bg-slate-900 dark:ring-slate-800">
          <div className="mb-4">
            <h2 className="text-lg font-bold text-gray-800 dark:text-slate-100">
              Eksisterende kampe
            </h2>
            <p className="text-xs text-gray-500 dark:text-slate-400">
              {matches.length} kampe i {selectedSeason}
            </p>
          </div>

          {matches.length === 0 ? (
            <div className="rounded-2xl bg-pink-50 p-5 text-center dark:bg-slate-800">
              <div className="text-3xl">📅</div>
              <p className="mt-2 text-sm font-semibold text-gray-800 dark:text-slate-100">
                Der er ikke oprettet nogen kampe endnu
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {groupedMatches.map((group) => (
                <div key={`${group.division}-${group.teamName}`}>
                  <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-pink-700 dark:text-pink-300">
                    {group.division} • {group.teamName}
                  </h3>

                  <div className="space-y-2">
                    {group.matches.map((match) => {
                      const played = match.status === "played";
                      const won = isWin(match);
                      const lost = isLoss(match);

                      return (
                        <div
                          key={match.id}
                          className="rounded-2xl bg-pink-50 px-4 py-3 dark:bg-slate-800"
                        >
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div className="min-w-0 flex-1">
                              <h4 className="text-sm font-bold text-gray-900 dark:text-slate-100 sm:text-base">
                                {getDisplayMatchTitle(match)}
                              </h4>

                              <p className="mt-1 text-xs leading-snug text-gray-500 dark:text-slate-400">
                                {formatDate(match.match_date)}
                                {match.location ? ` • ${match.location}` : ""}
                              </p>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              {played ? (
                                <div
                                  className={`rounded-full px-3 py-1 text-xs font-bold ring-1 ${
                                    won
                                      ? "bg-green-100 text-green-700 ring-green-200 dark:bg-green-950/40 dark:text-green-300 dark:ring-green-900"
                                      : lost
                                      ? "bg-red-100 text-red-700 ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900"
                                      : "bg-white text-gray-700 ring-gray-200 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700"
                                  }`}
                                >
                                  {formatDisplayedScore(match)}
                                </div>
                              ) : (
                                <div className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-gray-600 ring-1 ring-pink-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700">
                                  Kommende
                                </div>
                              )}

                              <Link
                                href={`/holdkampe/kamp/${match.id}`}
                                className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-pink-700 ring-1 ring-pink-200 transition hover:bg-pink-100 dark:bg-slate-900 dark:text-pink-300 dark:ring-slate-700 dark:hover:bg-slate-700"
                              >
                                Resultater
                              </Link>

                              <button
                                type="button"
                                onClick={() => startEdit(match)}
                                className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-gray-700 ring-1 ring-gray-200 transition hover:bg-gray-100 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700 dark:hover:bg-slate-700"
                              >
                                Redigér
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDeleteMatch(match.id)}
                                className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-red-600 ring-1 ring-red-200 transition hover:bg-red-50 dark:bg-slate-900 dark:text-red-300 dark:ring-red-900 dark:hover:bg-red-950/30"
                              >
                                Slet
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
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
