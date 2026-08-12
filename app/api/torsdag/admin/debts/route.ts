import { NextRequest, NextResponse } from "next/server";
import { ensureAdminProfile } from "@/lib/torsdagEconomyServer";
import { supabaseServiceRole } from "@/lib/supabaseServiceRole";

export async function POST(request: NextRequest) {
  const admin = await ensureAdminProfile();
  if ("error" in admin) return NextResponse.json({ error: admin.error }, { status: admin.status });

  const body = await request.json();
  const names = Array.isArray(body?.names)
    ? body.names.map((value: unknown) => String(value ?? "").trim()).filter(Boolean)
    : [];

  if (names.length === 0) {
    return NextResponse.json({ debts: {} });
  }

  const { data, error } = await (supabaseServiceRole.from("torsdag_fines") as any)
    .select("visningsnavn, amount_ore, paid_amount_ore, status")
    .in("visningsnavn", names)
    .in("status", ["open", "pending"]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const debts: Record<string, number> = {};
  for (const row of (data ?? []) as Array<{
    visningsnavn?: string | null;
    amount_ore?: number | null;
    paid_amount_ore?: number | null;
  }>) {
    const name = String(row.visningsnavn ?? "").trim();
    const amount = Number(row.amount_ore ?? 0);
    const paid = Number(row.paid_amount_ore ?? 0);
    const remaining = Math.max(0, amount - paid);
    if (!name || remaining <= 0) continue;
    debts[name] = (debts[name] ?? 0) + remaining;
  }

  return NextResponse.json({ debts });
}
