// app/api/rangliste/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getCachedRangliste } from "@/lib/cachedRangliste";
import {
  NO_STORE_HEADERS,
  PUBLIC_DATA_CACHE_HEADERS,
} from "@/lib/publicCache";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const format = url.searchParams.get("format"); // "obj" for { data: [...] }

    const raw = await getCachedRangliste();

    // Normalisér til liste
    const list = Array.isArray(raw)
      ? raw
      : Array.isArray((raw as any)?.data)
      ? (raw as any).data
      : [];

    // Default: råt array (backwards compatible)
    if (format !== "obj") {
      return NextResponse.json(list, {
        headers: PUBLIC_DATA_CACHE_HEADERS,
      });
    }

    // Alternativ: indpakket objekt
    return NextResponse.json(
      { data: list },
      { headers: PUBLIC_DATA_CACHE_HEADERS }
    );
  } catch (error) {
    return NextResponse.json(
      [], // bevar også fallback som råt array ved fejl
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
