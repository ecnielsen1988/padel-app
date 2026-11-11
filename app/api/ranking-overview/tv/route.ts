export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getCachedRankingOverview } from "@/lib/rankingOverview";
import { NO_STORE_HEADERS, PUBLIC_DATA_CACHE_HEADERS } from "@/lib/publicCache";

export async function GET() {
  try {
    const { activeRanking, monthly, women, eggs } = await getCachedRankingOverview();
    return NextResponse.json(
      { rangliste: activeRanking, monthly, women, eggs },
      { headers: PUBLIC_DATA_CACHE_HEADERS },
    );
  } catch (error) {
    console.error("GET /api/ranking-overview/tv error", error);
    return NextResponse.json(
      { error: "Kunne ikke hente TV-ranglisterne" },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
