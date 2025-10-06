// app/api/rangliste/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { NextResponse } from "next/server";
import { beregnNyRangliste } from "@/lib/beregnNyRangliste";

export async function GET() {
  try {
    const raw = await beregnNyRangliste();

    // Normalisér til et array
    const data = Array.isArray(raw)
      ? raw
      : Array.isArray((raw as any)?.data)
      ? (raw as any).data
      : [];

    return NextResponse.json(
      { data },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Fejl i /api/rangliste:", error);
    return NextResponse.json(
      { data: [] },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

