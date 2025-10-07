// app/api/rangliste/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { NextResponse } from "next/server";
import { beregnNyRangliste } from "@/lib/beregnNyRangliste";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const format = url.searchParams.get("format"); // "obj" for { data: [...] }

    const raw = await beregnNyRangliste();

    // Normalisér til liste
    const list = Array.isArray(raw)
      ? raw
      : Array.isArray((raw as any)?.data)
      ? (raw as any).data
      : [];

    // Default: råt array (backwards compatible)
    if (format !== "obj") {
      return NextResponse.json(list, {
        headers: { "Cache-Control": "no-store" },
      });
    }

    // Alternativ: indpakket objekt
    return NextResponse.json(
      { data: list },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return NextResponse.json(
      [], // bevar også fallback som råt array ved fejl
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
