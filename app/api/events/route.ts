export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabaseClient";
import { supabaseServiceRole } from "@/lib/supabaseServiceRole";

// Lille hjælpe-type
type EPMin = { event_id: string; status: string };

/**
 * GET /api/events?all=1  (henter ALLE events)
 * GET /api/events        (kun kommende events)
 */
export async function GET(req: Request) {
  const supabase = supabaseRoute();
  try {
    const url = new URL(req.url);
    const all = url.searchParams.get("all") === "1";
    const {
      data: { user },
    } = await supabase.auth.getUser();

    let isAdmin = false;
    if (user?.id) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("rolle")
        .eq("id", user.id)
        .maybeSingle();
      isAdmin = profile?.rolle === "admin";
    }

    const db = isAdmin ? (supabaseServiceRole as any) : supabase;

    const today = new Date().toISOString().slice(0, 10);

    const query = db
      .from("events")
      .select("*")
      .order("date", { ascending: true })
      .order("start_time", { ascending: true });

    if (!all) {
      query.gte("date", today);
    }

    const { data: events, error } = await query;
    if (error) throw error;

    const ids = (events ?? []).map((e: any) => e.id);
    const counts: Record<string, number> = {};

    if (ids.length) {
      const { data: eps, error: epErr } = await db
        .from("event_players")
        .select("event_id, status")
        .in("event_id", ids);
      if (epErr) throw epErr;
      for (const r of (eps ?? []) as EPMin[]) {
        if (r?.event_id && r.status === "registered") {
          counts[r.event_id] = (counts[r.event_id] ?? 0) + 1;
        }
      }
    }

    const enriched = (events ?? []).map((e: any) => ({ ...e, players_count: counts[e.id] ?? 0 }));

    return NextResponse.json({ data: enriched }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("GET /api/events error", err);
    return NextResponse.json({ data: [] }, { headers: { "Cache-Control": "no-store" } });
  }
}

/**
 * POST /api/events – kræver login (session via cookies)
 */
export async function POST(req: Request) {
  const supabase = supabaseRoute();
  try {
    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;
    if (!user) {
      return NextResponse.json({ error: "Kræver login" }, { status: 401 });
    }

    const payload = await req.json();

    if (!payload?.date || !payload?.start_time || !payload?.end_time) {
      return NextResponse.json({ error: "Mangler dato/start/slut" }, { status: 400 });
    }
    if (!payload?.location || !["Helsinge", "Gilleleje"].includes(payload.location)) {
      return NextResponse.json({ error: "Ugyldigt sted" }, { status: 400 });
    }
    if (!payload?.name || !payload?.max_players) {
      return NextResponse.json({ error: "Mangler navn eller max spillere" }, { status: 400 });
    }

    const row = [{ ...payload, created_by: user.id }];

    const { data, error } = await supabase
      .from("events")
      .insert(row)
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (err: any) {
    console.error("POST /api/events error", err);
    return NextResponse.json({ error: err?.message || "Kunne ikke oprette event" }, { status: 400 });
  }
}
