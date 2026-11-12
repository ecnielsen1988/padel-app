export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { NextResponse } from "next/server";
import { getEventSubmissionState } from "@/lib/eventSubmission";
import { eventRotation, isRoyalTiebreak, royalPairingComplete, validateRoyalScores } from "@/lib/royal";
import { isPartnerEvent, isRoyalEvent } from "@/lib/eventConfig";
import { messagingAuth } from "@/lib/messagingAuth";
import { supabaseServiceRole } from "@/lib/supabaseServiceRole";
import type { User } from "@supabase/supabase-js";

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

async function getViewerContext(supabase: any, user: User) {
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
    const access = await messagingAuth();
    if (access.response) return access.response;
    const supabase = access.db!;
    const viewer = await getViewerContext(supabase, access.user!);

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

    const royal = isRoyalEvent(eventRow.rules_text);
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

      if (!groupRows.some((row: any) => row.set_index === setIndex)) {
        return NextResponse.json({ error: "Sættet blev ikke fundet." }, { status: 404 });
      }
      if (royal) {
        const sets = Array.from({ length: Math.max(...groupRows.map((row: any) => row.set_index)) + 1 }, (_, si) => {
          const row = groupRows.find((row: any) => row.set_index === si);
          return si === setIndex ? { a: scoreA, b: scoreB } : { a: row?.scoreA ?? 0, b: row?.scoreB ?? 0 };
        });
        const error = validateRoyalScores(sets);
        if (error) return NextResponse.json({ error }, { status: 400 });
      }
      const { error } = await (supabase.from("event_result") as any)
        .update({ scoreA, scoreB, ...(royal ? { tiebreak: isRoyalTiebreak(setIndex) } : {}) })
        .eq("event_id", eventId)
        .eq("group_index", groupIndex)
        .eq("set_index", setIndex);

      if (error) {
        throw error;
      }

      return NextResponse.json({ ok: true });
    }

    if (action === "addSet") {
      const writer = viewer.isAdmin ? supabaseServiceRole : supabase;
      const partnerEvent = isPartnerEvent(eventRow?.rules_text ?? null);

      const nextSetIndex = groupRows.reduce(
        (max: number, row: any) => Math.max(max, Number(row?.set_index ?? 0)),
        -1
      ) + 1;

      const conflict = () => NextResponse.json(
        { error: "Kampen er blevet opdateret. Genindlæs siden, og prøv igen." },
        { status: 409 },
      );
      if (body.expectedSetIndex !== undefined && body.expectedSetIndex !== nextSetIndex) {
        return conflict();
      }

      async function addRows(rows: object[]) {
        const { data, error } = await (writer.from("event_result") as any)
          .insert(rows).select("*");
        if (error?.code === "23505") return conflict();
        if (error) throw error;
        if (data?.length !== rows.length) return conflict();
        return NextResponse.json({ ok: true, setIndex: nextSetIndex, rows: data });
      }

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

      if (royal) {
        const lastSets = groupRows.slice(-3).map((row: any) => ({ a: row.scoreA ?? 0, b: row.scoreB ?? 0 }));
        if (nextSetIndex % 3 !== 0 || !royalPairingComplete(lastSets)) {
          return NextResponse.json({ error: "Afslut den nuværende makkerkombination først." }, { status: 400 });
        }
        const rows = Array.from({ length: 3 }, (_, i) => {
          const si = nextSetIndex + i;
          const rot = eventRotation(si, true);
          return {
            event_id: eventId, group_index: groupIndex, set_index: si,
            court_label: firstRow.court_label, start_time: firstRow.start_time, end_time: firstRow.end_time,
            holdA1: playerOrder[rot[0][0]], holdA2: playerOrder[rot[0][1]],
            holdB1: playerOrder[rot[1][0]], holdB2: playerOrder[rot[1][1]],
            scoreA: 0, scoreB: 0, tiebreak: isRoyalTiebreak(si),
          };
        });
        return await addRows(rows);
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

      return await addRows([payload]);
    }

    return NextResponse.json({ error: "Ukendt handling." }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? "Kunne ikke gemme event-resultatet." },
      { status: 500 }
    );
  }
}
