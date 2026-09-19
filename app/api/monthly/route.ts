// app/api/monthly/route.ts
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import {
  NO_STORE_HEADERS,
  PUBLIC_DATA_CACHE_HEADERS,
} from "@/lib/publicCache";
import {
  beregnEloÆndringerForIndeværendeMåned,
  beregnEloÆndringerForMåned,
} from "@/lib/beregnEloMonthly";

// Returnér altid samme JSON-form: { year, month, mode, data }
export async function GET(req: Request) {
  const url = new URL(req.url);
  const y = url.searchParams.get("year");
  const m = url.searchParams.get("month");

  // UDEN params -> indeværende måned
  if (!y || !m) {
    const data = await beregnEloÆndringerForIndeværendeMåned();
    return NextResponse.json(
      { year: null, month: null, mode: "current", data },
      { headers: PUBLIC_DATA_CACHE_HEADERS }
    );
  }

  const year = Number(y);
  const month = Number(m);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json(
      { error: "Invalid year or month" },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const data = await beregnEloÆndringerForMåned(year, month);
  return NextResponse.json(
    { year, month, mode: "specific", data },
    { headers: PUBLIC_DATA_CACHE_HEADERS }
  );
}
