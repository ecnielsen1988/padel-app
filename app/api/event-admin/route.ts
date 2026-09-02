export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabaseClient";
import { supabaseServiceRole } from "@/lib/supabaseServiceRole";

async function requireAdmin() {
  const supabase = supabaseRoute();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Kræver login.", status: 401 } as const;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("rolle")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError || profile?.rolle !== "admin") {
    return { error: "Kun admin har adgang.", status: 403 } as const;
  }

  return { user } as const;
}

export async function PATCH(req: Request) {
  try {
    const adminCheck = await requireAdmin();
    if ("error" in adminCheck) {
      return NextResponse.json({ error: adminCheck.error }, { status: adminCheck.status });
    }

    const body = await req.json();
    const eventId = (body?.eventId ?? "").toString().trim();
    const status = String(body?.status ?? "").trim();

    if (!eventId) {
      return NextResponse.json({ error: "Mangler eventId." }, { status: 400 });
    }

    if (!["planned", "published"].includes(status)) {
      return NextResponse.json({ error: "Ugyldig status." }, { status: 400 });
    }

    const { data: updatedEvent, error: updateError } = await (supabaseServiceRole
      .from("events") as any)
      .update({ status })
      .eq("id", eventId)
      .select("*")
      .maybeSingle();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    if (!updatedEvent) {
      return NextResponse.json({ error: "Eventet blev ikke fundet." }, { status: 404 });
    }

    return NextResponse.json({ data: updatedEvent }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "Kunne ikke opdatere eventet." },
      { status: 500 }
    );
  }
}
