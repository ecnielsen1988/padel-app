"use client";

import { useState, type FormEvent } from "react";
import { MAX_WEEK_SESSIONS, WEEKDAYS, WEEK_TEXT_LIMITS, type WeekSession } from "@/lib/tvWeekProgram";

const NEW_SESSION: WeekSession = {
  day: "Mandag", title: "", starts: "17:00", ends: "18:30", place: "", level: "", minPoints: "", maxPoints: "",
};

const INPUTS = [
  { key: "title", label: "Navn", type: "text", maxLength: WEEK_TEXT_LIMITS.title },
  { key: "starts", label: "Fra kl.", type: "time" },
  { key: "ends", label: "Til kl.", type: "time" },
  { key: "place", label: "Sted", type: "text", maxLength: WEEK_TEXT_LIMITS.place },
  { key: "level", label: "Niveau", type: "text", maxLength: WEEK_TEXT_LIMITS.level },
  { key: "minPoints", label: "Point fra", type: "number", optional: true },
  { key: "maxPoints", label: "Point til", type: "number", optional: true },
] as const;

const inputClass = "block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900";

export default function WeekProgramEditor({ initialProgram }: { initialProgram: WeekSession[] }) {
  const [program, setProgram] = useState(initialProgram);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  function update(index: number, patch: Partial<WeekSession>) {
    setProgram((current) => current.map((entry, i) => i === index ? { ...entry, ...patch } : entry));
    setMessage("");
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/tv/ugeprogram", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ program }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Ugeprogrammet kunne ikke gemmes.");
      setProgram(data.program);
      setMessage("Ugeprogrammet er gemt. TV’et henter ændringen automatisk.");
    } catch (error) {
      setMessage(error instanceof Error && error.name === "Error" ? error.message : "Ugeprogrammet kunne ikke gemmes. Prøv igen.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      {program.map((entry, index) => (
        <fieldset key={index} disabled={saving} className="rounded-xl border border-pink-200 bg-white px-4 pb-4">
          <legend className="px-2 font-bold">{entry.title || "Nyt spilletilbud"}</legend>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="text-sm font-medium">
              Ugedag
              <select className={inputClass} value={entry.day} onChange={(event) => update(index, { day: event.target.value as WeekSession["day"] })}>
                {WEEKDAYS.map((day) => <option key={day}>{day}</option>)}
              </select>
            </label>
            {INPUTS.map((input) => (
              <label key={input.key} className="min-w-0 text-sm font-medium">
                {input.label}
                <input
                  className={inputClass}
                  type={input.type}
                  required={!("optional" in input)}
                  maxLength={"maxLength" in input ? input.maxLength : undefined}
                  min={input.type === "number" ? 0 : undefined}
                  max={input.type === "number" ? 99999 : undefined}
                  value={entry[input.key]}
                  onChange={(event) => update(index, { [input.key]: event.target.value })}
                />
              </label>
            ))}
          </div>
          <button type="button" disabled={program.length <= 1} onClick={() => {
            setProgram((current) => current.filter((_, i) => i !== index));
            setMessage("");
          }} className="mt-3 text-sm font-semibold text-pink-800 underline disabled:opacity-40">Fjern tilbud</button>
        </fieldset>
      ))}
      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 rounded-xl border border-pink-200 bg-white p-4">
        <button type="submit" disabled={saving} className="rounded-lg bg-pink-700 px-4 py-2 font-bold text-white disabled:opacity-50">
          {saving ? "Gemmer…" : "Gem ugeprogram"}
        </button>
        <button type="button" disabled={saving || program.length >= MAX_WEEK_SESSIONS} onClick={() => {
          setProgram((current) => [...current, NEW_SESSION]);
          setMessage("");
        }} className="rounded-lg border border-pink-700 px-4 py-2 font-bold text-pink-800 disabled:opacity-40">Tilføj spilletilbud</button>
        <p role="status" className="text-sm font-semibold">{message}</p>
      </div>
    </form>
  );
}
