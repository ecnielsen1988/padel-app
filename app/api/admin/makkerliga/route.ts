import { getCachedRangliste } from "@/lib/cachedRangliste";
import { messagingAdmin, messagingReply as reply } from "@/lib/messagingAuth";
import { WINTER_2027 } from "@/lib/partnerTournaments";
import { supabaseServiceRole } from "@/lib/supabaseServiceRole";
import type { SupabaseClient } from "@supabase/supabase-js";

const db = supabaseServiceRole as SupabaseClient;

function failure(error: { code?: string; message?: string }) {
  if (error.code === "PGRST202") return reply({ error: "Makkerligaens databaseopsætning mangler." }, 503);
  if (error.code === "42501") return reply({ error: "Kun admin har adgang." }, 403);
  if (error.code === "22023") return reply({ error: error.message }, 400);
  console.error("Makkerliga administration", error);
  return reply({ error: "Makkerligaen kunne ikke indlæses eller gemmes." }, 500);
}

export async function GET() {
  try {
    const access = await messagingAdmin();
    if (access.response) return access.response;
    const { data, error } = await db.rpc("partner_league_roster", {
      p_actor: access.user!.id, p_tournament: WINTER_2027.id,
    });
    return error ? failure(error) : reply(data);
  } catch (error) {
    return failure(error as Error);
  }
}

export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) return reply({ error: "Ugyldig anmodning." }, 415);
  try {
    const access = await messagingAdmin();
    if (access.response) return access.response;
    const body = await request.json().catch(() => null);
    if (body?.action !== "publish") return reply({ error: "Ukendt handling." }, 400);

    const ranking = await getCachedRangliste();
    const points = Object.fromEntries(ranking.map((player) => [player.visningsnavn.trim(), player.elo]));
    const { error } = await db.rpc("publish_partner_league_pools", {
      p_actor: access.user!.id, p_tournament: WINTER_2027.id, p_elo: points,
    });
    return error ? failure(error) : reply({ ok: true });
  } catch (error) {
    return failure(error as Error);
  }
}
