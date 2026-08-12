import { NextRequest, NextResponse } from "next/server";
import { buildAdminHistory, summarizeDrinkRows, summarizeFineRows, type TorsdagDrinkRow, type TorsdagFineRow } from "@/lib/torsdagEconomyV2";
import { ensureAdminProfile, getTorsdagPlayers } from "@/lib/torsdagEconomyServer";
import { supabaseServiceRole } from "@/lib/supabaseServiceRole";

async function getPlayerIdMap() {
  const players = await getTorsdagPlayers();
  return new Map(players.map((player) => [player.visningsnavn, player.id] as const));
}

export async function GET(request: NextRequest) {
  const admin = await ensureAdminProfile();
  if ("error" in admin) return NextResponse.json({ error: admin.error }, { status: admin.status });

  const playerName = request.nextUrl.searchParams.get("player")?.trim();
  if (!playerName) return NextResponse.json({ error: "Spiller mangler" }, { status: 400 });

  const [finesResp, drinksResp] = await Promise.all([
    (supabaseServiceRole.from("torsdag_fines") as any)
      .select("id, visningsnavn, fine_type, reason, amount_ore, paid_amount_ore, status, event_date, minutes_late, created_at, payment_requested_at, settled_at")
      .eq("visningsnavn", playerName)
      .order("created_at", { ascending: false }),
    (supabaseServiceRole.from("torsdag_drink_ledger") as any)
      .select("id, visningsnavn, drink_type, direction, quantity, note, event_date, created_at")
      .eq("visningsnavn", playerName)
      .order("created_at", { ascending: false }),
  ]);

  const fines = (finesResp?.data ?? []) as TorsdagFineRow[];
  const drinks = (drinksResp?.data ?? []) as TorsdagDrinkRow[];

  return NextResponse.json({
    summary: {
      ...summarizeFineRows(fines),
      ...summarizeDrinkRows(drinks),
    },
    history: buildAdminHistory(fines, drinks),
  });
}

export async function POST(request: NextRequest) {
  const admin = await ensureAdminProfile();
  if ("error" in admin) return NextResponse.json({ error: admin.error }, { status: admin.status });

  const body = await request.json();
  const action = String(body?.action ?? "");
  const playerName = String(body?.playerName ?? "").trim();
  const playerIdMap = await getPlayerIdMap();
  const playerId = playerIdMap.get(playerName) ?? null;

  if (action !== "deleteFine" && action !== "deleteDrink" && !playerName) {
    return NextResponse.json({ error: "Spiller mangler" }, { status: 400 });
  }

  if (action === "addFine") {
    const amountOre = Number(body?.amountOre ?? 0);
    const reason = String(body?.reason ?? "").trim();
    const fineType = String(body?.fineType ?? "custom").trim();
    const eventDate = body?.eventDate ? String(body.eventDate) : null;
    const minutesLate = body?.minutesLate != null ? Number(body.minutesLate) : null;

    if (!reason || !Number.isFinite(amountOre) || amountOre <= 0) {
      return NextResponse.json({ error: "Ugyldig bøde" }, { status: 400 });
    }

    const { error } = await (supabaseServiceRole.from("torsdag_fines") as any).insert({
      player_id: playerId,
      visningsnavn: playerName,
      fine_type: fineType,
      reason,
      amount_ore: amountOre,
      paid_amount_ore: 0,
      status: "open",
      event_date: eventDate,
      minutes_late: minutesLate,
      created_by: admin.profile.id,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "addDrink") {
    const drinkType = String(body?.drinkType ?? "").trim();
    const direction = String(body?.direction ?? "").trim();
    const quantity = Number(body?.quantity ?? 0);
    const note = body?.note ? String(body.note) : null;
    const eventDate = body?.eventDate ? String(body.eventDate) : null;

    if (!["beer", "soda"].includes(drinkType) || !["earned", "redeemed"].includes(direction) || !Number.isFinite(quantity) || quantity <= 0) {
      return NextResponse.json({ error: "Ugyldig drikkevarelinje" }, { status: 400 });
    }

    const { error } = await (supabaseServiceRole.from("torsdag_drink_ledger") as any).insert({
      player_id: playerId,
      visningsnavn: playerName,
      drink_type: drinkType,
      direction,
      quantity,
      note,
      event_date: eventDate,
      created_by: admin.profile.id,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "deleteFine") {
    const id = String(body?.id ?? "").trim();
    const { error } = await (supabaseServiceRole.from("torsdag_fines") as any).delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "updateFineStatus") {
    const id = String(body?.id ?? "").trim();
    const status = String(body?.status ?? "").trim();
    if (!["open", "pending", "paid"].includes(status)) {
      return NextResponse.json({ error: "Ugyldig status" }, { status: 400 });
    }

    const { data: fine, error: fineError } = await (supabaseServiceRole.from("torsdag_fines") as any)
      .select("id, amount_ore, paid_amount_ore")
      .eq("id", id)
      .maybeSingle();

    if (fineError || !fine?.id) {
      return NextResponse.json({ error: "Bøden blev ikke fundet" }, { status: 404 });
    }

    const amountOre = Number(fine.amount_ore ?? 0);
    const currentPaidOre = Math.min(amountOre, Math.max(0, Number(fine.paid_amount_ore ?? 0)));
    const patch: Record<string, unknown> = { status };

    if (status === "paid") {
      patch.paid_amount_ore = amountOre;
      patch.settled_at = new Date().toISOString();
    }
    if (status === "pending") {
      patch.paid_amount_ore = currentPaidOre;
      patch.settled_at = null;
      patch.payment_requested_at = new Date().toISOString();
    }
    if (status === "open") {
      patch.paid_amount_ore = currentPaidOre >= amountOre ? 0 : currentPaidOre;
      patch.settled_at = null;
      patch.payment_requested_at = null;
    }

    const { error } = await (supabaseServiceRole.from("torsdag_fines") as any)
      .update(patch)
      .eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "deleteDrink") {
    const id = String(body?.id ?? "").trim();
    const { error } = await (supabaseServiceRole.from("torsdag_drink_ledger") as any).delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Ukendt handling" }, { status: 400 });
}
