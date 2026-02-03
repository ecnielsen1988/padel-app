"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

// ===== Helpers =====
const toISO = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, days: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
};

type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0=Sun
const WEEKDAY_LABEL: Record<Weekday, string> = {
  0: "Søn",
  1: "Man",
  2: "Tir",
  3: "Ons",
  4: "Tor",
  5: "Fre",
  6: "Lør",
};

const WEEKDAYS: { id: Weekday; label: string }[] = [
  { id: 1, label: "Mandag" },
  { id: 2, label: "Tirsdag" },
  { id: 3, label: "Onsdag" },
  { id: 4, label: "Torsdag" },
  { id: 5, label: "Fredag" },
  { id: 6, label: "Lørdag" },
  { id: 0, label: "Søndag" },
];

function defaultSignupLink(name: string) {
  const n = (name || "").toLowerCase();
  if (n.includes("torsdag") || n.includes("fredag"))
    return "https://www.matchi.se/facilities/PadelhusetHelsinge";
  if (n.includes("onsdag") || n.includes("sunday") || n.includes("søndag"))
    return "https://www.matchi.se/facilities/padelhuset.dk";
  return "";
}

// Navne-forslag pr. ugedag (du kan tilføje/ændre her)
const NAME_SUGGESTIONS: Record<Weekday, string[]> = {
  1: ["Mandags Mix", "Mandags Match & Makkerbyt"],
  2: ["Tirsdags Padel", "Tirsdags Match & Makkerbyt", "Tirsdags Træning & Spil"],
  3: ["Onsdags Match & Makkerbyt"],
  4: ["TorsdagsBold & Bajere"],
  5: ["Fredags Fun & Fairplay"],
  6: ["Lørdags Padel", "Lørdags Social"],
  0: ["Sunday Socials"],
};

// Standard tider pr. ugedag (du kan finjustere)
const DEFAULT_TIME: Record<Weekday, { start: string; end: string }> = {
  1: { start: "18:00", end: "20:00" },
  2: { start: "18:00", end: "20:00" },
  3: { start: "18:00", end: "20:00" },
  4: { start: "17:00", end: "20:00" },
  5: { start: "16:30", end: "18:30" },
  6: { start: "10:00", end: "12:00" },
  0: { start: "10:00", end: "12:00" },
};

// Standard sted pr. ugedag (du kan finjustere)
const DEFAULT_LOCATION: Record<Weekday, "Helsinge" | "Gilleleje"> = {
  1: "Gilleleje",
  2: "Helsinge",
  3: "Gilleleje",
  4: "Helsinge",
  5: "Helsinge",
  6: "Gilleleje",
  0: "Gilleleje",
};

export default function LavEventKompakt_Ugedage() {
  const router = useRouter();

  // ====== Vælg ugedag i toppen
  const [weekday, setWeekday] = useState<Weekday>(4); // default: Torsdag

  // ====== Navne dropdown (forudfyldt pr. ugedag)
  const suggestions = NAME_SUGGESTIONS[weekday] ?? [];
  const [nameMode, setNameMode] = useState<"suggestion" | "custom">(
    suggestions.length ? "suggestion" : "custom"
  );
  const [selectedSuggestion, setSelectedSuggestion] = useState<string>(
    suggestions[0] ?? ""
  );

  // ====== Fælles indstillinger
  const [name, setName] = useState<string>(selectedSuggestion || "");
  const [location, setLocation] = useState<"Helsinge" | "Gilleleje">(
    DEFAULT_LOCATION[weekday]
  );
  const [start, setStart] = useState(DEFAULT_TIME[weekday].start);
  const [end, setEnd] = useState(DEFAULT_TIME[weekday].end);
  const [maxPlayers, setMaxPlayers] = useState(16);
  const [minElo, setMinElo] = useState<number | "">("");
  const [maxElo, setMaxElo] = useState<number | "">("");
  const [onlyWomen, setOnlyWomen] = useState(false);
  const [closedGroup, setClosedGroup] = useState(false);
  const [rulesText, setRulesText] = useState("");
  const [isPublished, setIsPublished] = useState(true);
  const [signupUrl, setSignupUrl] = useState(defaultSignupLink(selectedSuggestion || name));

  // ====== Datoer (multi-select) – næste 20 for valgt ugedag
  const [allDates, setAllDates] = useState<string[]>([]);
  const [picked, setPicked] = useState<Record<string, boolean>>({});

  // Når ugedag ændres: opdater defaults + generér nye datoer
  useEffect(() => {
    const s = NAME_SUGGESTIONS[weekday] ?? [];
    const defaultName = s[0] ?? "";

    setSelectedSuggestion(defaultName);
    setNameMode(s.length ? "suggestion" : "custom");

    // defaults
    setLocation(DEFAULT_LOCATION[weekday]);
    setStart(DEFAULT_TIME[weekday].start);
    setEnd(DEFAULT_TIME[weekday].end);

    // name
    const newName = s.length ? defaultName : "";
    setName(newName);
    setSignupUrl(defaultSignupLink(newName));

    // generér datoer
    const base = new Date();
    const out: string[] = [];
    let d = new Date(toISO(base));
    while (d.getDay() !== weekday) d = addDays(d, 1);
    for (let i = 0; i < 20; i++) {
      out.push(toISO(d));
      d = addDays(d, 7);
    }
    setAllDates(out);

    // preselect første 4
    const pre: Record<string, boolean> = {};
    out.slice(0, 4).forEach((dt) => (pre[dt] = true));
    setPicked(pre);
  }, [weekday]);

  // Når dropdown suggestion ændres
  useEffect(() => {
    if (nameMode !== "suggestion") return;
    setName(selectedSuggestion);
    setSignupUrl(defaultSignupLink(selectedSuggestion));
  }, [nameMode, selectedSuggestion]);

  const numPicked = useMemo(
    () => Object.values(picked).filter(Boolean).length,
    [picked]
  );

  const toggleDate = (date: string) =>
    setPicked((prev) => ({ ...prev, [date]: !prev[date] }));

  const selectNone = () => setPicked({});

  const selectTop = (n: number) => {
    const pre: Record<string, boolean> = {};
    allDates.slice(0, n).forEach((dt) => (pre[dt] = true));
    setPicked(pre);
  };

  const validateCommon = () => {
    if (!name.trim()) return "Skriv et navn";
    if (!start || !end) return "Vælg start/slut";
    if (start >= end) return "Sluttid skal være efter starttid";
    if (!maxPlayers || maxPlayers < 4) return "Max spillere skal være mindst 4";
    if (minElo !== "" && maxElo !== "" && Number(minElo) > Number(maxElo))
      return "Min. ELO må ikke være større end max. ELO";
    if (numPicked === 0) return "Vælg mindst én dato";
    return null;
  };

  const [saving, setSaving] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateCommon();
    if (err) {
      alert(err);
      return;
    }
    setSaving(true);
    try {
      const selectedDates = allDates.filter((d) => picked[d]);
      const createdIds: string[] = [];

      for (const date of selectedDates) {
        const body = {
          date,
          start_time: start + ":00",
          end_time: end + ":00",
          location,
          name,
          max_players: maxPlayers,
          min_elo: minElo === "" ? null : Number(minElo),
          max_elo: maxElo === "" ? null : Number(maxElo),
          only_women: onlyWomen,
          closed_group: closedGroup,
          rules_text: rulesText || null,
          is_published: isPublished,
          signup_url: signupUrl || null,
        };

        const res = await fetch("/api/events", {
          method: "POST",
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Kunne ikke oprette event");
        createdIds.push(json.data.id);
      }

      if (createdIds.length) router.push(`/event/${createdIds[0]}`);
    } catch (e: any) {
      alert(e.message || "Fejl ved oprettelse");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-3 sm:p-4 text-gray-900 dark:text-gray-100">
      <h1 className="text-xl sm:text-2xl font-bold mb-3">
        Opret events (ugedage)
      </h1>

      {/* Ugedage – chip buttons */}
      <div className="flex flex-wrap gap-2 mb-3">
        {WEEKDAYS.map((wd) => (
          <button
            key={wd.id}
            type="button"
            onClick={() => setWeekday(wd.id)}
            className={`px-3 py-1 rounded-full border text-sm hover:opacity-90 ${
              wd.id === weekday
                ? "bg-pink-600 text-white border-pink-600"
                : "bg-transparent border-pink-300 dark:border-pink-700 text-pink-700 dark:text-pink-300"
            }`}
          >
            {wd.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleCreate} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {/* Navn: preset dropdown + custom */}
          <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
            <label className="text-xs uppercase opacity-70">
              Navn (preset)
              <select
                value={nameMode === "suggestion" ? selectedSuggestion : "__custom__"}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "__custom__") {
                    setNameMode("custom");
                    if (!name.trim()) setName(""); // ryd hvis vi ikke har noget
                    return;
                  }
                  setNameMode("suggestion");
                  setSelectedSuggestion(v);
                }}
                className="mt-1 w-full border rounded-md px-2 py-1 bg-white dark:bg-zinc-900 dark:border-zinc-700"
              >
                {(NAME_SUGGESTIONS[weekday] ?? []).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
                <option value="__custom__">(Eget navn…)</option>
              </select>
            </label>

            <label className="text-xs uppercase opacity-70">
              Navn (frit)
              <input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  // hvis signupUrl er tom eller følger “auto”, kan du auto-opdatere her:
                  if (!signupUrl) setSignupUrl(defaultSignupLink(e.target.value));
                }}
                placeholder="Skriv evt. eget navn…"
                className="mt-1 w-full border rounded-md px-2 py-1 bg-white dark:bg-zinc-900 dark:border-zinc-700"
              />
            </label>
          </div>

          <label className="text-xs uppercase opacity-70">
            Sted
            <select
              value={location}
              onChange={(e) => setLocation(e.target.value as any)}
              className="mt-1 w-full border rounded-md px-2 py-1 bg-white dark:bg-zinc-900 dark:border-zinc-700"
            >
              <option>Helsinge</option>
              <option>Gilleleje</option>
            </select>
          </label>

          <label className="text-xs uppercase opacity-70">
            Ugedag (valgt)
            <input
              value={WEEKDAY_LABEL[weekday]}
              readOnly
              className="mt-1 w-full border rounded-md px-2 py-1 bg-zinc-50 dark:bg-zinc-900 dark:border-zinc-700 opacity-80"
            />
          </label>

          <label className="text-xs uppercase opacity-70">
            Start
            <input
              type="time"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="mt-1 w-full border rounded-md px-2 py-1 bg-white dark:bg-zinc-900 dark:border-zinc-700"
            />
          </label>

          <label className="text-xs uppercase opacity-70">
            Slut
            <input
              type="time"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              className="mt-1 w-full border rounded-md px-2 py-1 bg-white dark:bg-zinc-900 dark:border-zinc-700"
            />
          </label>

          <label className="text-xs uppercase opacity-70">
            Max spillere
            <input
              type="number"
              min={4}
              step={2}
              value={maxPlayers}
              onChange={(e) => setMaxPlayers(Number(e.target.value))}
              className="mt-1 w-full border rounded-md px-2 py-1 bg-white dark:bg-zinc-900 dark:border-zinc-700"
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs uppercase opacity-70">
              Min ELO
              <input
                type="number"
                value={minElo}
                onChange={(e) =>
                  setMinElo(e.target.value === "" ? "" : Number(e.target.value))
                }
                className="mt-1 w-full border rounded-md px-2 py-1 bg-white dark:bg-zinc-900 dark:border-zinc-700"
              />
            </label>
            <label className="text-xs uppercase opacity-70">
              Max ELO
              <input
                type="number"
                value={maxElo}
                onChange={(e) =>
                  setMaxElo(e.target.value === "" ? "" : Number(e.target.value))
                }
                className="mt-1 w-full border rounded-md px-2 py-1 bg-white dark:bg-zinc-900 dark:border-zinc-700"
              />
            </label>
          </div>

          <label className="text-xs uppercase opacity-70 col-span-full">
            Regler / fritekst
            <input
              value={rulesText}
              onChange={(e) => setRulesText(e.target.value)}
              className="mt-1 w-full border rounded-md px-2 py-1 bg-white dark:bg-zinc-900 dark:border-zinc-700"
            />
          </label>

          <label className="text-xs uppercase opacity-70 col-span-full">
            Tilmeldingslink
            <input
              value={signupUrl}
              onChange={(e) => setSignupUrl(e.target.value)}
              placeholder="https://..."
              className="mt-1 w-full border rounded-md px-2 py-1 bg-white dark:bg-zinc-900 dark:border-zinc-700"
            />
          </label>

          <div className="flex items-center gap-4 col-span-full text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={onlyWomen}
                onChange={(e) => setOnlyWomen(e.target.checked)}
              />{" "}
              Kun kvinder
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={closedGroup}
                onChange={(e) => setClosedGroup(e.target.checked)}
              />{" "}
              Lukket gruppe
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={isPublished}
                onChange={(e) => setIsPublished(e.target.checked)}
              />{" "}
              Offentliggjort
            </label>
          </div>
        </div>

        {/* Dato-vælger */}
        <div className="mt-2">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium">
              Vælg {WEEKDAY_LABEL[weekday]}-datoer (næste 20)
            </div>
            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                className="px-2 py-1 rounded border"
                onClick={() => selectTop(4)}
              >
                Vælg 4
              </button>
              <button
                type="button"
                className="px-2 py-1 rounded border"
                onClick={() => selectTop(8)}
              >
                Vælg 8
              </button>
              <button
                type="button"
                className="px-2 py-1 rounded border"
                onClick={selectNone}
              >
                Nulstil
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {allDates.map((dt) => (
              <label
                key={dt}
                className={`flex items-center gap-2 rounded-md px-2 py-1 border text-sm cursor-pointer ${
                  picked[dt]
                    ? "border-pink-500 bg-pink-50 dark:bg-pink-900/20"
                    : "border-zinc-300 dark:border-zinc-700"
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

          <div className="text-xs opacity-70 mt-1">Valgt: {numPicked}</div>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button
            disabled={saving}
            className="bg-pink-600 text-white px-4 py-2 rounded-md"
          >
            {saving ? "Opretter…" : `Opret ${numPicked} event${numPicked !== 1 ? "s" : ""}`}
          </button>
          <span className="text-xs opacity-70">
            Tip: Vælg ugedag øverst – navn/tid/sted foreslås automatisk.
          </span>
        </div>
      </form>

      {/* ===== Liste over alle events (kompakt + delete) */}
      <section className="mt-6">
        <EventList />
      </section>
    </div>
  );
}

// Udbrudt i egen komponent (stabil hooks)
function EventList() {
  const [listLoading, setListLoading] = useState(true);
  const [allEvents, setAllEvents] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [showPast, setShowPast] = useState(true);

  async function loadEvents() {
    setListLoading(true);
    try {
      const res = await fetch(`/api/events?all=1`, { cache: "no-store" });
      const json = await res.json();
      setAllEvents(json?.data ?? []);
    } catch {
      setAllEvents([]);
    } finally {
      setListLoading(false);
    }
  }

  useEffect(() => {
    loadEvents();
  }, []);

  const filtered = useMemo(() => {
    const txt = q.trim().toLowerCase();
    const today = new Date().toISOString().slice(0, 10);

    const base = (allEvents ?? []).filter((e: any) => {
      if (!txt) return true;
      return (
        (e.name || "").toLowerCase().includes(txt) ||
        (e.location || "").toLowerCase().includes(txt) ||
        (e.rules_text || "").toLowerCase().includes(txt)
      );
    });

    const upcoming = base
      .filter((e: any) => e.date >= today)
      .sort((a: any, b: any) =>
        a.date === b.date
          ? a.start_time < b.start_time
            ? -1
            : 1
          : a.date < b.date
          ? -1
          : 1
      );

    const past = base
      .filter((e: any) => e.date < today)
      .sort((a: any, b: any) =>
        a.date === b.date
          ? a.start_time > b.start_time
            ? -1
            : 1
          : a.date > b.date
          ? -1
          : 1
      );

    return showPast ? [...upcoming, ...past] : upcoming;
  }, [allEvents, q, showPast]);

  async function handleDelete(id: string) {
    if (!confirm("Slet dette event? Dette kan ikke fortrydes.")) return;
    const { error } = await supabase.from("events").delete().eq("id", id);
    if (error) {
      alert(error.message || "Kunne ikke slette");
      return;
    }
    setAllEvents((prev) => prev.filter((x: any) => x.id !== id));
  }

  return (
    <>
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold">Alle events</h2>
        <div className="flex items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Søg navn/sted…"
            className="border p-2 rounded-md bg-white dark:bg-zinc-900 dark:border-zinc-700 text-sm"
          />
          <label className="text-sm flex items-center gap-2">
            <input
              type="checkbox"
              checked={showPast}
              onChange={(e) => setShowPast(e.target.checked)}
            />{" "}
            Vis tidligere
          </label>
        </div>
      </div>

      {listLoading ? (
        <div>Indlæser…</div>
      ) : (
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
          {filtered.map((e: any) => (
            <li key={e.id} className="p-3 sm:p-3.5 bg-white/70 dark:bg-zinc-900/60">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{e.name}</div>
                  <div className="text-xs opacity-80 truncate">
                    {e.date} · {e.start_time?.slice(0, 5)}–{e.end_time?.slice(0, 5)} · {e.location} ·{" "}
                    {e.players_count ?? 0}/{e.max_players}
                  </div>
                  {(e.min_elo != null || e.max_elo != null || e.only_women || e.closed_group) && (
                    <div className="text-[11px] opacity-70 mt-0.5 truncate">
                      ELO {e.min_elo ?? "—"}–{e.max_elo ?? "—"} {e.only_women ? "• Kun kvinder " : ""}
                      {e.closed_group ? "• Lukket gruppe" : ""}
                    </div>
                  )}
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  <a
                    href={`/event/${e.id}`}
                    className="text-pink-700 dark:text-pink-300 text-sm underline"
                  >
                    Redigér
                  </a>
                  <button
                    type="button"
                    title="Slet event"
                    onClick={() => handleDelete(e.id)}
                    className="p-1.5 rounded-md border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 text-xs hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            </li>
          ))}
          {!filtered.length && (
            <li className="p-4 text-sm opacity-70">Ingen events matcher filteret.</li>
          )}
        </ul>
      )}
    </>
  );
}
