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

type TeamMember = {
  id: string;
  team_id: string;
  visningsnavn: string;
  member_type: "primary" | "reserve";
  sort_order: number | null;
  season: string;
};

type ProfilePlayer = {
  visningsnavn: string | null;
};

const SEASONS = ["2025 forår", "2025 efterår", "2026 forår"];
const CURRENT_SEASON = "2026 forår";

export default function AdminHoldPage() {
  const [selectedSeason, setSelectedSeason] = useState(CURRENT_SEASON);
  const [teams, setTeams] = useState<Team[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [players, setPlayers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [teamName, setTeamName] = useState("");
  const [division, setDivision] = useState("");

  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [memberType, setMemberType] = useState<"primary" | "reserve">("primary");
  const [sortOrder, setSortOrder] = useState("");

  useEffect(() => {
    fetchData();
  }, [selectedSeason]);

  async function fetchData() {
    setLoading(true);
    setError(null);

    const [teamsRes, membersRes, playersRes] = await Promise.all([
      supabase
        .from("hold_teams")
        .select("id, name, division, season")
        .eq("season", selectedSeason)
        .order("division", { ascending: true })
        .order("name", { ascending: true }),

      supabase
        .from("hold_team_members")
        .select("id, team_id, visningsnavn, member_type, sort_order, season")
        .eq("season", selectedSeason)
        .order("sort_order", { ascending: true, nullsFirst: false }),

      supabase
        .from("profiles")
        .select("visningsnavn")
        .not("visningsnavn", "is", null),
    ]);

    if (teamsRes.error) {
      setError(teamsRes.error.message);
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

    const nextTeams = teamsRes.data ?? [];
    const nextMembers = (membersRes.data ?? []) as TeamMember[];
    const nextPlayers = Array.from(
      new Set(
        ((playersRes.data ?? []) as ProfilePlayer[])
          .map((player) => player.visningsnavn?.trim())
          .filter((name): name is string => Boolean(name))
      )
    ).sort((a, b) => a.localeCompare(b, "da"));

    setTeams(nextTeams);
    setMembers(nextMembers);
    setPlayers(nextPlayers);

    if (nextTeams.length > 0) {
      setSelectedTeamId((prev) =>
        prev && nextTeams.some((team) => team.id === prev) ? prev : nextTeams[0].id
      );
    } else {
      setSelectedTeamId("");
    }

    setLoading(false);
  }

  async function handleCreateTeam(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);

    if (!teamName.trim()) {
      setError("Skriv et holdnavn.");
      setSaving(false);
      return;
    }

    if (!division.trim()) {
      setError("Skriv division/serie.");
      setSaving(false);
      return;
    }

    const { error: insertError } = await supabase.from("hold_teams").insert({
      name: teamName.trim(),
      division: division.trim(),
      season: selectedSeason,
    });

    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }

    setTeamName("");
    setDivision("");
    setMessage("Holdet er oprettet.");
    await fetchData();
    setSaving(false);
  }

  async function handleDeleteTeam(teamId: string) {
    const ok = window.confirm(
      "Vil du slette holdet? Spillere og kampe knyttet til holdet kan blive påvirket."
    );
    if (!ok) return;

    setError(null);
    setMessage(null);

    const { error: deleteError } = await supabase
      .from("hold_teams")
      .delete()
      .eq("id", teamId);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    setMessage("Holdet blev slettet.");
    await fetchData();
  }

  async function handleAddPlayer(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);

    const trimmedName = playerName.trim();

    if (!selectedTeamId) {
      setError("Vælg et hold.");
      setSaving(false);
      return;
    }

    if (!trimmedName) {
      setError("Vælg en spiller.");
      setSaving(false);
      return;
    }

    if (!players.includes(trimmedName)) {
      setError("Spilleren skal vælges fra listen over profiler.");
      setSaving(false);
      return;
    }

    const { error: insertError } = await supabase
      .from("hold_team_members")
      .insert({
        team_id: selectedTeamId,
        visningsnavn: trimmedName,
        member_type: memberType,
        sort_order: sortOrder ? Number(sortOrder) : null,
        season: selectedSeason,
      });

    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }

    setPlayerName("");
    setMemberType("primary");
    setSortOrder("");
    setMessage("Spilleren er tilføjet.");
    await fetchData();
    setSaving(false);
  }

  async function handleDeleteMember(memberId: string) {
    const ok = window.confirm("Vil du fjerne spilleren fra holdet?");
    if (!ok) return;

    setError(null);
    setMessage(null);

    const { error: deleteError } = await supabase
      .from("hold_team_members")
      .delete()
      .eq("id", memberId);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    setMessage("Spilleren blev fjernet.");
    await fetchData();
  }

  const groupedTeams = useMemo(() => {
    return teams.map((team) => ({
      ...team,
      members: members
        .filter((member) => member.team_id === team.id)
        .sort((a, b) => {
          if (a.member_type !== b.member_type) {
            return a.member_type === "primary" ? -1 : 1;
          }

          return (a.sort_order ?? 999) - (b.sort_order ?? 999);
        }),
    }));
  }, [teams, members]);

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-pink-50 to-white p-3 text-slate-900 dark:from-slate-950 dark:to-slate-900 dark:text-slate-100 md:p-6">
        <div className="mx-auto max-w-6xl rounded-2xl bg-white p-4 shadow-sm ring-1 ring-pink-100 dark:bg-slate-900 dark:ring-slate-800">
          <h1 className="text-2xl font-bold text-pink-700 dark:text-pink-300">Admin • Hold</h1>
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
                Admin • Hold
              </h1>
              <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
                Opret hold og tilføj spillere med navne fra `profiles.visningsnavn`.
              </p>
            </div>

            <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-center">
              <Link
                href="/admin/holdkampe"
                className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-pink-700 ring-1 ring-pink-200 transition hover:bg-pink-100 dark:bg-slate-900 dark:text-pink-300 dark:ring-slate-700 dark:hover:bg-slate-800"
              >
                Admin for holdkampe
              </Link>

              <div className="w-full md:w-64">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
                  Sæson
                </label>
                <select
                  value={selectedSeason}
                  onChange={(e) => {
                    setSelectedSeason(e.target.value);
                    setMessage(null);
                    setError(null);
                  }}
                  className="w-full rounded-2xl border border-pink-200 bg-pink-50 px-4 py-3 text-sm outline-none focus:border-pink-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
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

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-pink-100 dark:bg-slate-900 dark:ring-slate-800">
            <h2 className="text-lg font-bold text-gray-800 dark:text-slate-100">Opret hold</h2>

            <form onSubmit={handleCreateTeam} className="mt-4 space-y-3">
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-gray-700 dark:text-slate-200">
                  Holdnavn
                </label>
                <input
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  className="w-full rounded-2xl border border-pink-200 bg-pink-50 px-4 py-3 text-sm outline-none focus:border-pink-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-semibold text-gray-700 dark:text-slate-200">
                  Division / serie
                </label>
                <input
                  value={division}
                  onChange={(e) => setDivision(e.target.value)}
                  className="w-full rounded-2xl border border-pink-200 bg-pink-50 px-4 py-3 text-sm outline-none focus:border-pink-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>

              <button
                type="submit"
                disabled={saving}
                className="rounded-2xl bg-pink-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-pink-700 disabled:opacity-60"
              >
                {saving ? "Gemmer..." : "Opret hold"}
              </button>
            </form>
          </section>

          <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-pink-100 dark:bg-slate-900 dark:ring-slate-800">
            <h2 className="text-lg font-bold text-gray-800 dark:text-slate-100">Tilføj spiller</h2>

            <form onSubmit={handleAddPlayer} className="mt-4 space-y-3">
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-gray-700 dark:text-slate-200">
                  Hold
                </label>
                <select
                  value={selectedTeamId}
                  onChange={(e) => setSelectedTeamId(e.target.value)}
                  className="w-full rounded-2xl border border-pink-200 bg-pink-50 px-4 py-3 text-sm outline-none focus:border-pink-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
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
                  Spiller
                </label>
                <input
                  list="profile-player-options"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="Søg på visningsnavn"
                  className="w-full rounded-2xl border border-pink-200 bg-pink-50 px-4 py-3 text-sm outline-none focus:border-pink-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
                />
                <datalist id="profile-player-options">
                  {players.map((player) => (
                    <option key={player} value={player} />
                  ))}
                </datalist>
                <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
                  Vælg et navn fra `profiles.visningsnavn` for at sikre korrekt statistik.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-gray-700 dark:text-slate-200">
                    Type
                  </label>
                  <select
                    value={memberType}
                    onChange={(e) =>
                      setMemberType(e.target.value as "primary" | "reserve")
                    }
                    className="w-full rounded-2xl border border-pink-200 bg-pink-50 px-4 py-3 text-sm outline-none focus:border-pink-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="primary">Primær</option>
                    <option value="reserve">Reserve</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-gray-700 dark:text-slate-200">
                    Sortering
                  </label>
                  <input
                    type="number"
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value)}
                    className="w-full rounded-2xl border border-pink-200 bg-pink-50 px-4 py-3 text-sm outline-none focus:border-pink-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={saving || teams.length === 0}
                className="rounded-2xl bg-pink-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-pink-700 disabled:opacity-60"
              >
                {saving ? "Gemmer..." : "Tilføj spiller"}
              </button>
            </form>
          </section>
        </div>

        {message && (
          <div className="rounded-2xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-700 ring-1 ring-green-100 dark:bg-green-950/40 dark:text-green-300 dark:ring-green-900">
            {message}
          </div>
        )}

        {error && (
          <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 ring-1 ring-red-100 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900">
            {error}
          </div>
        )}

        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-pink-100 dark:bg-slate-900 dark:ring-slate-800">
          <h2 className="text-lg font-bold text-gray-800 dark:text-slate-100">Eksisterende hold</h2>

          {groupedTeams.length === 0 ? (
            <div className="mt-4 rounded-2xl bg-pink-50 p-5 text-center dark:bg-slate-800">
              <p className="text-sm font-semibold text-gray-800 dark:text-slate-100">
                Ingen hold i denne sæson endnu.
              </p>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              {groupedTeams.map((team) => (
                <div key={team.id} className="rounded-2xl bg-pink-50 p-4 dark:bg-slate-800">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-pink-700 dark:text-pink-300">
                        {team.division}
                      </h3>
                      <p className="text-base font-bold text-gray-900 dark:text-slate-100">
                        {team.name}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDeleteTeam(team.id)}
                      className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-red-600 ring-1 ring-red-200 transition hover:bg-red-50 dark:bg-slate-900 dark:text-red-300 dark:ring-red-900"
                    >
                      Slet hold
                    </button>
                  </div>

                  <div className="mt-4 space-y-2">
                    {team.members.length === 0 ? (
                      <p className="text-xs text-gray-500 dark:text-slate-400">
                        Ingen spillere på holdet endnu.
                      </p>
                    ) : (
                      team.members.map((member) => (
                        <div
                          key={member.id}
                          className="flex items-center justify-between gap-3 rounded-2xl bg-white px-3 py-2 dark:bg-slate-900"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-gray-900 dark:text-slate-100">
                              {member.visningsnavn}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-slate-400">
                              {member.member_type === "primary" ? "Primær" : "Reserve"}
                              {member.sort_order !== null ? ` • Sortering ${member.sort_order}` : ""}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleDeleteMember(member.id)}
                            className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-red-600 ring-1 ring-red-200 transition hover:bg-red-50 dark:bg-slate-800 dark:text-red-300 dark:ring-red-900"
                          >
                            Fjern
                          </button>
                        </div>
                      ))
                    )}
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
