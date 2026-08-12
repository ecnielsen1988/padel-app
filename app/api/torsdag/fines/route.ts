import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/torsdagEconomyServer";
import { supabaseServiceRole } from "@/lib/supabaseServiceRole";
import type { TorsdagFineRow } from "@/lib/torsdagEconomyV2";
import { NextRequest } from "next/server";

export async function GET() {
  try {
    const profile = await getCurrentProfile();
    if (!profile) return NextResponse.json({ error: "Ikke logget ind" }, { status: 401 });
    if (!profile.torsdagspadel) return NextResponse.json({ error: "Ingen adgang" }, { status: 403 });

    const finesResp = await (supabaseServiceRole.from("torsdag_fines") as any)
      .select("id, visningsnavn, fine_type, reason, amount_ore, status, event_date, minutes_late, created_at, payment_requested_at, settled_at")
      .order("created_at", { ascending: false });

    return NextResponse.json({
      rows: ((finesResp?.data ?? []) as TorsdagFineRow[]).filter(
        (row) => String(row.status ?? "open").trim().toLowerCase() !== "cancelled",
      ),
      myName: profile.visningsnavn?.trim() ?? "",
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Kunne ikke hente bøder" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const profile = await getCurrentProfile();
    if (!profile) return NextResponse.json({ error: "Ikke logget ind" }, { status: 401 });
    if (!profile.torsdagspadel || !profile.visningsnavn) return NextResponse.json({ error: "Ingen adgang" }, { status: 403 });

    const body = await request.json();
    const action = String(body?.action ?? "");
    const fineId = String(body?.fineId ?? "").trim();

    if (action === "markPendingAllMine") {
      const { data: ownFines, error: ownFinesError } = await (supabaseServiceRole.from("torsdag_fines") as any)
        .select("id, status")
        .eq("visningsnavn", profile.visningsnavn.trim());

      if (ownFinesError) return NextResponse.json({ error: ownFinesError.message }, { status: 500 });

      const openFineIds = ((ownFines ?? []) as Array<{ id?: string; status?: string | null }>)
        .filter((row) => String(row.status ?? "open").trim().toLowerCase() === "open")
        .map((row) => String(row.id ?? "").trim())
        .filter(Boolean);

      if (openFineIds.length === 0) {
        return NextResponse.json({ ok: true });
      }

      const { error } = await (supabaseServiceRole.from("torsdag_fines") as any)
        .update({
          status: "pending",
          payment_requested_at: new Date().toISOString(),
        })
        .in("id", openFineIds);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    if (action !== "markPending" || !fineId) {
      return NextResponse.json({ error: "Ugyldig handling" }, { status: 400 });
    }

    const { data: fine, error: fineError } = await (supabaseServiceRole.from("torsdag_fines") as any)
      .select("id, visningsnavn, status")
      .eq("id", fineId)
      .maybeSingle();

    if (fineError || !fine?.id) {
      return NextResponse.json({ error: "Bøden blev ikke fundet" }, { status: 404 });
    }

    if (String(fine.visningsnavn ?? "").trim() !== profile.visningsnavn.trim()) {
      return NextResponse.json({ error: "Du kan kun betale dine egne bøder" }, { status: 403 });
    }

    const { error } = await (supabaseServiceRole.from("torsdag_fines") as any)
      .update({
        status: "pending",
        payment_requested_at: new Date().toISOString(),
      })
      .eq("id", fineId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Kunne ikke opdatere bøden" }, { status: 500 });
  }
}
