"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// ---------------------------------------
// Utils (CPH-dato i YYYY-MM-DD)
// ---------------------------------------
const todayCphISO = () => {
  const fmt = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Copenhagen",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(new Date()); // "YYYY-MM-DD"
};

const toOre = (kr: number) => Math.round(kr * 100);
const fmt = (ore: number) =>
  new Intl.NumberFormat("da-DK", { style: "currency", currency: "DKK" }).format(ore / 100);

const addDaysISO = (yyyyMMdd: string, delta: number) => {
  const [y, m, d] = yyyyMMdd.split("-").map((n) => parseInt(n, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  const y2 = dt.getUTCFullYear();
  const m2 = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d2 = String(dt.getUTCDate()).padStart(2, "0");
  return `${y2}-${m2}-${d2}`;
};

// ---------------------------------------
// Produkter (NØGLERNE skal matche CHECK-constraint i DB)
// ---------------------------------------
const PRODUCTS = {
  // Drikke
  stor_fadoel: { label: "🍺 Stor Fadøl", priceKr: 40, sign: -1 },
  lille_fadoel: { label: "🍺 Lille Fadøl", priceKr: 30, sign: -1 },
  stor_oel: { label: "🍻 Stor Øl", priceKr: 35, sign: -1 },
  lille_oel: { label: "🍻 Lille Øl", priceKr: 25, sign: -1 },
  sodavand: { label: "🥤 Sodavand", priceKr: 25, sign: -1 },

  // Mad/snacks
  chips: { label: "🍟 Chips", priceKr: 15, sign: -1 },
  toast: { label: "🥪 Toast", priceKr: 15, sign: -1 },

  // Event/aktivitet
  lunarkamp: { label: "🏸 Lunarkamp", priceKr: 50, sign: -1 },
  torsdagsspil: { label: "🎾 Torsdagsspil", priceKr: 140, sign: -1 },

  // Merchandise
  tshirt: { label: "👕 T-shirt", priceKr: 300, sign: -1 },
  shorts: { label: "🩳 Shorts", priceKr: 200, sign: -1 },
} as const;

type ProductKey = keyof typeof PRODUCTS;

// Køb der tæller i "Salg (brutto)" (ekskl. bøder, indbetaling, rabat, præmier)
const PURCHASE_KEYS: readonly ProductKey[] = [
  "stor_fadoel",
  "lille_fadoel",
  "stor_oel",
  "lille_oel",
  "sodavand",
  "chips",
  "toast",
  "lunarkamp",
  "torsdagsspil",
  "tshirt",
  "shorts",
] as const;

// Drikkevarer – anvendes til evt. "første drik gratis"
const BEVERAGE_KEYS: readonly ProductKey[] = [
  "stor_fadoel",
  "lille_fadoel",
  "stor_oel",
  "lille_oel",
  "sodavand",
] as const;

// UI-grupper (Præmier som egen fane inde i butik)
const PRODUCT_GROUPS = {
  "🍽️ Mad & Drikke": ["stor_fadoel", "lille_fadoel", "stor_oel", "lille_oel", "sodavand", "chips", "toast"],
  "🎟️ Events": ["lunarkamp", "torsdagsspil"],
  "🛍️ Merch": ["tshirt", "shorts"],
  "🎁 Præmier": [] as ProductKey[], // håndteres særskilt i UI
} as const;

type GroupKey = keyof typeof PRODUCT_GROUPS;

// ---------------------------------------
// Types
// ---------------------------------------
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
  created_at?: string;
  created_by?: string | null;
};

type PrizeKey =
  | "praemie_aften_1"
  | "praemie_aften_2"
  | "praemie_aften_3"
  | "praemie_maaned_1"
  | "praemie_maaned_2"
  | "praemie_maaned_3"
  | "praemie_maaned_mest_aktive";

const PRIZE_BUTTONS: { key: PrizeKey; label: string; amountKr: number }[] = [
  { key: "praemie_aften_1", label: "🏆 Aftenens Spiller", amountKr: 100 },
  { key: "praemie_aften_2", label: "🥈 Aftenens nr. 2", amountKr: 50 },
  { key: "praemie_aften_3", label: "🥉 Aftenens nr. 3", amountKr: 25 },
  { key: "praemie_maaned_1", label: "🏆 Månedens Spiller", amountKr: 250 },
  { key: "praemie_maaned_2", label: "🥈 Månedens nr. 2", amountKr: 100 },
  { key: "praemie_maaned_3", label: "🥉 Månedens nr. 3", amountKr: 50 },
  { key: "praemie_maaned_mest_aktive", label: "🏸 Mest aktive (måned)", amountKr: 200 },
];

// ---------------------------------------
// Simpel Modal
// ---------------------------------------
function Modal({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 text-lg font-semibold">{title}</div>
        {children}
        <div className="mt-4 text-right">
          <button className="rounded-xl border px-4 py-2" onClick={onClose}>
            Luk
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------
// Layout (Butik med 4 faner + stor spillerliste)
// ---------------------------------------
export default function AdminButikPage() {
  // Dato (redigerbar)
  const [eventDate, setEventDate] = useState<string>(todayCphISO());

  const [players, setPlayers] = useState<Player[]>([]);
  const [playerFilter, setPlayerFilter] = useState("");
  const [loadingPlayers, setLoadingPlayers] = useState(true);
  const [selected, setSelected] = useState<string>("");

  const [entries, setEntries] = useState<Entry[]>([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [inserting, setInserting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [bodeOpen, setBodeOpen] = useState(false);
  const [bodeBelob, setBodeBelob] = useState("");
  const [bodeNote, setBodeNote] = useState("");

  const [indbOpen, setIndbOpen] = useState(false);
  const [indbBelob, setIndbBelob] = useState("");
  const [indbNote, setIndbNote] = useState("MobilePay");

  const [totals, setTotals] = useState<{
    sales_ore: number;
    payments_ore: number;
    discounts_ore: number;
    prizes_ore: number;
    net_ore: number;
  }>({ sales_ore: 0, payments_ore: 0, discounts_ore: 0, prizes_ore: 0, net_ore: 0 });

  const [freeFirstDrink, setFreeFirstDrink] = useState<boolean | null>(null);
  const [askSessionOpen, setAskSessionOpen] = useState(false);

  const [activeGroup, setActiveGroup] = useState<GroupKey>("🍽️ Mad & Drikke");

  // Load spillere for valgt dato
  useEffect(() => {
    (async () => {
      setLoadingPlayers(true);
      setError(null);
      const d = eventDate;

      let { data: signups } = await supabase
        .from("event_signups")
        .select("visningsnavn")
        .eq("event_date", d)
        .order("visningsnavn", { ascending: true });

      let list: Player[] = [];
      if (signups && signups.length > 0) {
        list = signups as Player[];
      } else {
        const { data: profs } = await supabase
          .from("profiles")
          .select("visningsnavn")
          .eq("torsdagspadel", true)
          .not("visningsnavn", "is", null)
          .order("visningsnavn", { ascending: true });
        if (profs) list = profs as Player[];
      }

      setPlayers(list);
      // Hvis ny dato og ingen valgt endnu, vælg første i listen
      if (list.length && !selected) setSelected(list[0].visningsnavn);
      setLoadingPlayers(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventDate]);

  // Load poster for valgt spiller & dato
  async function refreshPlayerEntries(name: string) {
    setEntriesLoading(true);
    const { data } = await supabase
      .from("bar_entries")
      .select("id, event_date, visningsnavn, product, qty, amount_ore, note, created_at")
      .eq("visningsnavn", name)
      .eq("event_date", eventDate)
      .order("created_at", { ascending: false });
    if (data) setEntries(data as Entry[]);
    setEntriesLoading(false);
  }

  useEffect(() => {
    if (selected) refreshPlayerEntries(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, eventDate]);

  // Aftentotaler for dato
  async function refreshTotals() {
    const { data } = await supabase.from("bar_entries").select("product, amount_ore").eq("event_date", eventDate);
    if (!data) return;
    let sales = 0,
      payments = 0,
      discounts = 0,
      prizes = 0,
      net = 0;
    for (const r of data as Pick<Entry, "product" | "amount_ore">[]) {
      net += r.amount_ore;
      if ((PURCHASE_KEYS as readonly string[]).includes(r.product as ProductKey) && r.amount_ore < 0) sales += -r.amount_ore;
      if (r.product === "indbetaling" && r.amount_ore > 0) payments += r.amount_ore;
      if (r.product === "rabat" && r.amount_ore > 0) discounts += r.amount_ore;
      if (
        ([
          "praemie_aften_1",
          "praemie_aften_2",
          "praemie_aften_3",
          "praemie_maaned_1",
          "praemie_maaned_2",
          "praemie_maaned_3",
          "praemie_maaned_mest_aktive",
        ] as const).includes(r.product as any) &&
        r.amount_ore > 0
      )
        prizes += r.amount_ore;
    }
    setTotals({ sales_ore: sales, payments_ore: payments, discounts_ore: discounts, prizes_ore: prizes, net_ore: net });
  }

  useEffect(() => {
    refreshTotals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventDate, selected, entries.length]);

  const saldoOre = useMemo(() => entries.reduce((acc, e) => acc + e.amount_ore, 0), [entries]);

  // Helpers
  type BarEntryInsert = {
    event_date: string;
    visningsnavn: string;
    product: string;
    qty: number;
    amount_ore: number;
    note: string | null;
  };

  async function insertRows(
    rows: Array<{ visningsnavn: string; product: string; amount_ore: number; qty?: number; note?: string | null }>
  ) {
    setInserting(true);
    setError(null);
    const payload: BarEntryInsert[] = rows.map((r) => ({
      event_date: eventDate,
      visningsnavn: r.visningsnavn,
      product: r.product,
      qty: r.qty ?? 1,
      amount_ore: r.amount_ore,
      note: r.note ?? null,
    }));
    const qb = supabase.from("bar_entries") as any;
    const { error } = await qb.insert(payload);
    setInserting(false);
    if (error) {
      setError(error.message);
      return;
    }
    if (selected) await refreshPlayerEntries(selected);
    await refreshTotals();
  }

  async function isFirstBeverageToday(visningsnavn: string) {
    const { count } = await supabase
      .from("bar_entries")
      .select("id", { count: "exact", head: true })
      .eq("visningsnavn", visningsnavn)
      .eq("event_date", eventDate)
      .in("product", BEVERAGE_KEYS as unknown as string[]);
    return (count ?? 0) === 0;
  }

  async function handleFixed(key: ProductKey) {
    if (!selected) return;
    const p = PRODUCTS[key];
    const amount = p.sign * toOre(p.priceKr);

    const rows: Array<{ visningsnavn: string; product: string; amount_ore: number; note?: string }> = [
      { visningsnavn: selected, product: key as string, amount_ore: amount },
    ];

    if ((BEVERAGE_KEYS as readonly string[]).includes(key)) {
      if (freeFirstDrink === null) {
        setAskSessionOpen(true);
        return; // Vælg politik og klik igen
      }
      if (freeFirstDrink && (await isFirstBeverageToday(selected))) {
        rows.push({
          visningsnavn: selected,
          product: "rabat",
          amount_ore: Math.abs(amount),
          note: "Første drikkevare 100% rabat",
        });
      }
    }

    await insertRows(rows);
  }

  function openBode() {
    setBodeBelob("");
    setBodeNote("");
    setBodeOpen(true);
  }
  async function submitBode() {
    const val = parseFloat(bodeBelob.replace(",", "."));
    if (!selected || isNaN(val) || val <= 0) return;
    await insertRows([{ visningsnavn: selected, product: "boede", amount_ore: -toOre(val), note: bodeNote }]);
    setBodeOpen(false);
  }

  function openIndb() {
    setIndbBelob("");
    setIndbNote("MobilePay");
    setIndbOpen(true);
  }
  async function submitIndb() {
    const val = parseFloat(indbBelob.replace(",", "."));
    if (!selected || isNaN(val) || val <= 0) return;
    await insertRows([{ visningsnavn: selected, product: "indbetaling", amount_ore: toOre(val), note: indbNote }]);
    setIndbOpen(false);
  }

  async function givePrize(key: PrizeKey, amountKr: number) {
    if (!selected) return;
    await insertRows([{ visningsnavn: selected, product: key, amount_ore: toOre(amountKr), note: "Præmie" }]);
  }

  async function undoLast() {
    if (!selected) return;
    const { data: last } = await supabase
      .from("bar_entries")
      .select("id")
      .eq("visningsnavn", selected)
      .eq("event_date", eventDate)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!last) return;
    await supabase.from("bar_entries").delete().eq("id", (last as any).id);
    if (selected) await refreshPlayerEntries(selected);
    await refreshTotals();
  }

  // Hent/opret session (freeFirstDrink flag) pr. dato
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("bar_sessions")
        .select("event_date, free_first_drink")
        .eq("event_date", eventDate)
        .maybeSingle();
      if (data) setFreeFirstDrink((data as BarSession).free_first_drink);
      else {
        setFreeFirstDrink(null);
        setAskSessionOpen(true);
      }
    })();
  }, [eventDate]);

  async function chooseFirstDrinkPolicy(flag: boolean) {
    setFreeFirstDrink(flag);
    setAskSessionOpen(false);
    const qb = supabase.from("bar_sessions") as any;
    await qb.upsert({ event_date: eventDate, free_first_drink: flag });
  }

  // Afledte
  const filteredPlayers = useMemo(() => {
    const q = playerFilter.trim().toLowerCase();
    if (!q) return players;
    return players.filter((p) => p.visningsnavn.toLowerCase().includes(q));
  }, [players, playerFilter]);

  return (
    <div className="mx-auto max-w-7xl p-4">
      {/* Topbar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-pink-500 via-rose-500 to-fuchsia-600 p-4 text-white shadow-md">
        <div className="text-xl font-semibold">Baradministration</div>
        <div className="flex items-center gap-3 text-sm">
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className="rounded-md border border-white/30 bg-white/10 px-3 py-1 text-white placeholder-white/70 focus:outline-none"
            />
            <button
              onClick={() => setEventDate(addDaysISO(eventDate, -1))}
              className="rounded-full bg-white/20 px-2 py-1"
            >
              ‹ I går
            </button>
            <button
              onClick={() => setEventDate(addDaysISO(eventDate, +1))}
              className="rounded-full bg-white/20 px-2 py-1"
            >
              I morgen ›
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-white/90">Første drik gratis:</span>
            <button
              onClick={() => chooseFirstDrinkPolicy(!(freeFirstDrink ?? false))}
              className={`rounded-full px-3 py-1 font-medium ${
                freeFirstDrink ? "bg-emerald-500 text-white" : "bg-white/20 text-white"
              }`}
            >
              {freeFirstDrink ? "Ja" : "Nej"}
            </button>
          </div>
        </div>
      </div>

      {/* 3-kolonne grid (gør spillerlisten større ved at give den 5/12) */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
        {/* Venstre: Aftentotaler + Saldo */}
        <aside className="md:col-span-3 space-y-4">
          {/* Totals */}
          <div className="rounded-2xl border bg-white p-3 shadow-sm">
            <div className="mb-2 text-sm font-semibold text-gray-700">Aftentotal</div>
            <div className="grid grid-cols-2 gap-2 text-center text-sm">
              <Kpi label="🧾 Salg (brutto)" value={fmt(totals.sales_ore)} sub="Ekskl. bøder/indb./præmier" />
              <Kpi label="💸 Indbetalinger" value={fmt(totals.payments_ore)} />
              <Kpi label="🏷️ Rabatter" value={fmt(totals.discounts_ore)} />
              <Kpi label="🎁 Præmier" value={fmt(totals.prizes_ore)} />
              <Kpi
                label="⚖️ Netto"
                value={fmt(totals.net_ore)}
                emphasis={totals.net_ore < 0 ? "neg" : "pos"}
                className="col-span-2"
              />
            </div>
          </div>

          {/* Saldo for valgt spiller */}
          <div className="flex items-center justify-between rounded-2xl border bg-white p-3 shadow-sm">
            <div className="text-base">
              {selected ? (
                <>
                  <span className="text-gray-600">Saldo for </span>
                  <span className="font-semibold">{selected}</span>
                  <span className={`ml-2 font-semibold ${saldoOre < 0 ? "text-rose-600" : "text-emerald-700"}`}>
                    {fmt(saldoOre)}
                  </span>
                </>
              ) : (
                <span className="text-gray-500">Vælg en spiller…</span>
              )}
            </div>
            <button
              onClick={undoLast}
              disabled={!selected || inserting || entries.length === 0}
              className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-40"
            >
              Fortryd sidste
            </button>
          </div>

          <RecentEntries entries={entries} entriesLoading={entriesLoading} />
        </aside>

        {/* Midte: Produkter i faner */}
        <main className="md:col-span-5">
          <div className="mb-3 flex flex-wrap gap-2">
            {(Object.keys(PRODUCT_GROUPS) as GroupKey[]).map((g) => (
              <button
                key={g}
                onClick={() => setActiveGroup(g)}
                className={`rounded-full px-4 py-2 text-sm font-medium shadow ${
                  activeGroup === g ? "bg-pink-600 text-white" : "bg-white text-gray-800 border"
                }`}
              >
                {g}
              </button>
            ))}
          </div>

          {/* Produktgrid / Præmiegrid */}
          {activeGroup === "🎁 Præmier" ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {PRIZE_BUTTONS.map((b) => (
                <button
                  key={b.key}
                  disabled={!selected || inserting}
                  onClick={() => givePrize(b.key, b.amountKr)}
                  className="rounded-2xl bg-indigo-600 p-4 text-left text-white shadow hover:bg-indigo-700 disabled:opacity-40"
                >
                  <div className="text-sm font-semibold">{b.label}</div>
                  <div className="text-xs opacity-90">{fmt(toOre(b.amountKr))}</div>
                </button>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {PRODUCT_GROUPS[activeGroup].map((key) => {
                const p = PRODUCTS[key];
                return (
                  <button
                    key={key}
                    disabled={!selected || inserting}
                    onClick={() => handleFixed(key)}
                    className="rounded-2xl bg-white p-4 text-left shadow hover:shadow-md disabled:opacity-40 border"
                  >
                    <div className="text-base font-semibold">{p.label}</div>
                    <div className="text-sm text-gray-600">{fmt(toOre(p.priceKr))}</div>
                  </button>
                );
              })}

              {/* Ekstra handlinger som kort (kun på varefaner) */}
              <button
                disabled={!selected || inserting}
                onClick={() => setBodeOpen(true)}
                className="rounded-2xl border bg-amber-50 p-4 text-left shadow hover:shadow-md disabled:opacity-40"
              >
                <div className="text-base font-semibold">🚫 Bøde</div>
                <div className="text-sm text-amber-700">Valgfrit beløb</div>
              </button>

              <button
                disabled={!selected || inserting}
                onClick={() => setIndbOpen(true)}
                className="rounded-2xl border bg-emerald-50 p-4 text-left shadow hover:shadow-md disabled:opacity-40"
              >
                <div className="text-base font-semibold">💳 Indbetaling</div>
                <div className="text-sm text-emerald-700">Valgfrit beløb</div>
              </button>
            </div>
          )}
        </main>

        {/* Højre: Stor spillerpanel */}
        <section className="md:col-span-4 space-y-4">
          <PlayerPanel
            loading={loadingPlayers}
            players={filteredPlayers}
            filter={playerFilter}
            setFilter={setPlayerFilter}
            selected={selected}
            setSelected={setSelected}
          />

          {error && <div className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}
        </section>
      </div>

      {/* Modals */}
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
            <button
              onClick={submitBode}
              className="rounded-xl bg-amber-600 px-4 py-2 text-white shadow hover:bg-amber-700"
            >
              Tilføj bøde
            </button>
          </div>
        </div>
      </Modal>

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
            <button
              onClick={submitIndb}
              className="rounded-xl bg-emerald-700 px-4 py-2 text-white shadow hover:bg-emerald-800"
            >
              Registrér indbetaling
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={askSessionOpen && freeFirstDrink === null}
        title="Første drikkevare gratis i aften?"
        onClose={() => setAskSessionOpen(false)}
      >
        <div className="space-y-3 text-sm">
          <p>Skal den første drikkevare pr. person være gratis?</p>
          <div className="flex gap-2">
            <button
              onClick={() => chooseFirstDrinkPolicy(true)}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-white shadow hover:bg-emerald-700"
            >
              Ja, gratis
            </button>
            <button
              onClick={() => chooseFirstDrinkPolicy(false)}
              className="rounded-xl bg-gray-200 px-4 py-2 text-gray-800 shadow hover:bg-gray-300"
            >
              Nej, alle betaler
            </button>
          </div>
          <p className="text-[11px] text-gray-500">Du kan altid skifte senere via knappen i toppen.</p>
        </div>
      </Modal>
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  emphasis,
  className = "",
}: {
  label: string;
  value: string;
  sub?: string;
  emphasis?: "pos" | "neg";
  className?: string;
}) {
  return (
    <div className={`rounded-xl border bg-white p-3 shadow-sm ${className}`}>
      <div className="text-[11px] uppercase text-gray-500">{label}</div>
      <div
        className={`text-lg font-semibold ${
          emphasis === "pos" ? "text-emerald-700" : emphasis === "neg" ? "text-rose-600" : ""
        }`}
      >
        {value}
      </div>
      {sub && <div className="text-[11px] text-gray-400">{sub}</div>}
    </div>
  );
}

function PlayerPanel({
  loading,
  players,
  filter,
  setFilter,
  selected,
  setSelected,
}: {
  loading: boolean;
  players: Player[];
  filter: string;
  setFilter: (v: string) => void;
  selected: string;
  setSelected: (v: string) => void;
}) {
  return (
    <div className="rounded-2xl border bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-semibold text-gray-700">👥 Dagens spillere</div>
        {loading && <div className="text-xs text-gray-500">Henter…</div>}
      </div>
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Søg spiller…"
        className="mb-2 w-full rounded-xl border px-3 py-2 text-sm"
      />
      {!loading && players.length === 0 ? (
        <div className="text-sm text-gray-500">Ingen spillere fundet.</div>
      ) : (
        <ul className="max-h-[62vh] space-y-1 overflow-auto pr-1">
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
  );
}

function RecentEntries({ entries, entriesLoading }: { entries: Entry[]; entriesLoading: boolean }) {
  return (
    <div className="rounded-2xl border bg-white shadow-sm">
      <div className="flex items-center justify-between border-b p-3">
        <div className="text-sm font-semibold">🧾 Seneste poster</div>
        <div className="text-xs text-gray-500">{entries.length}</div>
      </div>
      {entriesLoading ? (
        <div className="p-3 text-sm text-gray-500">Henter…</div>
      ) : entries.length === 0 ? (
        <div className="p-3 text-sm text-gray-500">Ingen poster endnu.</div>
      ) : (
        <ul className="divide-y">
          {entries.map((e) => (
            <li key={e.id} className="grid grid-cols-12 items-center gap-2 p-3 text-sm">
              <div className="col-span-6 truncate">
                {labelForProduct(e.product)}
                {e.note ? ` – ${e.note}` : ""}
              </div>
              <div className="col-span-3 text-gray-500">
                {new Date(e.created_at).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" })}
              </div>
              <div className={`col-span-3 text-right font-medium ${e.amount_ore < 0 ? "text-rose-600" : "text-emerald-700"}`}>
                {fmt(e.amount_ore)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function labelForProduct(key: string) {
  switch (key) {
    // Drikke
    case "stor_fadoel":
      return "🍺 Stor Fadøl";
    case "lille_fadoel":
      return "🍺 Lille Fadøl";
    case "stor_oel":
      return "🍻 Stor Øl";
    case "lille_oel":
      return "🍻 Lille Øl";
    case "sodavand":
      return "🥤 Sodavand";

    // Mad/snacks
    case "chips":
      return "🍟 Chips";
    case "toast":
      return "🥪 Toast";

    // Event/aktivitet
    case "lunarkamp":
      return "🏸 Lunarkamp";
    case "torsdagsspil":
      return "🎾 Torsdagsspil";

    // Merchandise
    case "tshirt":
      return "👕 T-shirt";
    case "shorts":
      return "🩳 Shorts";

    // Øvrige
    case "boede":
      return "🚫 Bøde";
    case "indbetaling":
      return "💳 Indbetaling";
    case "rabat":
      return "🏷️ Rabat";
    case "praemie_aften_1":
      return "🎁 Præmie: Aftenens Spiller";
    case "praemie_aften_2":
      return "🎁 Præmie: Aftenens nr. 2";
    case "praemie_aften_3":
      return "🎁 Præmie: Aftenens nr. 3";
    case "praemie_maaned_1":
      return "🎁 Præmie: Månedens Spiller";
    case "praemie_maaned_2":
      return "🎁 Præmie: Månedens nr. 2";
    case "praemie_maaned_3":
      return "🎁 Præmie: Månedens nr. 3";
    case "praemie_maaned_mest_aktive":
      return "🎁 Præmie: Månedens mest aktive";
    default:
      return key;
  }
}

