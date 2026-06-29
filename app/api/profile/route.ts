export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { NextResponse } from "next/server";
import { getProfileViewData } from "@/lib/profileViewData";
import { supabaseRoute } from "@/lib/supabaseClient";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const visningsnavn = decodeURIComponent(url.searchParams.get("visningsnavn") ?? "").trim();

    if (!visningsnavn) {
      return NextResponse.json({ error: "Missing visningsnavn" }, { status: 400 });
    }

    const supabase = supabaseRoute();
    const data = await getProfileViewData(supabase, visningsnavn);

    return NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "Kunne ikke hente profil-data" },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
