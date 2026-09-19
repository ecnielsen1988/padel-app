export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getCachedRankingOverview } from "@/lib/rankingOverview";
import {
  NO_STORE_HEADERS,
  PUBLIC_DATA_CACHE_HEADERS,
} from "@/lib/publicCache";

export async function GET() {
  try {
    const data = await getCachedRankingOverview();
    return NextResponse.json(data, { headers: PUBLIC_DATA_CACHE_HEADERS });
  } catch (error) {
    console.error("GET /api/ranking-overview error", error);
    return NextResponse.json(
      { error: "Kunne ikke hente ranglisteoversigten" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
