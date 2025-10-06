// app/api/active/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { beregnEloÆndringerForIndeværendeMåned } from "@/lib/beregnEloChange";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

type Row = { holdA1: string | null; holdA2: string | null; holdB1: string | null; holdB2: string | null };
type AktivSpiller = { visningsnavn: string; sæt: number; pluspoint: number };

function monthStartCph(year: number, month1_12: number): string {
  const d = new Date(Date.UTC(year, month1_12 - 1, 1, 0, 0, 0));
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Copenhagen", year: "numeric", month: "2-digit", day: "2-digit",
  });
  return fmt.format(d); // YYYY-MM-DD
}
function nextMonthStartCph(year: number, month1_12: number): string {
  const d = new Date(Date.UTC(year, month1_12 - 1, 1, 0, 0, 0));
  d.setUTCMonth(d.getUTCMonth() + 1);
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Copenhagen", year: "numeric", month: "2-digit", day: "2-digit",
  });
  return fmt.format(d);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const y = url.searchParams.get("year");
  const m = url.searchParams.get("month");

  let mode: "current" | "specific" = "current";
  let year: number; let month: number;

  if (y && m) {
    year = Number(y); month = Number(m);
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      return NextResponse.json({ error: "Invalid year or month" }, { status: 400 });
    }
    mode = "specific";
  } else {
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Copenhagen", year: "numeric", month: "2-digit",
    }).formatToParts(now);
    year = Number(parts.find(p => p.type === "year")!.value);
    month = Number(parts.find(p => p.type === "month")!.value);
  }

  const start = monthStartCph(year, month);
  const endExclusive = nextMonthStartCph(year, month);

  // Elo-netto for samme måned (matcher “månedens spillere”)
  const eloNetto = await beregnEloÆndringerForIndeværendeMåned({ year, month });

  const { data, error } = await (supabase.from("newresults") as any)
    .select("holdA1, holdA2, holdB1, holdB2")
    .gte("date", start)
    .lt("date", endExclusive)
    .eq("finish", true);

  if (error) {
    console.error("Fejl i /api/active:", error);
    return NextResponse.json({ year, month, mode, data: [] }, { headers: { "Cache-Control": "no-store" } });
  }

  const count = new Map<string, number>();
  for (const r of ((data ?? []) as Row[])) {
    for (const n of [r.holdA1, r.holdA2, r.holdB1, r.holdB2]) {
      const key = typeof n === "string" ? n.trim() : "";
      if (key) count.set(key, (count.get(key) ?? 0) + 1);
    }
  }

  const arr: AktivSpiller[] = Array.from(count.entries()).map(([visningsnavn, sæt]) => {
    const plus = eloNetto.find(e => e.visningsnavn === visningsnavn)?.pluspoint ?? 0;
    return { visningsnavn, sæt, pluspoint: plus };
  })
  .sort((a, b) => (b.sæt - a.sæt) || (b.pluspoint - a.pluspoint))
  .slice(0, 20);

  return NextResponse.json(
    { year, month, mode, data: arr },
    { headers: { "Cache-Control": "no-store" } }
  );
}

