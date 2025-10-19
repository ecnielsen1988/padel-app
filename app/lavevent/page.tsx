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
  0: "Søn", 1: "Man", 2: "Tir", 3: "Ons", 4: "Tor", 5: "Fre", 6: "Lør",
};

function defaultSignupLink(name: string) {
  const n = (name || "").toLowerCase();
  if (n.includes("torsdag") || n.includes("fredag")) return "https://www.matchi.se/facilities/PadelhusetHelsinge";
  if (n.includes("onsdag") || n.includes("sunday") || n.includes("søndag")) return "https://www.matchi.se/facilities/padelhuset.dk";
  return "";
}

const PRESETS = [
  { label: "Onsdags Match & Makkerbyt", name: "Onsdags Match & Makkerbyt", weekday: 3 as Weekday, location: "Gilleleje" as const, start: "18:00", end: "20:00" },
  { label: "TorsdagsBold & Bajere", name: "TorsdagsBold & Bajere", weekday: 4 as Weekday, location: "Helsinge" as const, start: "17:00", end: "20:00" },
  { label: "Fredags Fun & Fairplay", name: "Fredags Fun & Fairplay", weekday: 5 as Weekday, location: "Helsinge" as const, start: "16:30", end: "18:30" },
  { label: "Sunday Socials", name: "Sunday Socials", weekday: 0 as Weekday, location: "Gilleleje" as const, start: "10:00", end: "12:00" },
];

export default function LavEventKompakt() {
  const router = useRouter();

  // ====== Fælles indstillinger for en serie events
  const [presetIdx, setPresetIdx] = useState(1); // Torsdag default
  const preset = PRESETS[presetIdx];

  const [name, setName] = useState(preset.name);
  const [location, setLocation] = useState<"Helsinge" | "Gilleleje">(preset.location);
  const [start, setStart] = useState(preset.start);
  const [end, setEnd] = useState(preset.end);
  const [maxPlayers, setMaxPlayers] = useState(16);
  const [minElo, setMinElo] = useState<number | "">("");
  const [maxElo, setMaxElo] = useState<number | "">("");
  const [onlyWomen, setOnlyWomen] = useState(false);
  const [closedGroup, setClosedGroup] = useState(false);
  const [rulesText, setRulesText] = useState("");
  const [isPublished, setIsPublished] = useState(true);
  const [signupUrl, setSignupUrl] = useState(defaultSignupLink(preset.name));

  // ====== Datoer (multi-select) – næste 20 for valgt ugedag
  const [allDates, setAllDates] = useState<string[]>([]);
  const [picked, setPicked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const p = PRESETS[presetIdx];
    setName(p.name);
    setLocation(p.location);
    setStart(p.start);
    setEnd(p.end);
    setSignupUrl(defaultSignupLink(p.name));
    // generér datoer for valgt ugedag
    const base = new Date();
    const out: string[] = [];
    let d = new Date(toISO(base));
    const want = p.weekday;
    while (d.getDay() !== want) d = addDays(d, 1);
    for (let i = 0; i < 20; i++) { out.push(toISO(d)); d = addDays(d, 7); }
    setAllDates(out);
    const pre: Record<string, boolean> = {}; out.slice(0, 4).forEach((dt) => (pre[dt] = true));
    setPicked(pre);
  }, [presetIdx]);

  const numPicked = useMemo(() => Object.values(picked).filter(Boolean).length, [picked]);

  const toggleDate = (date: string) => setPicked((prev) => ({ ...prev, [date]: !prev[date] }));
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
    if (minElo !== "" && maxElo !== "" && Number(minElo) > Number(maxElo)) return "Min. ELO må ikke være større end max. ELO";
    if (numPicked === 0) return "Vælg mindst én dato";
    return null;
  };

  const [saving, setSaving] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validateCommon();
    if (err) { alert(err); return; }
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
        const res = await fetch("/api/events", { method: "POST", body: JSON.stringify(body) });
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
      <h1 className="text-xl sm:text-2xl font-bold mb-3">Opret events (kompakt)</h1>

      {/* Presets – chip buttons */}
      <div className="flex flex-wrap gap-2 mb-3">
        {PRESETS.map((p, i) => (
          <button
            key={p.label}
            type="button"
            onClick={() => setPresetIdx(i)}
            className={`px-3 py-1 rounded-full border text-sm hover:opacity-90 ${
              i === presetIdx
                ? "bg-pink-600 text-white border-pink-600"
                : "bg-transparent border-pink-300 dark:border-pink-700 text-pink-700 dark:text-pink-300"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Compact grid – fælles settings + datoer */}
      <form onSubmit={handleCreate} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <label className="text-xs uppercase opacity-70">
            Navn
            <input
              value={name}
              onChange={(e) => { setName(e.target.value); if (!signupUrl) setSignupUrl(defaultSignupLink(e.target.value)); }}
              className="mt-1 w-full border rounded-md px-2 py-1 bg-white dark:bg-zinc-900 dark:border-zinc-700"
            />
          </label>
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
                onChange={(e) => setMinElo(e.target.value === "" ? "" : Number(e.target.value))}
                className="mt-1 w-full border rounded-md px-2 py-1 bg-white dark:bg-zinc-900 dark:border-zinc-700"
              />
            </label>
            <label className="text-xs uppercase opacity-70">
              Max ELO
              <input
                type="number"
                value={maxElo}
                onChange={(e) => setMaxElo(e.target.value === "" ? "" : Number(e.target.value))}
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
              <input type="checkbox" checked={onlyWomen} onChange={(e) => setOnlyWomen(e.target.checked)} /> Kun kvinder
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={closedGroup} onChange={(e) => setClosedGroup(e.target.checked)} /> Lukket gruppe
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} /> Offentliggjort
            </label>
          </div>
        </div>

        {/* Dato-vælger */}
        <div className="mt-2">
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-medium">Vælg {WEEKDAY_LABEL[preset.weekday]}-datoer (næste 20)</div>
            <div className="flex items-center gap-2 text-xs">
              <button type="button" className="px-2 py-1 rounded border" onClick={() => selectTop(4)}>Vælg 4</button>
              <button type="button" className="px-2 py-1 rounded border" onClick={() => selectTop(8)}>Vælg 8</button>
              <button type="button" className="px-2 py-1 rounded border" onClick={selectNone}>Nulstil</button>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {allDates.map((dt) => (
              <label
                key={dt}
                className={`flex items-center gap-2 rounded-md px-2 py-1 border text-sm cursor-pointer ${
                  picked[dt] ? "border-pink-500 bg-pink-50 dark:bg-pink-900/20" : "border-zinc-300 dark:border-zinc-700"
                }`}
              >
                <input type="checkbox" checked={!!picked[dt]} onChange={() => toggleDate(dt)} />
                <span>{dt}</span>
              </label>
            ))}
          </div>
          <div className="text-xs opacity-70 mt-1">Valgt: {numPicked}</div>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <button disabled={saving} className="bg-pink-600 text-white px-4 py-2 rounded-md">
            {saving ? "Opretter…" : `Opret ${numPicked} event${numPicked !== 1 ? "s" : ""}`}
          </button>
          <span className="text-xs opacity-70">Tip: Skift preset for automatisk ugedag, sted og tidsrum.</span>
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

  useEffect(() => { loadEvents(); }, []);

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
      .sort((a: any, b: any) => (a.date === b.date ? (a.start_time < b.start_time ? -1 : 1) : a.date < b.date ? -1 : 1));

    const past = base
      .filter((e: any) => e.date < today)
      .sort((a: any, b: any) => (a.date === b.date ? (a.start_time > b.start_time ? -1 : 1) : a.date > b.date ? -1 : 1));

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
            <input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} /> Vis tidligere
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
                    {e.date} · {e.start_time?.slice(0, 5)}–{e.end_time?.slice(0, 5)} · {e.location} · {e.players_count ?? 0}/{e.max_players}
                  </div>
                  {(e.min_elo != null || e.max_elo != null || e.only_women || e.closed_group) && (
                    <div className="text-[11px] opacity-70 mt-0.5 truncate">
                      ELO {e.min_elo ?? "—"}–{e.max_elo ?? "—"} {e.only_women ? "• Kun kvinder " : ""}
                      {e.closed_group ? "• Lukket gruppe" : ""}
                    </div>
                  )}
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  <a href={`/event/${e.id}`} className="text-pink-700 dark:text-pink-300 text-sm underline">Redigér</a>
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
          {!filtered.length && <li className="p-4 text-sm opacity-70">Ingen events matcher filteret.</li>}
        </ul>
      )}
    </>
  );
}

