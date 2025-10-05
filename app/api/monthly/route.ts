// app/api/monthly/route.ts
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { NextResponse } from "next/server";
import { beregnEloÆndringerForIndeværendeMåned } from "@/lib/beregnEloChange";

// Returnér altid samme JSON-form: { year, month, mode, data }
export async function GET(req: Request) {
  const url = new URL(req.url);
  const y = url.searchParams.get("year");
  const m = url.searchParams.get("month");

  // UDEN params -> indeværende måned (bevar gammel adfærd)
  if (!y || !m) {
    const data = await beregnEloÆndringerForIndeværendeMåned();
    return NextResponse.json(
      { year: null, month: null, mode: "current", data },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const year = Number(y);
  const month = Number(m);

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: "Invalid year or month" }, { status: 400 });
  }

  // MED params -> specifik måned via samme funktion (nu parametrisérbar)
  const data = await beregnEloÆndringerForIndeværendeMåned({ year, month });
  return NextResponse.json(
    { year, month, mode: "specific", data },
    { headers: { "Cache-Control": "no-store" } }
  );
}

