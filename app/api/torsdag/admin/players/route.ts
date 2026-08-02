import { NextResponse } from "next/server";
import { ensureAdminProfile, getTorsdagPlayers } from "@/lib/torsdagEconomyServer";

export async function GET() {
  const admin = await ensureAdminProfile();
  if ("error" in admin) return NextResponse.json({ error: admin.error }, { status: admin.status });

  return NextResponse.json({
    players: await getTorsdagPlayers(),
  });
}

