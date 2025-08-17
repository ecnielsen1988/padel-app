"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// ---------- utils ----------
const fmt = (ore: number) => new Intl.NumberFormat("da-DK", { style: "currency", currency: "DKK" }).format((ore ?? 0) / 100);
const today = new Date();
const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const firstOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const nextMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 1);
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

// ---------- types ----------
type Entry = {
  id: number;
  event_date: string; // YYYY-MM-DD
  visningsnavn: string;
  product: "stor_fadoel" | "lille_fadoel" | "stor_oel" | "lille_oel" | "sodavand" | "boede" | "indbetaling" | "rabat" | string;
  qty: number;
  amount_ore: number; // køb/bøde negative, indbetaling/rabat positive
  note: string | null;
  created_at: string;
};

export default function RegnskabPage() {
  const [userName, setUserName] = useState<string>("");
  const [loadingUser, setLoadingUser] = useState(true);

  // månedssigt
  const [month, setMonth] = useState<Date>(firstOfMonth(today));

  // data
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // totals
  const totals = useMemo(() => {
    let sales = 0; // alt der er negative beløb (køb + bøder)
    let payments = 0; // indbetalinger (positive)
    let discounts = 0; // rabat (positive)
    let net = 0;
    for (const e of entries) {
      net += e.amount_ore;
      if (e.amount_ore < 0) sales += -e.amount_ore;
      if (e.product === "indbetaling" && e.amount_ore > 0) payments += e.amount_ore;
      if (e.product === "rabat" && e.amount_ore > 0) discounts += e.amount_ore;
    }
    return { sales, payments, discounts, net };
  }, [entries]);

  // fetch user
  useEffect(() => {
    (async () => {
      setLoadingUser(true);
      const { data: { user } } = await supabase.auth.getUser();
      const visningsnavn = (user?.user_metadata as any)?.visningsnavn as string | undefined;
      if (visningsnavn) setUserName(visningsnavn);
      setLoadingUser(false);
    })();
  }, []);

  // fetch entries (kun egne – RLS håndhæver også det)
  async function loadEntries(m: Date, name?: string) {
    if (!name) return;
    setLoading(true);
    setError(null);
    const from = isoDate(firstOfMonth(m));
    const to = isoDate(nextMonth(m));
    const { data, error } = await supabase
      .from("bar_entries")
      .select("id, event_date, visningsnavn, product, qty, amount_ore, note, created_at")
      .eq("visningsnavn", name) // ekstra filter; RLS beskytter uanset
      .gte("event_date", from)
      .lt("event_date", to)
      .order("created_at", { ascending: false });
    if (error) setError(error.message);
    if (data) setEntries(data as Entry[]);
    setLoading(false);
  }

  useEffect(() => { if (userName) loadEntries(month, userName); }, [userName, month]);

  function labelForProduct(key: Entry["product"]) {
    switch (key) {
      case "stor_fadoel": return "Stor Fadøl";
      case "lille_fadoel": return "Lille Fadøl";
      case "stor_oel": return "Stor Øl";
      case "lille_oel": return "Lille Øl";
      case "sodavand": return "Sodavand";
      case "boede": return "Bøde";
      case "indbetaling": return "Indbetaling";
      case "rabat": return "Rabat (første drik)";
      default: return key;
    }
  }

  const monthLabel = useMemo(() => new Intl.DateTimeFormat("da-DK", { year: "numeric", month: "long" }).format(month), [month]);

  return (
    <div className="mx-auto max-w-3xl p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-xl font-semibold">Mit regnskab</div>
          <div className="text-sm text-gray-500">{loadingUser ? "Henter profil…" : userName}</div>
        </div>
        <button onClick={() => window.print()} className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50">Print</button>
      </div>

      {/* månedsvælger */}
      <div className="mb-4 flex items-center gap-2">
        <button className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50" onClick={() => setMonth(firstOfMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1)))}>{"←"}</button>
        <div className="min-w-[160px] text-center text-sm text-gray-700">{monthLabel}</div>
        <button className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50" onClick={() => setMonth(firstOfMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1)))}>{"→"}</button>
      </div>

      {/* totals */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border bg-white p-3 text-center shadow-sm">
          <div className="text-[11px] uppercase text-gray-500">Køb</div>
          <div className="text-lg font-semibold text-rose-600">{fmt(totals.sales)}</div>
        </div>
        <div className="rounded-2xl border bg-white p-3 text-center shadow-sm">
          <div className="text-[11px] uppercase text-gray-500">Rabat</div>
          <div className="text-lg font-semibold text-emerald-700">{fmt(totals.discounts)}</div>
        </div>
        <div className="rounded-2xl border bg-white p-3 text-center shadow-sm">
          <div className="text-[11px] uppercase text-gray-500">Indbetalinger</div>
          <div className="text-lg font-semibold text-emerald-700">{fmt(totals.payments)}</div>
        </div>
        <div className="rounded-2xl border bg-white p-3 text-center shadow-sm">
          <div className="text-[11px] uppercase text-gray-500">Netto</div>
          <div className={`text-lg font-semibold ${totals.net < 0 ? "text-rose-600" : "text-emerald-700"}`}>{fmt(totals.net)}</div>
        </div>
      </div>

      {/* liste */}
      <div className="rounded-2xl border bg-white shadow-sm">
        <div className="border-b p-3 text-sm font-semibold">Dine transaktioner (måned)</div>
        {loading ? (
          <div className="p-3 text-sm text-gray-500">Henter…</div>
        ) : entries.length === 0 ? (
          <div className="p-3 text-sm text-gray-500">Ingen transaktioner i denne måned.</div>
        ) : (
          <ul className="divide-y">
            {entries.map((e) => (
              <li key={e.id} className="grid grid-cols-12 items-center gap-2 p-3 text-sm">
                <div className="col-span-5 truncate">
                  {labelForProduct(e.product)}{e.note ? ` – ${e.note}` : ""}
                </div>
                <div className="col-span-4 text-gray-500">
                  {new Date(e.created_at).toLocaleString("da-DK", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </div>
                <div className={`col-span-3 text-right font-medium ${e.amount_ore < 0 ? "text-rose-600" : "text-emerald-700"}`}>{fmt(e.amount_ore)}</div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && <div className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</div>}

      <div className="mt-4 text-[11px] text-gray-500">
        Bemærk: Første drikkevare pr. aften registreres som rabat og modregnes automatisk i din saldo.
      </div>
    </div>
  );
}
