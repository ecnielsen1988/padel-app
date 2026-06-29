export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { NextResponse } from "next/server";
import { getEventSubmissionState } from "@/lib/eventSubmission";
import { isPartnerEvent } from "@/lib/eventConfig";
import { supabaseRoute } from "@/lib/supabaseClient";

const ROTATIONS = [
  [
    [0, 1],
    [2, 3],
  ],
  [
    [0, 2],
    [1, 3],
  ],
  [
    [0, 3],
    [1, 2],
  ],
] as const;

async function getViewerContext(supabase: any) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("visningsnavn, rolle")
    .eq("id", user.id)
    .maybeSingle();

  const visningsnavn =
    (profile?.visningsnavn ?? "").toString().trim() ||
    ((user.user_metadata as any)?.visningsnavn ?? "").toString().trim() ||
    (user.email ? user.email.split("@")[0] : "");

  return {
    user,
    visningsnavn,
    isAdmin: (profile?.rolle ?? "") === "admin",
  };
}

function canEditMatch(viewerName: string, row: any) {
  const names = [row?.holdA1, row?.holdA2, row?.holdB1, row?.holdB2]
    .map((value) => (value ?? "").toString().trim())
    .filter(Boolean);
  return names.includes(viewerName.trim());
}

export async function POST(req: Request) {
  try {
    const supabase = supabaseRoute();
    const viewer = await getViewerContext(supabase);

    if (!viewer?.user || !viewer.visningsnavn) {
      return NextResponse.json({ error: "Du skal være logget ind." }, { status: 401 });
    }

    const body = await req.json();
    const action = String(body?.action ?? "").trim();
    const eventId = String(body?.eventId ?? "").trim();
    const groupIndex = Number(body?.groupIndex);

    if (!eventId || !Number.isInteger(groupIndex) || groupIndex < 0) {
      return NextResponse.json({ error: "Ugyldig kamp-reference." }, { status: 400 });
    }

    const { data: eventRow, error: eventError } = await supabase
      .from("events")
      .select("id, date, rules_text")
      .eq("id", eventId)
      .maybeSingle();

    if (eventError || !eventRow) {
      return NextResponse.json({ error: "Event blev ikke fundet." }, { status: 404 });
    }

    const submissionState = await getEventSubmissionState(supabase, eventRow);
    if (submissionState.submitted) {
      return NextResponse.json(
        { error: "Eventet er allerede indberettet. Brug fortryd indberetning først." },
        { status: 409 }
      );
    }

    const { data: groupRows, error: groupError } = await supabase
      .from("event_result")
      .select("*")
      .eq("event_id", eventId)
      .eq("group_index", groupIndex)
      .order("set_index", { ascending: true });

    if (groupError || !groupRows || groupRows.length === 0) {
      return NextResponse.json({ error: "Kampen blev ikke fundet." }, { status: 404 });
    }

    const firstRow = groupRows[0];
    const allowed = viewer.isAdmin || canEditMatch(viewer.visningsnavn, firstRow);
    if (!allowed) {
      return NextResponse.json(
        { error: "Du kan kun redigere dine egne kampe." },
        { status: 403 }
      );
    }

    if (action === "updateScore") {
      const setIndex = Number(body?.setIndex);
      const scoreA = Number(body?.scoreA);
      const scoreB = Number(body?.scoreB);

      if (!Number.isInteger(setIndex) || setIndex < 0) {
        return NextResponse.json({ error: "Ugyldigt sæt." }, { status: 400 });
      }

      if (!Number.isFinite(scoreA) || !Number.isFinite(scoreB)) {
        return NextResponse.json({ error: "Ugyldige scorer." }, { status: 400 });
      }

      const { error } = await (supabase.from("event_result") as any)
        .update({ scoreA, scoreB })
        .eq("event_id", eventId)
        .eq("group_index", groupIndex)
        .eq("set_index", setIndex);

      if (error) {
        throw error;
      }

      return NextResponse.json({ ok: true });
    }

    if (action === "addSet") {
      const partnerEvent = isPartnerEvent(eventRow?.rules_text ?? null);

      const nextSetIndex = groupRows.reduce(
        (max: number, row: any) => Math.max(max, Number(row?.set_index ?? 0)),
        -1
      ) + 1;

      const playerOrder = [
        (firstRow?.holdA1 ?? "").toString().trim(),
        (firstRow?.holdA2 ?? "").toString().trim(),
        (firstRow?.holdB1 ?? "").toString().trim(),
        (firstRow?.holdB2 ?? "").toString().trim(),
      ];

      if (playerOrder.some((name) => !name)) {
        return NextResponse.json(
          { error: "Kampen mangler spillere og kan ikke udvides endnu." },
          { status: 400 }
        );
      }

      const payload = {
        event_id: eventId,
        group_index: groupIndex,
        set_index: nextSetIndex,
        court_label: firstRow?.court_label ?? null,
        start_time: firstRow?.start_time ?? null,
        end_time: firstRow?.end_time ?? null,
        holdA1: partnerEvent
          ? playerOrder[0] ?? null
          : playerOrder[ROTATIONS[nextSetIndex % ROTATIONS.length][0][0]] ?? null,
        holdA2: partnerEvent
          ? playerOrder[1] ?? null
          : playerOrder[ROTATIONS[nextSetIndex % ROTATIONS.length][0][1]] ?? null,
        holdB1: partnerEvent
          ? playerOrder[2] ?? null
          : playerOrder[ROTATIONS[nextSetIndex % ROTATIONS.length][1][0]] ?? null,
        holdB2: partnerEvent
          ? playerOrder[3] ?? null
          : playerOrder[ROTATIONS[nextSetIndex % ROTATIONS.length][1][1]] ?? null,
        scoreA: 0,
        scoreB: 0,
        tiebreak: false,
      };

      const { error } = await (supabase.from("event_result") as any).upsert([payload], {
        onConflict: "event_id,group_index,set_index",
      });

      if (error) {
        throw error;
      }

      return NextResponse.json({ ok: true, setIndex: nextSetIndex });
    }

    return NextResponse.json({ error: "Ukendt handling." }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "Kunne ikke gemme event-resultatet." },
      { status: 500 }
    );
  }
}
