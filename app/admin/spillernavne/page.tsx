"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

type Player = { id: string; visningsnavn: string | null };

export default function PlayerNamesPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Player | null>(null);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function loadPlayers() {
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch("/api/admin/player-names", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setPlayers(data.players);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Kunne ikke hente spillerne.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadPlayers(); }, []);

  async function rename(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || saving) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch("/api/admin/player-names", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: selected.id, expectedName: selected.visningsnavn, newName }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setPlayers((current) => current.map((p) => p.id === selected.id ? { ...p, visningsnavn: data.name } : p)
        .sort((a, b) => (a.visningsnavn ?? "").localeCompare(b.visningsnavn ?? "", "da")));
      setSuccess(`${selected.visningsnavn} er ændret til ${data.name}. ${data.resultsUpdated} resultatrækker og ${data.eloDaysUpdated} Elo-dagsværdier er opdateret. Ranglister kan være et par minutter om at vise ændringen.`);
      setSelected(null);
      setSearch("");
      setNewName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunne ikke gemme. Genindlæs siden for at kontrollere navnet.");
    } finally {
      setSaving(false);
    }
  }

  const filtered = players.filter((p) => (p.visningsnavn ?? "").toLocaleLowerCase("da").includes(search.trim().toLocaleLowerCase("da")));
  const inputClass = "w-full rounded-xl border border-pink-300 bg-white px-3 py-2 dark:border-pink-800 dark:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-pink-500";

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 text-gray-900 dark:text-white">
      <Link href="/admin" className="text-sm underline">← Til admin</Link>
      <h1 className="mb-3 mt-5 text-3xl font-bold text-pink-600">Ændr spillernavn</h1>
      <p className="mb-6 text-sm opacity-80">Ret navnet på spillerens profil og i alle tidligere resultater på én gang. Spillerens point og kamphistorik følger med det nye navn.</p>

      {success && <p role="status" className="mb-5 rounded-xl bg-green-100 p-4 text-green-900 dark:bg-green-900/30 dark:text-green-200">{success}</p>}
      {loading ? <p role="status">Indlæser spillere…</p> : loadError ? (
        <div role="alert">
          <p>{loadError}</p>
          <button type="button" onClick={() => void loadPlayers()} className="mt-3 rounded-lg border px-4 py-2">Prøv igen</button>
        </div>
      ) : (
        <>
          <label htmlFor="player-search" className="mb-2 block font-semibold">Find spiller</label>
          <input id="player-search" type="search" value={search} disabled={saving} onChange={(e) => setSearch(e.target.value)} placeholder="Søg på nuværende navn…" className={inputClass} />
          <div className="my-4 max-h-64 overflow-y-auto rounded-xl border border-pink-200 dark:border-pink-900">
            {filtered.length === 0 ? <p className="p-4 opacity-70">Ingen spillere fundet.</p> : filtered.map((player) => (
              <button key={player.id} type="button" disabled={saving || !player.visningsnavn?.trim()} aria-pressed={selected?.id === player.id}
                onClick={() => { setSelected(player); setNewName(player.visningsnavn ?? ""); setError(""); setSuccess(""); }}
                className={`block w-full border-b border-pink-100 px-4 py-3 text-left last:border-0 dark:border-pink-900/30 disabled:opacity-50 ${selected?.id === player.id ? "bg-pink-100 font-semibold dark:bg-pink-900/40" : "hover:bg-pink-50 dark:hover:bg-pink-900/20"}`}>
                {player.visningsnavn || "Profil uden navn"}{selected?.id === player.id ? " ✓" : ""}
              </button>
            ))}
          </div>
          {selected && (
            <form onSubmit={rename} className="mt-6 rounded-2xl border border-pink-200 p-5 dark:border-pink-900">
              <p className="mb-4">Nuværende navn: <strong>{selected.visningsnavn}</strong></p>
              <label htmlFor="new-player-name" className="mb-2 block font-semibold">Nyt navn</label>
              <input id="new-player-name" required maxLength={100} value={newName} disabled={saving} onChange={(e) => setNewName(e.target.value)} className={inputClass} />
              <p className="my-4 text-sm opacity-80">Ændringen gælder alle datoer, alle fire spillerfelter, indberetternavnet og gemte Elo-dagsværdier. Et navn, der allerede tilhører en anden spiller, kan ikke bruges.</p>
              {error && <p role="alert" className="mb-4 text-red-600 dark:text-red-400">{error}</p>}
              <button type="submit" disabled={saving || !newName.trim() || newName.trim() === selected.visningsnavn}
                className="w-full rounded-xl bg-pink-600 px-4 py-3 font-semibold text-white hover:bg-pink-700 disabled:cursor-not-allowed disabled:opacity-50">
                {saving ? "Opdaterer navn og historik…" : "Gem navn i profil og alle resultater"}
              </button>
            </form>
          )}
        </>
      )}
    </main>
  );
}
