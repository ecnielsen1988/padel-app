"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LoadingState, LoggedOutState, PageShell } from "@/app/components/ui";

type DrinkHistoryRow = {
  id: string;
  title: string;
  amountLabel: string;
  tone: "rose" | "emerald";
  createdAt: string;
  eventDate: string;
};

export default function PraemielistePage() {
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [summary, setSummary] = useState({ beerCount: 0, sodaCount: 0 });
  const [history, setHistory] = useState<DrinkHistoryRow[]>([]);

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/torsdag/drinks", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) return;
        setAllowed(true);
        setSummary({
          beerCount: Number(data.summary?.beerCount ?? 0),
          sodaCount: Number(data.summary?.sodaCount ?? 0),
        });
        setHistory((data.history ?? []) as DrinkHistoryRow[]);
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, []);

  if (loading) return <LoadingState text="Indlæser din historik..." />;

  if (!allowed) {
    return <LoggedOutState title="Du har ikke adgang til din historik" description="Siden er kun for torsdagsspillere." />;
  }

  return (
    <PageShell className="pb-16">
      <section className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <section className="rounded-[32px] border border-emerald-200 bg-white/90 p-6 shadow-[0_22px_80px_rgba(5,120,87,0.08)]">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700">Din historik</p>
          <div className="mt-2">
            <h1 className="text-3xl font-black tracking-tight text-emerald-950">Dine drikkevarer</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
              Her kan du se hvornår du har fået tildelt drikkevarer, og hvornår de er blevet udleveret.
            </p>
          </div>
        </section>

        <section className="rounded-[32px] border border-emerald-200 bg-white/90 p-4 shadow-[0_22px_80px_rgba(5,120,87,0.08)]">
          <div className="mb-4 flex gap-3">
            <span className="rounded-full bg-zinc-100 px-4 py-2 text-sm font-bold text-zinc-800">🍺 {summary.beerCount}</span>
            <span className="rounded-full bg-zinc-100 px-4 py-2 text-sm font-bold text-zinc-800">🥤 {summary.sodaCount}</span>
          </div>

          {history.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-emerald-300 bg-emerald-50/60 p-8 text-center text-sm text-zinc-600">
              Ingen drikkehistorik endnu.
            </div>
          ) : (
            <div className="space-y-3">
              {history.map((row) => (
                <div key={row.id} className="flex items-center justify-between gap-4 rounded-[24px] border border-emerald-100 bg-white px-4 py-4">
                  <div>
                    <div className="text-lg font-bold text-emerald-950">{row.title}</div>
                    <div className="mt-1 text-sm text-zinc-500">{row.eventDate || row.createdAt}</div>
                  </div>
                  <div className={`text-lg font-black ${row.tone === "rose" ? "text-rose-600" : "text-emerald-700"}`}>
                    {row.amountLabel}
                  </div>
                </div>
              ))}
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
