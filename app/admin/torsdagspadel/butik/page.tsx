"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatOre } from "@/lib/torsdagEconomyV2";

type Player = {
  id: string;
  visningsnavn: string;
};

type Summary = {
  outstandingFineOre: number;
  beerCount: number;
  sodaCount: number;
};

type HistoryEntry = {
  id: string;
  entryType: "fine" | "drink";
  title: string;
  subtitle: string;
  amountLabel: string;
  tone: "rose" | "emerald";
  createdAt: string;
};

type FinePreset = {
  label: string;
  amountKr: number;
  note: string;
};

const FINE_PRESETS: FinePreset[] = [
  { label: "Afbud efter tilmelding", amountKr: 30, note: "Afbud efter tilmelding" },
  { label: "Afbud på dagen", amountKr: 100, note: "Afbud på dagen" },
  { label: "Udeblivelse", amountKr: 500, note: "Udeblivelse" },
  { label: "Dårlig opførsel", amountKr: 30, note: "Dårlig opførsel" },
  { label: "Dårlig opførsel overfor banen", amountKr: 100, note: "Dårlig opførsel overfor banen" },
  { label: "Glemte sager", amountKr: 30, note: "Glemte sager" },
  { label: "Manglende holdkampstrøje", amountKr: 30, note: "Manglende holdkampstrøje til holdkampe" },
  { label: "Manglende betaling i baren", amountKr: 100, note: "Manglende betaling i baren" },
  { label: "Manglende betaling af bøder", amountKr: 50, note: "Manglende betaling af bøder" },
];

function todayCphISO() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Copenhagen",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function toOre(kr: number) {
  return Math.round(kr * 100);
}

function formatDateTime(value: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("da-DK", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function AdminButikPage() {
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);
  const [selected, setSelected] = useState("");
  const [eventDate, setEventDate] = useState(todayCphISO());
  const [summary, setSummary] = useState<Summary>({ outstandingFineOre: 0, beerCount: 0, sodaCount: 0 });
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [lateMinutes, setLateMinutes] = useState("5");
  const [earnedBeer, setEarnedBeer] = useState("0");
  const [earnedSoda, setEarnedSoda] = useState("0");
  const [redeemBeer, setRedeemBeer] = useState("1");
  const [redeemSoda, setRedeemSoda] = useState("1");
  const [customFineLabel, setCustomFineLabel] = useState("");
  const [customFineAmount, setCustomFineAmount] = useState("");

  async function loadPlayers() {
    const res = await fetch("/api/torsdag/admin/players", { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) {
      setAllowed(false);
      setLoading(false);
      return;
    }

    const nextPlayers = (data.players ?? []) as Player[];
    setPlayers(nextPlayers);
    setAllowed(true);
    setSelected((prev) => prev || nextPlayers[0]?.visningsnavn || "");
    setLoading(false);
  }

  async function loadPlayerEconomy(name: string) {
    if (!name) return;
    const res = await fetch(`/api/torsdag/admin/economy?player=${encodeURIComponent(name)}`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Kunne ikke hente data");
      return;
    }

    setSummary({
      outstandingFineOre: Number(data.summary?.outstandingFineOre ?? 0),
      beerCount: Number(data.summary?.beerCount ?? 0),
      sodaCount: Number(data.summary?.sodaCount ?? 0),
    });
    setHistory((data.history ?? []) as HistoryEntry[]);
  }

  useEffect(() => {
    void loadPlayers();
  }, []);

  useEffect(() => {
    if (!selected || !allowed) return;
    void loadPlayerEconomy(selected);
  }, [selected, allowed]);

  async function submitAction(payload: Record<string, unknown>, successMessage: string) {
    setSaving(true);
    setError(null);
    setSuccess(null);

    const res = await fetch("/api/torsdag/admin/economy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setSaving(false);

    if (!res.ok) {
      setError(data.error ?? "Noget gik galt");
      return false;
    }

    setSuccess(successMessage);
    await loadPlayerEconomy(selected);
    return true;
  }

  async function addFine(reason: string, amountKr: number, fineType: string, minutesLate?: number) {
    await submitAction(
      {
        action: "addFine",
        playerName: selected,
        fineType,
        reason,
        amountOre: toOre(amountKr),
        eventDate,
        minutesLate: minutesLate ?? null,
      },
      "Bøde registreret"
    );
  }

  async function addLateFine() {
    const minutes = Number(lateMinutes.replace(",", "."));
    if (!Number.isFinite(minutes) || minutes <= 0) {
      setError("Skriv et gyldigt antal minutter.");
      return;
    }
    await addFine(`For sent fremmøde (${minutes} min)`, minutes * 5, "late", minutes);
  }

  async function addCustomFine() {
    const label = customFineLabel.trim();
    const amount = Number(customFineAmount.replace(",", "."));
    if (!label) {
      setError("Skriv hvad den diverse bøde er for.");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Skriv et gyldigt bødebeløb.");
      return;
    }
    const ok = await submitAction(
      {
        action: "addFine",
        playerName: selected,
        fineType: "custom",
        reason: label,
        amountOre: toOre(amount),
        eventDate,
      },
      "Diverse bøde registreret"
    );
    if (ok) {
      setCustomFineLabel("");
      setCustomFineAmount("");
    }
  }

  async function addEarnedDrink(drinkType: "beer" | "soda", quantity: string) {
    const qty = Number(quantity.replace(",", "."));
    if (!Number.isFinite(qty) || qty <= 0) {
      setError(drinkType === "beer" ? "Skriv hvor mange øl der er vundet." : "Skriv hvor mange sodavand der er vundet.");
      return;
    }
    const ok = await submitAction(
      {
        action: "addDrink",
        playerName: selected,
        drinkType,
        direction: "earned",
        quantity: qty,
        eventDate,
        note: drinkType === "beer" ? "Præmie: Øl" : "Præmie: Sodavand",
      },
      "Præmie registreret"
    );
    if (ok) {
      if (drinkType === "beer") setEarnedBeer("0");
      if (drinkType === "soda") setEarnedSoda("0");
    }
  }

  async function redeemDrink(drinkType: "beer" | "soda", quantity: string) {
    const qty = Number(quantity.replace(",", "."));
    if (!Number.isFinite(qty) || qty <= 0) {
      setError(drinkType === "beer" ? "Skriv hvor mange øl der udleveres." : "Skriv hvor mange sodavand der udleveres.");
      return;
    }

    const available = drinkType === "beer" ? summary.beerCount : summary.sodaCount;
    if (qty > available) {
      setError(
        drinkType === "beer"
          ? "Spilleren har ikke nok øl til gode. Resten skal betales direkte til Padelhuset."
          : "Spilleren har ikke nok sodavand til gode. Resten skal betales direkte til Padelhuset."
      );
      return;
    }

    await submitAction(
      {
        action: "addDrink",
        playerName: selected,
        drinkType,
        direction: "redeemed",
        quantity: qty,
        eventDate,
        note: drinkType === "beer" ? "Udleveret øl" : "Udleveret sodavand",
      },
      "Udlevering registreret"
    );
  }

  async function deleteHistoryEntry(entry: HistoryEntry) {
    await submitAction(
      {
        action: entry.entryType === "fine" ? "deleteFine" : "deleteDrink",
        id: entry.id,
      },
      "Linjen er slettet"
    );
  }

  const playerOptions = useMemo(() => players.map((player) => player.visningsnavn), [players]);

  if (loading) {
    return (
      <main className="mx-auto max-w-3xl p-8">
        <h1 className="mb-6 text-3xl font-bold">Admin · Butik</h1>
        <p>Indlæser…</p>
      </main>
    );
  }

  if (!allowed) {
    return (
      <main className="mx-auto max-w-3xl p-8">
        <h1 className="mb-6 text-3xl font-bold">Admin · Butik</h1>
        <p>Du har ikke adgang til denne side.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl p-4 text-gray-900">
      <div className="rounded-[28px] bg-gradient-to-br from-emerald-700 via-green-600 to-emerald-500 p-6 text-white shadow-xl">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-white/75">Admin</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight">Butik</h1>
            <p className="mt-2 max-w-2xl text-sm text-white/85">Bøder og præmiedrikke samlet ét sted.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/torsdagspadel" className="rounded-full bg-white/15 px-4 py-2 text-sm font-bold text-white">
              ← Torsdagspadel
            </Link>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-[28px] border border-emerald-100 bg-white p-5 shadow-[0_20px_60px_rgba(5,120,87,0.08)]">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">Spiller</span>
              <select
                value={selected}
                onChange={(event) => setSelected(event.target.value)}
                className="w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 font-semibold outline-none transition focus:border-emerald-500"
              >
                {playerOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">Dato</span>
              <input
                type="date"
                value={eventDate}
                onChange={(event) => setEventDate(event.target.value)}
                className="w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 font-semibold outline-none transition focus:border-emerald-500"
              />
            </label>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <InfoCard label="Ubetalte bøder" value={formatOre(summary.outstandingFineOre)} tone="rose" />
            <InfoCard label="🍺 Til gode" value={String(summary.beerCount)} tone="emerald" />
            <InfoCard label="🥤 Til gode" value={String(summary.sodaCount)} tone="emerald" />
          </div>

          <div className="mt-6 rounded-[24px] border border-sky-200 bg-sky-50 p-4">
            <div className="mb-3">
              <h2 className="text-lg font-black text-sky-950">Udlever drikke</h2>
              <p className="text-sm text-sky-900">Hvis spilleren ikke har nok til gode, skal resten betales direkte til Padelhuset.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <DrinkActionCard
                title="Udlever øl"
                emoji="🍺"
                available={summary.beerCount}
                value={redeemBeer}
                setValue={setRedeemBeer}
                onSubmit={() => void redeemDrink("beer", redeemBeer)}
                saving={saving}
              />
              <DrinkActionCard
                title="Udlever sodavand"
                emoji="🥤"
                available={summary.sodaCount}
                value={redeemSoda}
                setValue={setRedeemSoda}
                onSubmit={() => void redeemDrink("soda", redeemSoda)}
                saving={saving}
              />
            </div>
          </div>

          <div className="mt-6 rounded-[24px] border border-emerald-200 bg-emerald-50 p-4">
            <div className="mb-3">
              <h2 className="text-lg font-black text-emerald-950">Tildel præmiedrikke</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <DrinkActionCard
                title="Vundne øl"
                emoji="🍺"
                available={summary.beerCount}
                value={earnedBeer}
                setValue={setEarnedBeer}
                onSubmit={() => void addEarnedDrink("beer", earnedBeer)}
                saving={saving}
                buttonLabel="Gem præmie"
              />
              <DrinkActionCard
                title="Vundne sodavand"
                emoji="🥤"
                available={summary.sodaCount}
                value={earnedSoda}
                setValue={setEarnedSoda}
                onSubmit={() => void addEarnedDrink("soda", earnedSoda)}
                saving={saving}
                buttonLabel="Gem præmie"
              />
            </div>
          </div>

          <div className="mt-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-black text-emerald-950">Faste bøder</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {FINE_PRESETS.map((preset) => (
                <button
                  key={preset.note}
                  type="button"
                  onClick={() => void addFine(preset.note, preset.amountKr, "preset")}
                  disabled={saving || !selected}
                  className="rounded-[22px] border border-rose-200 bg-rose-50 px-4 py-4 text-left transition hover:border-rose-300 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <div className="text-sm font-black text-rose-700">{preset.label}</div>
                  <div className="mt-1 text-2xl font-black text-rose-950">{preset.amountKr} kr.</div>
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6 rounded-[24px] border border-amber-200 bg-amber-50 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-end">
              <label className="flex-1 space-y-2">
                <span className="text-xs font-bold uppercase tracking-[0.16em] text-amber-700">For sent fremmøde</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={lateMinutes}
                  onChange={(event) => setLateMinutes(event.target.value)}
                  className="w-full rounded-2xl border border-amber-200 bg-white px-4 py-3 font-semibold outline-none transition focus:border-amber-500"
                />
              </label>
              <button
                type="button"
                onClick={() => void addLateFine()}
                disabled={saving || !selected}
                className="rounded-2xl bg-amber-500 px-5 py-3 font-bold text-white transition hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Registrér {Number(lateMinutes || 0) * 5 || 0} kr.
              </button>
            </div>
          </div>

          <div className="mt-6 rounded-[24px] border border-zinc-200 bg-zinc-50 p-4">
            <div className="mb-3">
              <h2 className="text-lg font-black text-zinc-950">Diverse bøde</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1.5fr_0.7fr_auto]">
              <input
                value={customFineLabel}
                onChange={(event) => setCustomFineLabel(event.target.value)}
                placeholder="Hvad er bøden for?"
                className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 outline-none transition focus:border-zinc-400"
              />
              <input
                type="number"
                min="1"
                step="1"
                value={customFineAmount}
                onChange={(event) => setCustomFineAmount(event.target.value)}
                placeholder="Kr."
                className="w-full rounded-2xl border border-zinc-200 bg-white px-4 py-3 outline-none transition focus:border-zinc-400"
              />
              <button
                type="button"
                onClick={() => void addCustomFine()}
                disabled={saving || !selected}
                className="rounded-2xl bg-zinc-900 px-5 py-3 font-bold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Gem bøde
              </button>
            </div>
          </div>

          {(error || success) && (
            <div className={`mt-4 rounded-2xl px-4 py-3 text-sm font-semibold ${error ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>
              {error ?? success}
            </div>
          )}
        </section>

        <section className="rounded-[28px] border border-emerald-100 bg-white p-5 shadow-[0_20px_60px_rgba(5,120,87,0.08)]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">Historik</p>
              <h2 className="mt-1 text-xl font-black text-emerald-950">{selected || "Ingen valgt"}</h2>
            </div>
            <div className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-600">
              {history.length} linjer
            </div>
          </div>

          {history.length === 0 ? (
            <div className="mt-4 rounded-[22px] border border-dashed border-emerald-200 bg-emerald-50/60 p-6 text-sm text-zinc-600">
              Ingen registreringer endnu.
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {history.map((entry) => (
                <div key={`${entry.entryType}-${entry.id}`} className="rounded-[22px] border border-zinc-100 bg-zinc-50 px-4 py-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-sm font-black text-zinc-900">{entry.title}</div>
                      <div className="mt-1 text-xs text-zinc-500">{formatDateTime(entry.createdAt)}</div>
                    </div>
                    <div className={`shrink-0 text-right text-lg font-black ${entry.tone === "rose" ? "text-rose-600" : "text-emerald-700"}`}>
                      {entry.amountLabel}
                    </div>
                  </div>
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={() => void deleteHistoryEntry(entry)}
                      disabled={saving}
                      className="rounded-full border border-rose-200 bg-white px-3 py-1.5 text-xs font-bold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Slet linje
                    </button>
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

function InfoCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "emerald" | "rose";
}) {
  const toneClasses = {
    emerald: "bg-emerald-50 text-emerald-950",
    rose: "bg-rose-50 text-rose-950",
  } as const;

  return (
    <div className={`rounded-[22px] px-4 py-4 ${toneClasses[tone]}`}>
      <div className="text-xs font-bold uppercase tracking-[0.14em] opacity-70">{label}</div>
      <div className="mt-2 text-xl font-black">{value}</div>
    </div>
  );
}

function DrinkActionCard({
  title,
  emoji,
  available,
  value,
  setValue,
  onSubmit,
  saving,
  buttonLabel = "Gem",
}: {
  title: string;
  emoji: string;
  available: number;
  value: string;
  setValue: (value: string) => void;
  onSubmit: () => void;
  saving: boolean;
  buttonLabel?: string;
}) {
  return (
    <div className="rounded-[22px] border border-sky-200 bg-white px-4 py-4">
      <div className="text-sm font-black text-sky-700">{title}</div>
      <div className="mt-1 text-2xl font-black text-sky-950">{emoji} {available}</div>
      <div className="mt-3 flex gap-2">
        <input
          type="number"
          min="0"
          step="1"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="w-full rounded-2xl border border-sky-200 bg-white px-4 py-3 font-semibold outline-none transition focus:border-sky-500"
        />
        <button
          type="button"
          onClick={onSubmit}
          disabled={saving}
          className="rounded-2xl bg-sky-600 px-4 py-3 font-bold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {buttonLabel}
        </button>
      </div>
    </div>
  );
}
