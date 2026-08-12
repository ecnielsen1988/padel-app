"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LoadingState, LoggedOutState, PageShell } from "@/app/components/ui";
import { formatOre, getRemainingFineOre, summarizeFineRows, type TorsdagFineRow } from "@/lib/torsdagEconomyV2";

function normalizeStatus(value?: string | null) {
  return String(value ?? "open").trim().toLowerCase();
}

function fineTone(status: string) {
  if (status === "paid") {
    return {
      card: "border-emerald-200 bg-emerald-50/40",
      amount: "text-emerald-600",
      badge: "bg-emerald-100 text-emerald-800",
      label: "Betalt",
    };
  }
  if (status === "pending") {
    return {
      card: "border-amber-200 bg-amber-50/40",
      amount: "text-amber-600",
      badge: "bg-amber-100 text-amber-800",
      label: "Afventer",
    };
  }
  return {
    card: "border-rose-200 bg-white",
    amount: "text-rose-600",
    badge: "bg-rose-100 text-rose-800",
    label: "Ubetalt",
  };
}

export default function BoedekassePage() {
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [myName, setMyName] = useState("");
  const [rows, setRows] = useState<TorsdagFineRow[]>([]);

  async function loadRows() {
    try {
      setLoading(true);
      const res = await fetch("/api/torsdag/fines", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) return;
      setAllowed(true);
      setMyName(String(data.myName ?? ""));
      setRows((data.rows ?? []) as TorsdagFineRow[]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRows();
  }, []);

  const summary = summarizeFineRows(rows);

  if (loading) return <LoadingState text="Indlæser bødekassen..." />;

  if (!allowed) {
    return <LoggedOutState title="Du har ikke adgang til bødekassen" description="Siden er kun for torsdagsspillere." />;
  }

  return (
    <PageShell className="pb-16">
      <section className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <section className="rounded-[32px] border border-emerald-200 bg-white/90 p-6 shadow-[0_22px_80px_rgba(5,120,87,0.08)]">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700">Bødekassen</p>
          <div className="mt-2">
            <h1 className="text-3xl font-black tracking-tight text-emerald-950">Udsendte bøder</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
              Her kan du se status på bøderne i torsdagsgruppen.
            </p>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-[26px] border border-rose-200 bg-white/90 p-4 shadow-[0_22px_80px_rgba(5,120,87,0.08)]">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-rose-600">Ubetalte</p>
            <p className="mt-2 text-3xl font-black tracking-tight text-emerald-950">{formatOre(summary.outstandingFineOre - summary.pendingFineOre)}</p>
            <p className="mt-1 text-sm text-zinc-600">{summary.openFineCount} bøder</p>
          </div>
          <div className="rounded-[26px] border border-amber-200 bg-white/90 p-4 shadow-[0_22px_80px_rgba(5,120,87,0.08)]">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-amber-600">Afventer</p>
            <p className="mt-2 text-3xl font-black tracking-tight text-emerald-950">{formatOre(summary.pendingFineOre)}</p>
            <p className="mt-1 text-sm text-zinc-600">{summary.pendingFineCount} bøder</p>
          </div>
          <div className="rounded-[26px] border border-emerald-200 bg-white/90 p-4 shadow-[0_22px_80px_rgba(5,120,87,0.08)]">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700">Betalte</p>
            <p className="mt-2 text-3xl font-black tracking-tight text-emerald-950">{formatOre(summary.paidFineOre)}</p>
            <p className="mt-1 text-sm text-zinc-600">{summary.paidFineCount} bøder</p>
          </div>
        </section>

        <section className="rounded-[32px] border border-emerald-200 bg-white/90 p-4 shadow-[0_22px_80px_rgba(5,120,87,0.08)]">
          {rows.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-emerald-300 bg-emerald-50/60 p-8 text-center text-sm text-zinc-600">
              Ingen bøder lige nu.
            </div>
          ) : (
            <div className="space-y-3">
              {rows.map((row) => {
                const isMe = row.visningsnavn === myName;
                const status = normalizeStatus(row.status);
                const tone = fineTone(status);
                return (
                  <div
                    key={row.id}
                    className={`rounded-[24px] border px-4 py-4 ${tone.card} ${isMe ? "ring-2 ring-emerald-300" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
                            {isMe ? "Dig" : row.visningsnavn}
                          </div>
                          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.14em] ${tone.badge}`}>
                            {tone.label}
                          </span>
                        </div>
                        <div className="mt-1 text-lg font-bold text-emerald-950">{row.reason}</div>
                        <div className="mt-1 text-sm text-zinc-500">{row.event_date ?? ""}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Beløb</div>
                        <div className={`mt-1 text-2xl font-black ${tone.amount}`}>{formatOre(getRemainingFineOre(row))}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <div className="flex flex-wrap gap-3">
          <Link href="/torsdagspadel" className="rounded-full bg-emerald-600 px-5 py-3 text-sm font-bold text-white">
            ← Tilbage til torsdagspadel
          </Link>
        </div>
      </section>
    </PageShell>
  );
}
