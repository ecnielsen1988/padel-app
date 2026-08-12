import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/torsdagEconomyServer";
import { summarizeDrinkRows, summarizeFineRows, type TorsdagDrinkRow, type TorsdagFineRow } from "@/lib/torsdagEconomyV2";
import { supabaseServiceRole } from "@/lib/supabaseServiceRole";

export async function GET() {
  try {
    const profile = await getCurrentProfile();
    if (!profile) {
      return NextResponse.json({ error: "Ikke logget ind" }, { status: 401 });
    }
    if (!profile.torsdagspadel || !profile.visningsnavn) {
      return NextResponse.json({ error: "Ingen adgang" }, { status: 403 });
    }

    const [finesResp, drinksResp] = await Promise.all([
      (supabaseServiceRole.from("torsdag_fines") as any)
        .select("id, visningsnavn, fine_type, reason, amount_ore, paid_amount_ore, status, event_date, minutes_late, created_at")
        .eq("visningsnavn", profile.visningsnavn.trim()),
      (supabaseServiceRole.from("torsdag_drink_ledger") as any)
        .select("id, visningsnavn, drink_type, direction, quantity, note, event_date, created_at")
        .eq("visningsnavn", profile.visningsnavn.trim()),
    ]);

    const fineSummary = summarizeFineRows((finesResp?.data ?? []) as TorsdagFineRow[]);
    const drinkSummary = summarizeDrinkRows((drinksResp?.data ?? []) as TorsdagDrinkRow[]);

    return NextResponse.json({
      openFineOre: fineSummary.openFineOre,
      outstandingFineOre: fineSummary.outstandingFineOre,
      pendingFineOre: fineSummary.pendingFineOre,
      hasOpenFine: fineSummary.openFineCount > 0,
      hasPendingFine: fineSummary.hasPending,
      beerPrizeCount: drinkSummary.beerCount,
      sodaPrizeCount: drinkSummary.sodaCount,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Kunne ikke hente økonomi" }, { status: 500 });
  }
}
