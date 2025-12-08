// app/api/women/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { beregnNyRangliste } from "@/lib/beregnNyRangliste";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

type RangRow = {
  visningsnavn: string | null;
  elo?: number;
  koen?: string | null;
};

export async function GET(req: Request) {
  try {
    // 1) Hent fuld rangliste (samme som /api/rangliste)
    const raw = await beregnNyRangliste();

    const list: RangRow[] = Array.isArray(raw)
      ? raw
      : Array.isArray((raw as any)?.data)
      ? (raw as any).data
      : [];

    // 2) Hent aktive kvinder fra profiles
    const { data: womenProfiles, error: womenErr } = await supabase
      .from("profiles")
      .select("visningsnavn, koen, active")
      .eq("active", true)
      .eq("koen", "kvinde");

    if (womenErr) {
      console.error("[/api/women] Fejl ved hentning af profiles:", womenErr);
      // Returnér bare tom liste ved fejl
      return NextResponse.json([], {
        headers: { "Cache-Control": "no-store" },
      });
    }

    const womenSet = new Set(
      (womenProfiles ?? [])
        .map((p: any) =>
          (p?.visningsnavn ?? "").toString().trim().toLowerCase()
        )
        .filter(Boolean)
    );

    // 3) Filtrér ranglisten ned til kun aktive kvinder
    const filtered = list
      .map((r) => ({
        visningsnavn: (r.visningsnavn ?? "").toString().trim(),
        elo: Number(r.elo ?? 0),
        koen: r.koen ?? null,
      }))
      .filter(
        (r) =>
          !!r.visningsnavn &&
          Number.isFinite(r.elo) &&
          womenSet.has(r.visningsnavn.toLowerCase())
      );

    // 4) Bevar Elo-sortering (beregnNyRangliste burde allerede være sorteret,
    //    men vi sikrer os lige) og tilføj position
    const sorted = filtered.sort((a, b) => b.elo - a.elo);

    const withPosition = sorted.map((r, idx) => ({
      ...r,
      position: idx + 1,
    }));

    return NextResponse.json(withPosition, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[/api/women] Ukendt fejl:", error);
    return NextResponse.json([], {
      status: 500,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
