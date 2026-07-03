export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabaseClient";
import { supabaseServiceRole } from "@/lib/supabaseServiceRole";
import {
  clearRecentResultCardsCache,
} from "@/lib/resultsFeed";
import {
  encodeResultChangeRequest,
  getResultChangeReviewStatus,
  parseResultChangeRequest,
  type ResultChangeRequestPayload,
  type ResultChangeSet,
} from "@/lib/resultChangeRequests";

async function getViewer(supabase: any) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const profRes = await supabase
    .from("profiles")
    .select("visningsnavn, rolle")
    .eq("id", user.id)
    .maybeSingle();

  return {
    user,
    visningsnavn: (profRes?.data?.visningsnavn ?? "").toString().trim(),
    rolle: (profRes?.data?.rolle ?? "").toString().trim(),
  };
}

async function fetchMatchRows(supabase: any, kampid: number) {
  const res = await supabase
    .from("newresults")
    .select("id,kampid,holdA1,holdA2,holdB1,holdB2,scoreA,scoreB")
    .eq("kampid", kampid)
    .order("id", { ascending: true });

  if (res?.error) {
    throw res.error;
  }

  return (res?.data ?? []) as Array<{
    id: number;
    kampid: number;
    holdA1: string;
    holdA2: string;
    holdB1: string;
    holdB2: string;
    scoreA: number;
    scoreB: number;
  }>;
}

function normalizeSets(sets: ResultChangeSet[]) {
  return sets.map((set) => ({
    id: Number(set.id),
    scoreA: Number(set.scoreA),
    scoreB: Number(set.scoreB),
  }));
}

async function insertAdminMessage(supabase: any, row: Record<string, unknown>) {
  const primaryRes = await (supabase.from("admin_messages") as any).insert([
    { ...row, læst: false },
  ]);

  if (!primaryRes?.error) return primaryRes;

  return (supabase.from("admin_messages") as any).insert([
    { ...row, read: false },
  ]);
}

async function fetchAdminMessage(supabase: any, messageId: number) {
  const primaryRes = await supabase
    .from("admin_messages")
    .select("id,kampid,besked,læst")
    .eq("id", messageId)
    .maybeSingle();

  if (!primaryRes?.error) {
    return {
      data: primaryRes.data
        ? {
            id: primaryRes.data.id,
            kampid: primaryRes.data.kampid,
            besked: primaryRes.data.besked,
            handled: primaryRes.data.læst,
          }
        : null,
      error: null,
    };
  }

  const fallbackRes = await supabase
    .from("admin_messages")
    .select("id,kampid,besked,read")
    .eq("id", messageId)
    .maybeSingle();

  if (fallbackRes?.error) {
    return { data: null, error: fallbackRes.error };
  }

  return {
    data: fallbackRes.data
      ? {
          id: fallbackRes.data.id,
          kampid: fallbackRes.data.kampid,
          besked: fallbackRes.data.besked,
          handled: fallbackRes.data.read,
        }
      : null,
    error: null,
  };
}

async function markAdminMessageHandled(
  supabase: any,
  messageId: number,
  besked?: string
) {
  const values = besked === undefined ? { læst: true } : { læst: true, besked };
  const primaryRes = await (supabase.from("admin_messages") as any)
    .update(values)
    .eq("id", messageId);

  if (!primaryRes?.error) return primaryRes;

  const fallbackValues = besked === undefined ? { read: true } : { read: true, besked };
  return (supabase.from("admin_messages") as any)
    .update(fallbackValues)
    .eq("id", messageId);
}

function isFinishedSet(scoreA: number, scoreB: number) {
  const max = Math.max(scoreA, scoreB);
  const min = Math.min(scoreA, scoreB);
  return (max === 6 && min <= 4) || (max === 7 && (min === 5 || min === 6));
}

export async function POST(req: Request) {
  try {
    const supabase = supabaseRoute();
    const viewer = await getViewer(supabase);

    if (!viewer?.user || !viewer.visningsnavn) {
      return NextResponse.json({ error: "Ikke logget ind." }, { status: 401 });
    }

    const body = await req.json();
    const kampid = Number(body?.kampid ?? 0);
    const comment = (body?.comment ?? "").toString().trim();
    const sets = normalizeSets(Array.isArray(body?.sets) ? body.sets : []);

    if (!kampid || sets.length === 0) {
      return NextResponse.json({ error: "Ugyldig kamp eller sæt." }, { status: 400 });
    }

    if (sets.some((set) => !Number.isFinite(set.id) || set.id <= 0)) {
      return NextResponse.json({ error: "Ugyldige sæt." }, { status: 400 });
    }

    if (
      sets.some(
        (set) =>
          !Number.isFinite(set.scoreA) ||
          !Number.isFinite(set.scoreB) ||
          set.scoreA < 0 ||
          set.scoreB < 0
      )
    ) {
      return NextResponse.json({ error: "Alle sæt skal have gyldige cifre." }, { status: 400 });
    }

    const matchRows = await fetchMatchRows(supabase, kampid);
    if (matchRows.length === 0) {
      return NextResponse.json({ error: "Kampen blev ikke fundet." }, { status: 404 });
    }

    const isParticipant = matchRows.some((row) =>
      [row.holdA1, row.holdA2, row.holdB1, row.holdB2].includes(viewer.visningsnavn)
    );
    if (!isParticipant) {
      return NextResponse.json({ error: "Du kan kun foreslå ændringer i egne kampe." }, { status: 403 });
    }

    const rowIds = new Set(matchRows.map((row) => Number(row.id)));
    if (sets.some((set) => !rowIds.has(set.id)) || sets.length !== matchRows.length) {
      return NextResponse.json({ error: "Alle kampens sæt skal med i forslaget." }, { status: 400 });
    }

    const payload: ResultChangeRequestPayload = {
      type: "result_change_request",
      version: 1,
      requestedBy: viewer.visningsnavn,
      requestedAt: new Date().toISOString(),
      comment,
      sets,
    };

    const insertRes = await insertAdminMessage(supabase, {
      kampid,
      besked: encodeResultChangeRequest(payload),
      tidspunkt: new Date().toISOString(),
      visningsnavn: viewer.visningsnavn,
    });

    if (insertRes?.error) {
      return NextResponse.json({ error: insertRes.error.message }, { status: 500 });
    }

    clearRecentResultCardsCache();

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Ukendt fejl" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const supabase = supabaseRoute();
    const adminDb = supabaseServiceRole;
    const viewer = await getViewer(supabase);

    if (!viewer?.user || viewer.rolle !== "admin") {
      return NextResponse.json({ error: "Kun admin har adgang." }, { status: 403 });
    }

    const body = await req.json();
    const messageId = Number(body?.messageId ?? 0);
    const action = (body?.action ?? "approve").toString();

    if (!messageId) {
      return NextResponse.json({ error: "Manglende besked-id." }, { status: 400 });
    }

    const messageRes = await fetchAdminMessage(supabase, messageId);

    if (messageRes.error) {
      return NextResponse.json({ error: messageRes.error.message }, { status: 500 });
    }

    const message = messageRes.data as
      | { id: number; kampid: number | null; besked: string; handled?: boolean | null }
      | null;

    if (!message) {
      return NextResponse.json({ error: "Beskeden blev ikke fundet." }, { status: 404 });
    }

    const kampid = Number(message.kampid ?? 0);
    const parsed = parseResultChangeRequest(message.besked);

    if (action === "approve" && parsed && kampid) {
      const matchRows = await fetchMatchRows(adminDb, kampid);
      const rowIds = new Set(matchRows.map((row) => Number(row.id)));

      for (const set of parsed.sets) {
        if (!rowIds.has(Number(set.id))) {
          return NextResponse.json({ error: "Et foreslået sæt findes ikke længere." }, { status: 400 });
        }
      }

      for (const set of parsed.sets) {
        const updateRes = await (adminDb.from("newresults") as any)
          .update({
            scoreA: Number(set.scoreA),
            scoreB: Number(set.scoreB),
            finish: isFinishedSet(Number(set.scoreA), Number(set.scoreB)),
          })
          .eq("id", set.id)
          .eq("kampid", kampid);

        if (updateRes?.error) {
          return NextResponse.json({ error: updateRes.error.message }, { status: 500 });
        }
      }
    }

    let nextMessageText: string | undefined;
    if (parsed && (action === "approve" || action === "reject")) {
      const nextPayload: ResultChangeRequestPayload = {
        ...parsed,
        reviewStatus: action === "approve" ? "approved" : "rejected",
        reviewedAt: new Date().toISOString(),
        reviewedBy: viewer.visningsnavn || viewer.user.email || "Admin",
      };
      nextMessageText = encodeResultChangeRequest(nextPayload);
    } else if (parsed && getResultChangeReviewStatus(parsed) !== "pending") {
      nextMessageText = message.besked;
    }

    const clearRes = await markAdminMessageHandled(adminDb, messageId, nextMessageText);

    if (clearRes?.error) {
      return NextResponse.json({ error: clearRes.error.message }, { status: 500 });
    }

    clearRecentResultCardsCache();

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? "Ukendt fejl" }, { status: 500 });
  }
}
