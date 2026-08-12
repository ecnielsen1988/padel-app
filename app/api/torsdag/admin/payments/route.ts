import { NextRequest, NextResponse } from "next/server";
import { ensureAdminProfile } from "@/lib/torsdagEconomyServer";
import { supabaseServiceRole } from "@/lib/supabaseServiceRole";
import { getRemainingFineOre, type TorsdagFineRow } from "@/lib/torsdagEconomyV2";

type PaymentGroup = {
  playerName: string;
  expectedAmountOre: number;
  fineCount: number;
  requestedAt: string;
  fines: Array<{
    id: string;
    reason: string;
    eventDate: string | null;
    remainingAmountOre: number;
    totalAmountOre: number;
  }>;
};

function buildPaymentGroups(rows: TorsdagFineRow[]): PaymentGroup[] {
  const groups = new Map<string, PaymentGroup>();

  for (const row of rows) {
    const remainingAmountOre = getRemainingFineOre(row);
    if (remainingAmountOre <= 0) continue;

    const playerName = String(row.visningsnavn ?? "").trim();
    if (!playerName) continue;

    const existing = groups.get(playerName) ?? {
      playerName,
      expectedAmountOre: 0,
      fineCount: 0,
      requestedAt: row.payment_requested_at ?? row.created_at ?? "",
      fines: [],
    };

    existing.expectedAmountOre += remainingAmountOre;
    existing.fineCount += 1;
    if ((row.payment_requested_at ?? row.created_at ?? "") < existing.requestedAt) {
      existing.requestedAt = row.payment_requested_at ?? row.created_at ?? "";
    }
    existing.fines.push({
      id: row.id,
      reason: row.reason,
      eventDate: row.event_date ?? null,
      remainingAmountOre,
      totalAmountOre: Number(row.amount_ore ?? 0),
    });
    groups.set(playerName, existing);
  }

  return Array.from(groups.values()).sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));
}

export async function GET() {
  const admin = await ensureAdminProfile();
  if ("error" in admin) return NextResponse.json({ error: admin.error }, { status: admin.status });

  const { data, error } = await (supabaseServiceRole.from("torsdag_fines") as any)
    .select("id, visningsnavn, reason, amount_ore, paid_amount_ore, status, event_date, created_at, payment_requested_at")
    .eq("status", "pending")
    .order("payment_requested_at", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    payments: buildPaymentGroups((data ?? []) as TorsdagFineRow[]),
  });
}

export async function POST(request: NextRequest) {
  const admin = await ensureAdminProfile();
  if ("error" in admin) return NextResponse.json({ error: admin.error }, { status: admin.status });

  const body = await request.json();
  const playerName = String(body?.playerName ?? "").trim();
  const receivedAmountOre = Number(body?.receivedAmountOre ?? NaN);

  if (!playerName) {
    return NextResponse.json({ error: "Spiller mangler" }, { status: 400 });
  }
  if (!Number.isFinite(receivedAmountOre) || receivedAmountOre < 0) {
    return NextResponse.json({ error: "Ugyldigt modtaget beløb" }, { status: 400 });
  }

  const { data, error } = await (supabaseServiceRole.from("torsdag_fines") as any)
    .select("id, visningsnavn, reason, amount_ore, paid_amount_ore, status, event_date, created_at, payment_requested_at")
    .eq("visningsnavn", playerName)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const fines = (data ?? []) as TorsdagFineRow[];
  const expectedAmountOre = fines.reduce((sum, row) => sum + getRemainingFineOre(row), 0);

  if (expectedAmountOre === 0) {
    return NextResponse.json({ error: "Ingen afventende betalinger fundet" }, { status: 400 });
  }
  if (receivedAmountOre > expectedAmountOre) {
    return NextResponse.json({ error: "Det modtagne beløb kan ikke være højere end det forventede" }, { status: 400 });
  }

  let remainingReceivedOre = receivedAmountOre;
  const updates = fines.map((row) => {
    const amountOre = Number(row.amount_ore ?? 0);
    const currentPaidOre = Math.min(amountOre, Math.max(0, Number(row.paid_amount_ore ?? 0)));
    const remainingFineOre = Math.max(0, amountOre - currentPaidOre);
    const appliedOre = Math.min(remainingReceivedOre, remainingFineOre);
    const nextPaidOre = currentPaidOre + appliedOre;
    remainingReceivedOre -= appliedOre;

    const isFullyPaid = nextPaidOre >= amountOre;

    return {
      id: row.id,
      paid_amount_ore: nextPaidOre,
      status: isFullyPaid ? "paid" : "open",
      settled_at: isFullyPaid ? new Date().toISOString() : null,
      payment_requested_at: isFullyPaid ? row.payment_requested_at ?? new Date().toISOString() : null,
    };
  });

  for (const update of updates) {
    const { error: updateError } = await (supabaseServiceRole.from("torsdag_fines") as any)
      .update({
        paid_amount_ore: update.paid_amount_ore,
        status: update.status,
        settled_at: update.settled_at,
        payment_requested_at: update.payment_requested_at,
      })
      .eq("id", update.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    ok: true,
    expectedAmountOre,
    receivedAmountOre,
    remainingOpenOre: expectedAmountOre - receivedAmountOre,
  });
}
