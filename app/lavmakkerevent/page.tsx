"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { buildEventRulesText } from "@/lib/eventConfig";

const todayIso = new Date().toISOString().slice(0, 10);

export default function LavMakkerEventPage() {
  const router = useRouter();

  const [name, setName] = useState("Makkerevent");
  const [date, setDate] = useState(todayIso);
  const [location, setLocation] = useState<"Helsinge" | "Gilleleje">(
    "Gilleleje"
  );
  const [start, setStart] = useState("18:00");
  const [end, setEnd] = useState("20:00");
  const [maxPairs, setMaxPairs] = useState(8);
  const [minElo, setMinElo] = useState<number | "">("");
  const [maxElo, setMaxElo] = useState<number | "">("");
  const [signupUrl, setSignupUrl] = useState("");
  const [rulesText, setRulesText] = useState("");
  const [isPublished, setIsPublished] = useState(false);
  const [saving, setSaving] = useState(false);

  function validate() {
    if (!name.trim()) return "Skriv et navn til eventet.";
    if (!date) return "Vælg en dato.";
    if (!start || !end || start >= end) {
      return "Sluttid skal være efter starttid.";
    }
    if (!Number.isInteger(maxPairs) || maxPairs < 2) {
      return "Der skal være plads til mindst 2 makkerpar.";
    }
    if (minElo !== "" && maxElo !== "" && Number(minElo) > Number(maxElo)) {
      return "Min. Elo må ikke være større end max. Elo.";
    }
    return null;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const error = validate();
    if (error) {
      alert(error);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          start_time: `${start}:00`,
          end_time: `${end}:00`,
          location,
          name: name.trim(),
          max_players: maxPairs * 2,
          min_elo: minElo === "" ? null : Number(minElo),
          max_elo: maxElo === "" ? null : Number(maxElo),
          only_women: false,
          closed_group: false,
          signup_url: signupUrl.trim() || null,
          is_published: isPublished,
          rules_text: buildEventRulesText(rulesText, {
            format: "partner",
            partnerTeams: [],
          }),
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || "Kunne ikke oprette makkereventet.");
      }

      router.push(`/makkerevent/${json.data.id}`);
    } catch (err: any) {
      alert(err?.message || "Kunne ikke oprette makkereventet.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl p-4 text-gray-900 dark:text-gray-100 sm:p-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Lav makkerevent</h1>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            Opret eventet her, og sammensæt derefter makkerpar på adminsiden.
          </p>
        </div>
        <Link
          href="/admin/event"
          className="rounded-xl border border-pink-300 px-3 py-2 text-sm font-semibold text-pink-700 hover:bg-pink-50 dark:border-pink-700 dark:text-pink-300"
        >
          Tilbage
        </Link>
      </div>

      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-2xl border border-pink-200/60 bg-white p-4 shadow-sm dark:border-pink-900/40 dark:bg-zinc-950 sm:p-5"
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">
            Navn
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>

          <label className="text-sm font-medium">
            Sted
            <select
              value={location}
              onChange={(e) =>
                setLocation(e.target.value as "Helsinge" | "Gilleleje")
              }
              className="mt-1 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value="Gilleleje">Gilleleje</option>
              <option value="Helsinge">Helsinge</option>
            </select>
          </label>

          <label className="text-sm font-medium">
            Dato
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>

          <label className="text-sm font-medium">
            Antal makkerpar
            <input
              type="number"
              min={2}
              step={1}
              value={maxPairs}
              onChange={(e) => setMaxPairs(Number(e.target.value))}
              className="mt-1 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>

          <label className="text-sm font-medium">
            Start
            <input
              type="time"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>

          <label className="text-sm font-medium">
            Slut
            <input
              type="time"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="mt-1 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>

          <label className="text-sm font-medium">
            Min. Elo
            <input
              type="number"
              value={minElo}
              onChange={(e) =>
                setMinElo(e.target.value === "" ? "" : Number(e.target.value))
              }
              className="mt-1 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>

          <label className="text-sm font-medium">
            Max. Elo
            <input
              type="number"
              value={maxElo}
              onChange={(e) =>
                setMaxElo(e.target.value === "" ? "" : Number(e.target.value))
              }
              className="mt-1 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
        </div>

        <label className="block text-sm font-medium">
          Tilmeldingslink
          <input
            value={signupUrl}
            onChange={(e) => setSignupUrl(e.target.value)}
            placeholder="https://..."
            className="mt-1 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>

        <label className="block text-sm font-medium">
          Tekst / regler
          <textarea
            value={rulesText}
            onChange={(e) => setRulesText(e.target.value)}
            rows={4}
            className="mt-1 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>

        <label className="inline-flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={isPublished}
            onChange={(e) => setIsPublished(e.target.checked)}
          />
          Offentliggør eventet med det samme
        </label>

        <div className="rounded-xl bg-pink-50 px-4 py-3 text-sm text-pink-900 dark:bg-pink-950/40 dark:text-pink-100">
          I Gilleleje bliver de bedste par automatisk lagt på bane 2, derefter
          1, 3, 6 og 5. I visningen står kampene stadig pænt som bane 1, 2, 3,
          5 og 6.
        </div>

        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-pink-600 px-4 py-2.5 font-semibold text-white hover:bg-pink-700 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {saving ? "Opretter…" : "Opret makkerevent"}
        </button>
      </form>
    </main>
  );
}
