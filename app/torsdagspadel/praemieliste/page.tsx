"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LoadingState, LoggedOutState, PageShell } from "@/app/components/ui";

type DrinkRow = {
  visningsnavn: string;
  beerCount: number;
  sodaCount: number;
};

export default function PraemielistePage() {
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [myName, setMyName] = useState("");
  const [rows, setRows] = useState<DrinkRow[]>([]);

  useEffect(() => {
    const run = async () => {
      try {
        setLoading(true);
        const res = await fetch("/api/torsdag/drinks", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) return;
        setAllowed(true);
        setMyName(String(data.myName ?? ""));
        setRows((data.rows ?? []) as DrinkRow[]);
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, []);

  if (loading) return <LoadingState text="Indlæser præmielisten..." />;

  if (!allowed) {
    return <LoggedOutState title="Du har ikke adgang til præmielisten" description="Siden er kun for torsdagsspillere." />;
  }

  return (
    <PageShell className="pb-16">
      <section className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <section className="rounded-[32px] border border-emerald-200 bg-white/90 p-6 shadow-[0_22px_80px_rgba(5,120,87,0.08)]">
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700">Præmielisten</p>
          <div className="mt-2">
            <h1 className="text-3xl font-black tracking-tight text-emerald-950">Præmiedrikke til gode</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600">
              Her ser du de øl og sodavand, der stadig står på spillerne.
            </p>
          </div>
        </section>

        <section className="rounded-[32px] border border-emerald-200 bg-white/90 p-4 shadow-[0_22px_80px_rgba(5,120,87,0.08)]">
          {rows.length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-emerald-300 bg-emerald-50/60 p-8 text-center text-sm text-zinc-600">
              Ingen præmiedrikke til gode lige nu.
            </div>
          ) : (
            <div className="space-y-3">
              {rows.map((row, index) => {
                const isMe = row.visningsnavn === myName;
                return (
                  <div
                    key={row.visningsnavn}
                    className={`flex items-center justify-between gap-4 rounded-[24px] border px-4 py-4 ${isMe ? "border-emerald-400 bg-emerald-50" : "border-emerald-100 bg-white"}`}
                  >
                    <div>
                      <div className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">
                        #{index + 1} {isMe ? "· Dig" : ""}
                      </div>
                      <div className="mt-1 text-lg font-bold text-emerald-950">{row.visningsnavn}</div>
                    </div>
                    <div className="flex gap-2 text-sm font-semibold text-zinc-700">
                      <span className="rounded-full bg-zinc-100 px-3 py-1">🍺 {row.beerCount}</span>
                      <span className="rounded-full bg-zinc-100 px-3 py-1">🥤 {row.sodaCount}</span>
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

