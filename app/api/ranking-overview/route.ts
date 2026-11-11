export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getCachedRankingOverview } from "@/lib/rankingOverview";
import {
  NO_STORE_HEADERS,
  PUBLIC_DATA_CACHE_HEADERS,
} from "@/lib/publicCache";

export async function GET(request: Request) {
  try {
    const { activeRanking, ...overview } = await getCachedRankingOverview();
    const data = new URL(request.url).searchParams.get("visning") === "tv"
      ? { rangliste: activeRanking, monthly: overview.monthly, women: overview.women, eggs: overview.eggs }
      : overview;
    return NextResponse.json(data, {
      headers: { ...PUBLIC_DATA_CACHE_HEADERS, "Netlify-Vary": "query=visning" },
    });
  } catch (error) {
    console.error("GET /api/ranking-overview error", error);
    return NextResponse.json(
      { error: "Kunne ikke hente ranglisteoversigten" },
      { status: 500, headers: { ...NO_STORE_HEADERS, "Netlify-Vary": "query=visning" } }
    );
  }
}
