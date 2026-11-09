export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { NextResponse } from "next/server";
import { messagingAdmin } from "@/lib/messagingAuth";
import { notifyProgram } from "@/lib/programPush";
import { supabaseServiceRole } from "@/lib/supabaseServiceRole";

export async function PATCH(req: Request) {
  try {
    const access = await messagingAdmin();
    if (access.response) return access.response;

    const body = await req.json();
    const eventId = (body?.eventId ?? "").toString().trim();
    const status = String(body?.status ?? "").trim();

    if (!eventId) {
      return NextResponse.json({ error: "Mangler eventId." }, { status: 400 });
    }

    if (!["planned", "published"].includes(status)) {
      return NextResponse.json({ error: "Ugyldig status." }, { status: 400 });
    }

    const update = (supabaseServiceRole.from("events") as any).update({ status }).eq("id", eventId);
    // Only the request that changes the status to published may send push.
    if (status === "published") update.or("status.is.null,status.neq.published");
    let { data: updatedEvent, error: updateError } = await update.select("*").maybeSingle();
    const newlyPublished = status === "published" && !!updatedEvent && !updateError;
    if (status === "published" && !updatedEvent && !updateError) {
      const existing = await supabaseServiceRole.from("events").select("*").eq("id", eventId).maybeSingle();
      updatedEvent = existing.data;
      updateError = existing.error;
    }

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    if (!updatedEvent) {
      return NextResponse.json({ error: "Eventet blev ikke fundet." }, { status: 404 });
    }

    const push = newlyPublished ? await notifyProgram({ eventId }) : undefined;
    return NextResponse.json({ data: updatedEvent, push }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "Kunne ikke opdatere eventet." },
      { status: 500 }
    );
  }
}
