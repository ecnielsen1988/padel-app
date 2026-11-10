export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { NextResponse } from "next/server";
import { messagingAdmin } from "@/lib/messagingAuth";
import { notifyProgram } from "@/lib/programPush";
import { supabaseServiceRole } from "@/lib/supabaseServiceRole";
import { parseThursdayPublication, thursdaySetNames } from "@/lib/thursdayProgram";

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

    let program: ReturnType<typeof parseThursdayPublication> | undefined;
    if (status === "published" && body.thursdayProgram !== undefined) {
      try {
        program = parseThursdayPublication(body.thursdayProgram, eventId);
      } catch (error) {
        return NextResponse.json({ error: (error as Error).message }, { status: 400 });
      }

      const current = await supabaseServiceRole.from("events").select("*").eq("id", eventId).maybeSingle<{ status: string | null }>();
      if (current.error) throw current.error;
      if (!current.data) return NextResponse.json({ error: "Eventet blev ikke fundet." }, { status: 404 });
      const sets = supabaseServiceRole.from("event_result") as any;
      const saved = await sets.select("*").eq("event_id", eventId).order("group_index").order("set_index");
      if (saved.error) throw saved.error;
      if (current.data.status === "published") {
        return NextResponse.json({ data: current.data, program: saved.data });
      }

      const key = (row: { group_index: number; set_index: number }) => `${row.group_index}-${row.set_index}`;
      const bySet = new Map(program.map(row => [key(row), row]));
      const obsolete = [];
      for (const old of saved.data ?? []) {
        const next = bySet.get(key(old));
        const hasScore = !!(old.scoreA || old.scoreB);
        const samePlayers = next && thursdaySetNames(old).every((name, index) => name === thursdaySetNames(next)[index]);
        if (hasScore && !samePlayers) {
          return NextResponse.json({ error: "Programmet ændrer et sæt med gemt score. Fjern scoren først, eller behold det oprindelige sæt." }, { status: 409 });
        }
        if (next && hasScore) {
          next.scoreA = old.scoreA ?? 0;
          next.scoreB = old.scoreB ?? 0;
        }
        if (!next) obsolete.push(old);
      }

      const stored = await (supabaseServiceRole.from("event_result") as any).upsert(program, {
        onConflict: "event_id,group_index,set_index",
      });
      if (stored.error) throw stored.error;
      for (const old of obsolete) {
        let remove = (supabaseServiceRole.from("event_result") as any).delete()
          .eq("event_id", eventId).eq("group_index", old.group_index).eq("set_index", old.set_index);
        remove = old.scoreA == null ? remove.is("scoreA", null) : remove.eq("scoreA", 0);
        remove = old.scoreB == null ? remove.is("scoreB", null) : remove.eq("scoreB", 0);
        const removed = await remove.select("set_index").maybeSingle();
        if (removed.error) throw removed.error;
        if (!removed.data) return NextResponse.json({ error: "Programmet blev ændret under gemning. Genindlæs siden og prøv igen." }, { status: 409 });
      }
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
    return NextResponse.json({ data: updatedEvent, program, push }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "Kunne ikke opdatere eventet." },
      { status: 500 }
    );
  }
}
