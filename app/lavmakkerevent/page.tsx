"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { buildEventRulesText } from "@/lib/eventConfig";

const todayIso = new Date().toISOString().slice(0, 10);

function addDays(dateIso: string, days: number) {
  const date = new Date(`${dateIso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

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
  const [allDates, setAllDates] = useState<string[]>([]);
  const [picked, setPicked] = useState<Record<string, boolean>>({
    [todayIso]: true,
  });

  useEffect(() => {
    if (!date) return;
    const base = new Date(`${date}T12:00:00`);
    const weekday = base.getDay();
    const out: string[] = [date];

    let next = date;
    while (out.length < 12) {
      next = addDays(next, 7);
      const nextDate = new Date(`${next}T12:00:00`);
      if (nextDate.getDay() === weekday) out.push(next);
    }

    setAllDates(out);
    setPicked((prev) => {
      const nextPicked: Record<string, boolean> = {};
      out.forEach((dt) => {
        nextPicked[dt] = prev[dt] ?? dt === date;
      });
      return nextPicked;
    });
  }, [date]);

  const pickedCount = useMemo(
    () => allDates.filter((dt) => picked[dt]).length,
    [allDates, picked]
  );

  function toggleDate(value: string) {
    setPicked((prev) => ({ ...prev, [value]: !prev[value] }));
  }

  function selectTop(count: number) {
    const nextPicked: Record<string, boolean> = {};
    allDates.forEach((dt, index) => {
      nextPicked[dt] = index < count;
    });
    setPicked(nextPicked);
  }

  function selectOnlyFirst() {
    const nextPicked: Record<string, boolean> = {};
    allDates.forEach((dt, index) => {
      nextPicked[dt] = index === 0;
    });
    setPicked(nextPicked);
  }

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
    if (pickedCount === 0) {
      return "Vælg mindst én dato.";
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
      const selectedDates = allDates.filter((dt) => picked[dt]);
      const createdIds: Array<string | number> = [];

      for (const selectedDate of selectedDates) {
        const res = await fetch("/api/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date: selectedDate,
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
        createdIds.push(json.data.id);
      }

      if (createdIds.length > 0) {
        router.push(`/makkerevent/${createdIds[0]}`);
      }
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
            Første dato
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

        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold">Opret flere datoer på én gang</div>
              <p className="text-xs text-zinc-600 dark:text-zinc-300">
                Vi tager udgangspunkt i første dato og viser de næste 12 på samme ugedag.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <button
                type="button"
                onClick={selectOnlyFirst}
                className="rounded-full border border-zinc-300 bg-white px-3 py-1 font-semibold hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:bg-zinc-800"
              >
                Kun første
              </button>
              <button
                type="button"
                onClick={() => selectTop(4)}
                className="rounded-full border border-zinc-300 bg-white px-3 py-1 font-semibold hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:bg-zinc-800"
              >
                Vælg 4
              </button>
              <button
                type="button"
                onClick={() => selectTop(8)}
                className="rounded-full border border-zinc-300 bg-white px-3 py-1 font-semibold hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:bg-zinc-800"
              >
                Vælg 8
              </button>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {allDates.map((dt) => (
              <label
                key={dt}
                className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm ${
                  picked[dt]
                    ? "border-pink-400 bg-pink-50 text-pink-900 dark:border-pink-700 dark:bg-pink-950/30 dark:text-pink-100"
                    : "border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-950"
                }`}
              >
                <input
                  type="checkbox"
                  checked={!!picked[dt]}
                  onChange={() => toggleDate(dt)}
                />
                <span>{dt}</span>
              </label>
            ))}
          </div>

          <div className="mt-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
            Valgt: {pickedCount}
          </div>
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
          {saving
            ? "Opretter…"
            : `Opret ${pickedCount} makkerevent${pickedCount === 1 ? "" : "s"}`}
        </button>
      </form>
    </main>
  );
}
