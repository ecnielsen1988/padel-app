import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/torsdagEconomyServer";
import { buildDrinkHistory, summarizeDrinkRows, type TorsdagDrinkRow } from "@/lib/torsdagEconomyV2";
import { supabaseServiceRole } from "@/lib/supabaseServiceRole";

export async function GET() {
  try {
    const profile = await getCurrentProfile();
    if (!profile) return NextResponse.json({ error: "Ikke logget ind" }, { status: 401 });
    if (!profile.torsdagspadel) return NextResponse.json({ error: "Ingen adgang" }, { status: 403 });

    const drinksResp = await (supabaseServiceRole.from("torsdag_drink_ledger") as any)
      .select("id, visningsnavn, drink_type, direction, quantity, note, event_date, created_at")
      .eq("visningsnavn", profile.visningsnavn?.trim() ?? "")
      .order("created_at", { ascending: false });

    const rows = (drinksResp?.data ?? []) as TorsdagDrinkRow[];
    const summary = summarizeDrinkRows(rows);

    return NextResponse.json({
      myName: profile.visningsnavn?.trim() ?? "",
      summary,
      history: buildDrinkHistory(rows),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Kunne ikke hente præmiedrikke" }, { status: 500 });
  }
}
