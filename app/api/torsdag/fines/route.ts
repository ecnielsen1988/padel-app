import { NextResponse } from "next/server";
import { getCurrentProfile, getTorsdagPlayers } from "@/lib/torsdagEconomyServer";
import { supabaseServiceRole } from "@/lib/supabaseServiceRole";
import type { TorsdagFineRow } from "@/lib/torsdagEconomyV2";

export async function GET() {
  try {
    const profile = await getCurrentProfile();
    if (!profile) return NextResponse.json({ error: "Ikke logget ind" }, { status: 401 });
    if (!profile.torsdagspadel) return NextResponse.json({ error: "Ingen adgang" }, { status: 403 });

    const names = (await getTorsdagPlayers()).map((row) => row.visningsnavn);
    const finesResp = await (supabaseServiceRole.from("torsdag_fines") as any)
      .select("id, visningsnavn, fine_type, reason, amount_ore, status, event_date, minutes_late, created_at")
      .in("visningsnavn", names)
      .eq("status", "open")
      .order("created_at", { ascending: false });

    return NextResponse.json({
      rows: (finesResp?.data ?? []) as TorsdagFineRow[],
      myName: profile.visningsnavn?.trim() ?? "",
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Kunne ikke hente bøder" }, { status: 500 });
  }
}

