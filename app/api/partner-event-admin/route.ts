export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabaseClient";
import { supabaseServiceRole } from "@/lib/supabaseServiceRole";
import {
  buildEventRulesText,
  type PartnerTeamMeta,
} from "@/lib/eventConfig";

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
    const status = body?.status == null ? null : String(body.status).trim();
    const visibleRulesText =
      body?.visibleRulesText == null ? null : String(body.visibleRulesText);
    const rulesText = body?.rulesText == null ? null : String(body.rulesText);
    const partnerTeams = Array.isArray(body?.partnerTeams)
      ? (body.partnerTeams as PartnerTeamMeta[])
      : null;

    if (!eventId) {
      return NextResponse.json({ error: "Mangler eventId." }, { status: 400 });
    }

    const patch: Record<string, unknown> = {};
    if (status) patch.status = status;
    if (rulesText !== null) {
      patch.rules_text = rulesText;
    } else if (visibleRulesText !== null || partnerTeams !== null) {
      patch.rules_text = buildEventRulesText(visibleRulesText, {
        format: "partner",
        partnerTeams: partnerTeams ?? [],
      });
    }

    const { data: updatedEvent, error: updateError } = await (supabaseServiceRole
      .from("events") as any)
      .update(patch)
      .eq("id", eventId)
      .select("*")
      .maybeSingle();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    if (!updatedEvent) {
      return NextResponse.json({ error: "Eventet blev ikke fundet." }, { status: 404 });
    }

    if (partnerTeams !== null) {
      const rows = partnerTeams.flatMap((team) =>
        team.playerIds.map((userId, index) => ({
          event_id: eventId,
          user_id: userId,
          visningsnavn: team.playerNames[index],
          status: "registered",
        }))
      );

      const delRes = await (supabaseServiceRole.from("event_players") as any)
        .delete()
        .eq("event_id", eventId);

      if (delRes?.error) {
        return NextResponse.json({ error: delRes.error.message }, { status: 500 });
      }

      if (rows.length > 0) {
        const upsertRes = await (supabaseServiceRole.from("event_players") as any).upsert(
          rows,
          { onConflict: "event_id,user_id" }
        );

        if (upsertRes?.error) {
          return NextResponse.json({ error: upsertRes.error.message }, { status: 500 });
        }
      }
    }

    return NextResponse.json({ data: updatedEvent }, { headers: { "Cache-Control": "no-store" } });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "Kunne ikke opdatere makkereventet." },
      { status: 500 }
    );
  }
}
