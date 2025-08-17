"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// --------- Helper utils ---------
const toOre = (kr: number) => Math.round(kr * 100);
const fmt = (ore: number) => new Intl.NumberFormat("da-DK", { style: "currency", currency: "DKK" }).format(ore / 100);
const todayISO = () => new Date().toISOString().slice(0, 10);

// Produktnøgler skal matche CHECK-constraint i tabellen
const PRODUCTS = {
  stor_fadoel: { label: "Stor Fadøl", priceKr: 40, sign: -1 },
  lille_fadoel: { label: "Lille Fadøl", priceKr: 30, sign: -1 },
  stor_oel: { label: "Stor Øl", priceKr: 35, sign: -1 },
  lille_oel: { label: "Lille Øl", priceKr: 25, sign: -1 },
  sodavand: { label: "Sodavand", priceKr: 25, sign: -1 },
  chips: { label: "Chips", priceKr: 15, sign: -1 },
} as const;

// Køb der tæller i "Salg (brutto)" (ekskl. bøder, indbetaling, rabat, præmier)
const PURCHASE_KEYS = [
  "stor_fadoel",
  "lille_fadoel",
  "stor_oel",
  "lille_oel",
  "sodavand",
  "chips",
] as const;

// Drikkevarer – anvendes til evt. "første drik gratis"
const BEVERAGE_KEYS = [
  "stor_fadoel",
  "lille_fadoel",
  "stor_oel",
  "lille_oel",
  "sodavand",
] as const;

type PrizeKey =
  | "praemie_aften_1"
  | "praemie_aften_2"
  | "praemie_aften_3"
  | "praemie_maaned_1"
  | "praemie_maaned_2"
  | "praemie_maaned_3"
  | "praemie_maaned_mest_aktive";

const PRIZE_BUTTONS: { key: PrizeKey; label: string; amountKr: number }[] = [
  { key: "praemie_aften_1", label: "Aftenens Spiller", amountKr: 100 },
  { key: "praemie_aften_2", label: "Aftenens nr. 2", amountKr: 50 },
  { key: "praemie_aften_3", label: "Aftenens nr. 3", amountKr: 25 },
  { key: "praemie_maaned_1", label: "Månedens Spiller", amountKr: 250 },
  { key: "praemie_maaned_2", label: "Månedens nr. 2", amountKr: 100 },
  { key: "praemie_maaned_3", label: "Månedens nr. 3", amountKr: 50 },
  { key: "praemie_maaned_mest_aktive", label: "Månedens mest aktive", amountKr: 200 },
];

// --------- Types ---------
type Player = { visningsnavn: string };
type Entry = {
  id: number;
  event_date: string;
  visningsnavn: string;
  product: string;
  qty: number;
  amount_ore: number;
  note: string | null;
  created_at: string;
};

type BarSession = {
  event_date: string;
  free_first_drink: boolean;
  created_at: string;
  created_by: string | null;
};

// --------- Simple Modal ---------
function Modal({ open, title, children, onClose }: { open: boolean; title: string; children: React.ReactNode; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 text-lg font-semibold">{title}</div>
        {children}
        <div className="mt-4 text-right">
          <button className="rounded-xl border px-4 py-2" onClick={onClose}>Luk</button>
        </div>
      </div>
    </div>
  );
}

// --------- Main Page Component ---------
export default function AdminButikPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(true);
  const [selected, setSelected] = useState<string>("");

  const [entries, setEntries] = useState<Entry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [inserting, setInserting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [bodeOpen, setBodeOpen] = useState(false);
  const [bodeBelob, setBodeBelob] = useState<string>("");
  const [bodeNote, setBodeNote] = useState<string>("");

  const [indbOpen, setIndbOpen] = useState(false);
  const [indbBelob, setIndbBelob] = useState<string>("");
  const [indbNote, setIndbNote] = useState<string>("MobilePay");

  const [totals, setTotals] = useState<{ sales_ore: number; payments_ore: number; discounts_ore: number; prizes_ore: number; net_ore: number }>({ sales_ore: 0, payments_ore: 0, discounts_ore: 0, prizes_ore: 0, net_ore: 0 });

  // Session flag (første drik gratis?)
  const [freeFirstDrink, setFreeFirstDrink] = useState<boolean | null>(null);
  const [askSessionOpen, setAskSessionOpen] = useState(false);

  const today = useMemo(() => todayISO(), []);

  // Load players for today's event, else fallback to torsdagspadel profiles
  useEffect(() => {
    (async () => {
      setLoadingPlayers(true);
      setError(null);
      const d = today;

      // Try event_signups (event_date, visningsnavn)
      let { data: signups } = await supabase
        .from("event_signups")
        .select("visningsnavn")
        .eq("event_date", d)
        .order("visningsnavn", { ascending: true });

      let list: Player[] = [];
      if (signups && signups.length > 0) {
        list = signups as Player[];
      } else {
        // Fallback: profiles where torsdagspadel = true
        const { data: profs } = await supabase
          .from("profiles")
          .select("visningsnavn")
          .eq("torsdagspadel", true)
          .not("visningsnavn", "is", null)
          .order("visningsnavn", { ascending: true });
        if (profs) list = profs as Player[];
      }

      setPlayers(list);
      if (list.length && !selected) setSelected(list[0].visningsnavn);
      setLoadingPlayers(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today]);

  // Load today's entries for selected player
  async function refreshPlayerEntries(name: string) {
    setEntriesLoading(true);
    const { data } = await supabase
      .from("bar_entries")
      .select("id, event_date, visningsnavn, product, qty, amount_ore, note, created_at")
      .eq("visningsnavn", name)
      .eq("event_date", today)
      .order("created_at", { ascending: false });
    if (data) setEntries(data as Entry[]);
    setEntriesLoading(false);
  }

  useEffect(() => {
    if (selected) refreshPlayerEntries(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, today]);

  // Load all today's totals (salg brutto, betalinger, rabatter, præmier, netto)
  async function refreshTotals() {
    const { data } = await supabase
      .from("bar_entries")
      .select("product, amount_ore")
      .eq("event_date", today);
    if (!data) return;
    let sales = 0, payments = 0, discounts = 0, prizes = 0, net = 0;
    for (const r of data as Pick<Entry, "product" | "amount_ore">[]) {
      net += r.amount_ore;
      // Salg (brutto): kun købsvare og negative beløb
      if ((PURCHASE_KEYS as readonly string[]).includes(r.product) && r.amount_ore < 0) sales += -r.amount_ore;
      // Indbetalinger: kun indbetaling
      if (r.product === "indbetaling" && r.amount_ore > 0) payments += r.amount_ore;
      // Rabatter: positive rabatposter
      if (r.product === "rabat" && r.amount_ore > 0) discounts += r.amount_ore;
      // Præmier: positive præmieposter
      if ((["praemie_aften_1","praemie_aften_2","praemie_aften_3","praemie_maaned_1","praemie_maaned_2","praemie_maaned_3","praemie_maaned_mest_aktive"] as const).includes(r.product as any) && r.amount_ore > 0) prizes += r.amount_ore;
    }
    setTotals({ sales_ore: sales, payments_ore: payments, discounts_ore: discounts, prizes_ore: prizes, net_ore: net });
  }

  useEffect(() => { refreshTotals(); }, [today, selected, entries.length]);

  const saldoOre = useMemo(() => entries.reduce((acc, e) => acc + e.amount_ore, 0), [entries]);

  // Insert en eller flere rækker (bruges til rabat+salgs-par)
  async function insertRows(rows: Array<{ visningsnavn: string; product: string; amount_ore: number; qty?: number; note?: string | null }>) {
    setInserting(true);
    setError(null);
    const payload = rows.map((r) => ({
      event_date: today,
      visningsnavn: r.visningsnavn,
      product: r.product,
      qty: r.qty ?? 1,
      amount_ore: r.amount_ore,
      note: r.note ?? null,
    }));
    const { error } = await supabase.from("bar_entries").insert(payload);
    setInserting(false);
    if (error) { setError(error.message); return; }
    if (selected) await refreshPlayerEntries(selected);
    await refreshTotals();
  }

  // Har spilleren allerede en drikkevare i dag?
  async function isFirstBeverageToday(visningsnavn: string) {
    const { count } = await supabase
      .from("bar_entries")
      .select("id", { count: "exact", head: true })
      .eq("visningsnavn", visningsnavn)
      .eq("event_date", today)
      .in("product", BEVERAGE_KEYS as unknown as string[]);
    return (count ?? 0) === 0;
  }

  // Klik på faste produkter
  async function handleFixed(key: keyof typeof PRODUCTS) {
    if (!selected) return;
    const p = PRODUCTS[key];
    const amount = p.sign * toOre(p.priceKr); // negativt beløb (salg)

    const rows: Array<{ visningsnavn: string; product: string; amount_ore: number; note?: string }> = [
      { visningsnavn: selected, product: key as string, amount_ore: amount },
    ];

    // Første drikkevare i dag → spørg/brug session-flag
    if ((BEVERAGE_KEYS as readonly string[]).includes(key as string)) {
      // Hvis vi ikke ved det endnu, spørg
      if (freeFirstDrink === null) {
        setAskSessionOpen(true);
        return; // brugeren skal vælge først – klik produkt igen bagefter
      }
      if (freeFirstDrink && await isFirstBeverageToday(selected)) {
        rows.push({ visningsnavn: selected, product: "rabat", amount_ore: Math.abs(amount), note: "Første drikkevare 100% rabat" });
      }
    }

    await insertRows(rows);
  }

  // Bøde
  function openBode() { setBodeBelob(""); setBodeNote(""); setBodeOpen(true); }
  async function submitBode() {
    const val = parseFloat(bodeBelob.replace(",", "."));
    if (!selected || isNaN(val) || val <= 0) return;
    await insertRows([{ visningsnavn: selected, product: "boede", amount_ore: -toOre(val), note: bodeNote }]);
    setBodeOpen(false);
  }

  // Indbetaling
  function openIndb() { setIndbBelob(""); setIndbNote("MobilePay"); setIndbOpen(true); }
  async function submitIndb() {
    const val = parseFloat(indbBelob.replace(",", "."));
    if (!selected || isNaN(val) || val <= 0) return;
    await insertRows([{ visningsnavn: selected, product: "indbetaling", amount_ore: toOre(val), note: indbNote }]);
    setIndbOpen(false);
  }

  // Præmie
  async function givePrize(key: PrizeKey, amountKr: number) {
    if (!selected) return;
    await insertRows([{ visningsnavn: selected, product: key, amount_ore: toOre(amountKr), note: "Præmie" }]);
  }

  // Fortryd sidste
  async function undoLast() {
    if (!selected) return;
    const { data: last } = await supabase
      .from("bar_entries")
      .select("id")
      .eq("visningsnavn", selected)
      .eq("event_date", today)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!last) return;
    await supabase.from("bar_entries").delete().eq("id", last.id);
    if (selected) await refreshPlayerEntries(selected);
    await refreshTotals();
  }

  // Hent/opret session (freeFirstDrink flag)
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("bar_sessions")
        .select("event_date, free_first_drink")
        .eq("event_date", today)
        .maybeSingle();
      if (data) setFreeFirstDrink((data as BarSession).free_first_drink);
      else setAskSessionOpen(true);
    })();
  }, [today]);

  async function chooseFirstDrinkPolicy(flag: boolean) {
    setFreeFirstDrink(flag);
    setAskSessionOpen(false);
    // Persistér til DB
    await supabase.from("bar_sessions").upsert({ event_date: today, free_first_drink: flag });
  }

  return (
    <div className="mx-auto grid h-[calc(100vh-4rem)] max-w-6xl grid-cols-1 gap-4 p-4 md:grid-cols-3">
      {/* Venstre: spillere */}
      <div className="rounded-2xl border bg-white p-3 shadow-sm md:col-span-1">
        <div className="mb-3 text-lg font-semibold">Dagens spillere</div>
        {loadingPlayers ? (
          <div>Henter spillere…</div>
        ) : players.length === 0 ? (
          <div className="text-sm text-gray-500">Ingen spillere fundet for i dag.</div>
        ) : (
          <ul className="max-h-[70vh] space-y-1 overflow-auto pr-1">
            {players.map((p) => (
              <li key={p.visningsnavn}>
                <button
                  onClick={() => setSelected(p.visningsnavn)}
                  className={`w-full rounded-xl px-3 py-2 text-left transition ${
                    selected === p.visningsnavn ? "bg-pink-100 ring-2 ring-pink-300" : "hover:bg-gray-50"
                  }`}
                >
                  {p.visningsnavn}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Højre: knapper + saldo */}
      <div className="md:col-span-2">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-lg font-semibold">Bar (i dag)</div>
          <div className="flex items-center gap-3 text-sm text-gray-600">
            <span>{today}</span>
            <span className="hidden sm:inline">•</span>
            <div className="flex items-center gap-2">
              <span className="text-gray-600">Første drik gratis:</span>
              <button
                onClick={() => chooseFirstDrinkPolicy(!(freeFirstDrink ?? false))}
                className={`rounded-full px-3 py-1 ${freeFirstDrink ? 'bg-emerald-600 text-white' : 'bg-gray-200 text-gray-700'}`}
              >{freeFirstDrink ? 'Ja' : 'Nej'}</button>
            </div>
          </div>
        </div>

        {/* Aftentotal */}
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <div className="rounded-2xl border bg-white p-3 text-center shadow-sm">
            <div className="text-xs uppercase text-gray-500">Salg (brutto)</div>
            <div className="text-lg font-semibold">{fmt(totals.sales_ore)}</div>
            <div className="text-[11px] text-gray-400">Ekskl. bøder/indbet./præmier</div>
          </div>
          <div className="rounded-2xl border bg-white p-3 text-center shadow-sm">
            <div className="text-xs uppercase text-gray-500">Indbetalinger</div>
            <div className="text-lg font-semibold">{fmt(totals.payments_ore)}</div>
          </div>
          <div className="rounded-2xl border bg-white p-3 text-center shadow-sm">
            <div className="text-xs uppercase text-gray-500">Rabatter</div>
            <div className="text-lg font-semibold">{fmt(totals.discounts_ore)}</div>
          </div>
          <div className="rounded-2xl border bg-white p-3 text-center shadow-sm">
            <div className="text-xs uppercase text-gray-500">Præmier</div>
            <div className="text-lg font-semibold">{fmt(totals.prizes_ore)}</div>
          </div>
          <div className="rounded-2xl border bg-white p-3 text-center shadow-sm">
            <div className="text-xs uppercase text-gray-500">Netto</div>
            <div className={`text-lg font-semibold ${totals.net_ore < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{fmt(totals.net_ore)}</div>
          </div>
        </div>

        {/* Produktknapper */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Object.entries(PRODUCTS).map(([key, p]) => (
            <button
              key={key}
              disabled={!selected || inserting}
              onClick={() => handleFixed(key as keyof typeof PRODUCTS)}
              className="rounded-2xl bg-pink-500 px-4 py-6 text-white shadow hover:bg-pink-600 disabled:opacity-40"
            >
              <div className="text-base font-semibold">{p.label}</div>
              <div className="text-sm opacity-90">{fmt(toOre(p.priceKr))}</div>
            </button>
          ))}

          {/* Bøde */}
          <button
            disabled={!selected || inserting}
            onClick={() => setBodeOpen(true)}
            className="rounded-2xl bg-amber-500 px-4 py-6 text-white shadow hover:bg-amber-600 disabled:opacity-40"
          >
            <div className="text-base font-semibold">Bøde</div>
            <div className="text-sm opacity-90">Valgfrit beløb</div>
          </button>

          {/* Indbetaling */}
          <button
            disabled={!selected || inserting}
            onClick={() => setIndbOpen(true)}
            className="rounded-2xl bg-emerald-600 px-4 py-6 text-white shadow hover:bg-emerald-700 disabled:opacity-40"
          >
            <div className="text-base font-semibold">Indbetaling</div>
            <div className="text-sm opacity-90">Valgfrit beløb</div>
          </button>
        </div>

        {/* Præmier */}
        <div className="mt-4">
          <div className="mb-2 text-sm font-semibold text-gray-700">Præmier</div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {PRIZE_BUTTONS.map((b) => (
              <button
                key={b.key}
                disabled={!selected || inserting}
                onClick={() => givePrize(b.key, b.amountKr)}
                className="rounded-2xl bg-indigo-600 px-4 py-6 text-white shadow hover:bg-indigo-700 disabled:opacity-40"
              >
                <div className="text-sm font-semibold">{b.label}</div>
                <div className="text-xs opacity-90">{fmt(toOre(b.amountKr))}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Saldo & Undo */}
        <div className="mt-4 flex items-center justify-between">
          <div className="text-lg">{selected ? <>
            <span className="text-gray-600">Saldo for </span>
            <span className="font-semibold">{selected}</span>
            <span className={`ml-2 font-semibold ${saldoOre < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{fmt(saldoOre)}</span>
          </> : <span className="text-gray-500">Vælg en spiller…</span>}</div>
          <div>
            <button onClick={undoLast} disabled={!selected || inserting || entries.length === 0} className="rounded-xl border px-4 py-2 hover:bg-gray-50 disabled:opacity-40">
              Fortryd sidste
            </button>
          </div>
        </div>

        {/* Seneste poster */}
        <div className="mt-4 rounded-2xl border bg-white shadow-sm">
          <div className="border-b p-3 text-sm font-semibold">Seneste poster i dag</div>
          {entriesLoading ? (
            <div className="p-3 text-sm text-gray-500">Henter…</div>
          ) : entries.length === 0 ? (
            <div className="p-3 text-sm text-gray-500">Ingen poster endnu.</div>
          ) : (
            <ul className="divide-y">
              {entries.map((e) => (
                <li key={e.id} className="grid grid-cols-12 items-center gap-2 p-3 text-sm">
                  <div className="col-span-5 truncate">
                    {labelForProduct(e.product)}{e.note ? ` – ${e.note}` : ""}
                  </div>
                  <div className="col-span-3 text-gray-500">{new Date(e.created_at).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" })}</div>
                  <div className={`col-span-4 text-right font-medium ${e.amount_ore < 0 ? "text-rose-600" : "text-emerald-700"}`}>{fmt(e.amount_ore)}</div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && <div className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
      </div>

      {/* Bøde modal */}
      <Modal open={bodeOpen} title="Tilføj bøde" onClose={() => setBodeOpen(false)}>
        <div className="space-y-3">
          <div>
            <label className="block text-sm text-gray-600">Beløb (kr)</label>
            <input
              type="number"
              min={0}
              step="1"
              inputMode="decimal"
              className="mt-1 w-full rounded-xl border px-3 py-2"
              placeholder="fx 20"
              value={bodeBelob}
              onChange={(e) => setBodeBelob(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600">Kommentar (valgfri)</label>
            <input
              type="text"
              className="mt-1 w-full rounded-xl border px-3 py-2"
              placeholder="fx Glemte at feje bane"
              value={bodeNote}
              onChange={(e) => setBodeNote(e.target.value)}
            />
          </div>
          <div className="text-right">
            <button onClick={submitBode} className="rounded-xl bg-amber-600 px-4 py-2 text-white shadow hover:bg-amber-700">Tilføj bøde</button>
          </div>
        </div>
      </Modal>

      {/* Indbetaling modal */}
      <Modal open={indbOpen} title="Registrér indbetaling" onClose={() => setIndbOpen(false)}>
        <div className="space-y-3">
          <div>
            <label className="block text-sm text-gray-600">Beløb (kr)</label>
            <input
              type="number"
              min={0}
              step="1"
              inputMode="decimal"
              className="mt-1 w-full rounded-xl border px-3 py-2"
              placeholder="fx 100"
              value={indbBelob}
              onChange={(e) => setIndbBelob(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm text-gray-600">Note (valgfri)</label>
            <input
              type="text"
              className="mt-1 w-full rounded-xl border px-3 py-2"
              placeholder="fx MobilePay"
              value={indbNote}
              onChange={(e) => setIndbNote(e.target.value)}
            />
          </div>
          <div className="text-right">
            <button onClick={submitIndb} className="rounded-xl bg-emerald-700 px-4 py-2 text-white shadow hover:bg-emerald-800">Registrér indbetaling</button>
          </div>
        </div>
      </Modal>

      {/* Første-drink modal */}
      <Modal open={askSessionOpen && freeFirstDrink === null} title="Første drikkevare gratis i aften?" onClose={() => setAskSessionOpen(false)}>
        <div className="space-y-3 text-sm">
          <p>Skal den første drikkevare pr. person være gratis i aften?</p>
          <div className="flex gap-2">
            <button onClick={() => chooseFirstDrinkPolicy(true)} className="rounded-xl bg-emerald-600 px-4 py-2 text-white shadow hover:bg-emerald-700">Ja, gratis</button>
            <button onClick={() => chooseFirstDrinkPolicy(false)} className="rounded-xl bg-gray-200 px-4 py-2 text-gray-800 shadow hover:bg-gray-300">Nej, alle betaler</button>
          </div>
          <p className="text-[11px] text-gray-500">Du kan altid skifte senere via knappen i toppen.</p>
        </div>
      </Modal>
    </div>
  );
}

function labelForProduct(key: string) {
  switch (key) {
    case "stor_fadoel": return "Stor Fadøl";
    case "lille_fadoel": return "Lille Fadøl";
    case "stor_oel": return "Stor Øl";
    case "lille_oel": return "Lille Øl";
    case "sodavand": return "Sodavand";
    case "chips": return "Chips";
    case "boede": return "Bøde";
    case "indbetaling": return "Indbetaling";
    case "rabat": return "Rabat";
    case "praemie_aften_1": return "Præmie: Aftenens Spiller";
    case "praemie_aften_2": return "Præmie: Aftenens nr. 2";
    case "praemie_aften_3": return "Præmie: Aftenens nr. 3";
    case "praemie_maaned_1": return "Præmie: Månedens Spiller";
    case "praemie_maaned_2": return "Præmie: Månedens nr. 2";
    case "praemie_maaned_3": return "Præmie: Månedens nr. 3";
    case "praemie_maaned_mest_aktive": return "Præmie: Månedens mest aktive";
    default: return key;
  }
}

