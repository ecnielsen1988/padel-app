import { NextResponse } from "next/server";
import { getCurrentProfile, getTorsdagPlayers } from "@/lib/torsdagEconomyServer";
import { summarizeDrinkRows, type TorsdagDrinkRow } from "@/lib/torsdagEconomyV2";
import { supabaseServiceRole } from "@/lib/supabaseServiceRole";

export async function GET() {
  try {
    const profile = await getCurrentProfile();
    if (!profile) return NextResponse.json({ error: "Ikke logget ind" }, { status: 401 });
    if (!profile.torsdagspadel) return NextResponse.json({ error: "Ingen adgang" }, { status: 403 });

    const players = await getTorsdagPlayers();
    const names = players.map((row) => row.visningsnavn);
    const drinksResp = await (supabaseServiceRole.from("torsdag_drink_ledger") as any)
      .select("id, visningsnavn, drink_type, direction, quantity, note, event_date, created_at")
      .in("visningsnavn", names)
      .order("created_at", { ascending: false });

    const grouped = new Map<string, TorsdagDrinkRow[]>();
    for (const player of players) grouped.set(player.visningsnavn, []);
    for (const row of ((drinksResp?.data ?? []) as TorsdagDrinkRow[])) {
      const name = String(row.visningsnavn ?? "").trim();
      if (!name) continue;
      if (!grouped.has(name)) grouped.set(name, []);
      grouped.get(name)!.push(row);
    }

    const rows = players
      .map((player) => {
        const summary = summarizeDrinkRows(grouped.get(player.visningsnavn) ?? []);
        return {
          visningsnavn: player.visningsnavn,
          beerCount: summary.beerCount,
          sodaCount: summary.sodaCount,
        };
      })
      .filter((row) => row.beerCount > 0 || row.sodaCount > 0)
      .sort((a, b) => {
        const aTotal = a.beerCount + a.sodaCount;
        const bTotal = b.beerCount + b.sodaCount;
        return bTotal !== aTotal ? bTotal - aTotal : a.visningsnavn.localeCompare(b.visningsnavn, "da-DK");
      });

    return NextResponse.json({
      rows,
      myName: profile.visningsnavn?.trim() ?? "",
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Kunne ikke hente præmiedrikke" }, { status: 500 });
  }
}

