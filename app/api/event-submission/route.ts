import { revalidateTag } from "next/cache";
import { isRoyalEvent, parseEventRulesText } from "@/lib/eventConfig";
import { getEventKampidRange, type EventSubmissionSet } from "@/lib/eventSubmission";
import { messagingAdmin, messagingReply } from "@/lib/messagingAuth";
import { finishedEventSet } from "@/lib/royal";
import { supabaseServiceRole } from "@/lib/supabaseServiceRole";

export async function POST(request: Request) {
  try {
    const access = await messagingAdmin();
    if (access.response) return access.response;

    const body = await request.json().catch(() => null);
    const eventId = typeof body?.eventId === "string" ? body.eventId.trim() : "";
    const sets: unknown = body?.sets;
    if (!eventId || (sets !== null && (!Array.isArray(sets) || sets.length === 0))) {
      return messagingReply({ error: "Vælg et event med sæt at indberette." }, 400);
    }

    const { data: event, error: eventError } = await supabaseServiceRole
      .from("events")
      .select("id, date, rules_text")
      .eq("id", eventId)
      .maybeSingle<{ id: string | number; date: string | null; rules_text: string | null }>();
    if (eventError) throw eventError;
    if (!event) return messagingReply({ error: "Eventet blev ikke fundet." }, 404);
    const range = getEventKampidRange(event);
    if (!range || !Number.isSafeInteger(range.from) || !Number.isSafeInteger(range.to) || range.from > range.to) {
      return messagingReply({ error: "Eventet mangler en gyldig dato eller et kampinterval." }, 400);
    }

    const rows = [];
    const royal = isRoyalEvent(event.rules_text);
    for (const set of (sets ?? []) as EventSubmissionSet[]) {
      const { matchIndex, scoreA, scoreB, holdA1, holdA2, holdB1, holdB2 } = set ?? {};
      const matchTiebreak = royal && set?.matchTiebreak === true;
      const names = [holdA1, holdA2, holdB1, holdB2];
      if (
        !Number.isSafeInteger(matchIndex) || matchIndex < 0 ||
        ![scoreA, scoreB].every((score) =>
          Number.isSafeInteger(score) && score >= 0 && score <= (matchTiebreak ? 2_147_483_647 : 7)
        ) ||
        (scoreA === 0 && scoreB === 0) ||
        !names.every((name) => typeof name === "string" && name.trim()) ||
        new Set(names.map((name) => name.trim())).size !== 4
      ) {
        return messagingReply({ error: "Hvert sæt skal have fire forskellige spillere og en gyldig score." }, 400);
      }
      rows.push({
        match_index: matchIndex,
        holdA1: holdA1.trim(), holdA2: holdA2.trim(),
        holdB1: holdB1.trim(), holdB2: holdB2.trim(),
        scoreA, scoreB,
        finish: finishedEventSet(scoreA, scoreB, matchTiebreak),
        tiebreak: matchTiebreak ? "matchtiebreak" : "false",
      });
    }

    const { visibleRulesText, meta } = parseEventRulesText(event.rules_text);
    const { data, error } = await (supabaseServiceRole as any).rpc("save_event_submission", {
      p_actor: access.user!.id,
      p_event_id: eventId,
      p_rules_text: event.rules_text,
      p_date: event.date,
      p_visible_rules: visibleRulesText,
      p_meta: meta,
      p_from: range.from,
      p_to: range.to,
      p_rows: sets === null ? null : rows,
      p_activate_players: body.activatePlayers === true,
    });
    if (error?.code === "40001") return messagingReply({ error: error.message }, 409);
    if (error?.code === "42501") return messagingReply({ error: error.message }, 403);
    if (error) throw error;
    revalidateTag("rangliste");
    return messagingReply(data);
  } catch (error) {
    console.error("Kunne ikke gemme event-indberetningen", error);
    return messagingReply({ error: "Kunne ikke gemme event-indberetningen. Prøv igen." }, 500);
  }
}
