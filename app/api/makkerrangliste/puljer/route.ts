import { messagingAuth, messagingReply as reply } from "@/lib/messagingAuth";
import { WINTER_2027 } from "@/lib/partnerTournaments";
import { supabaseServiceRole } from "@/lib/supabaseServiceRole";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function GET() {
  try {
    const access = await messagingAuth();
    if (access.response) return access.response;
    const { data, error } = await (supabaseServiceRole as SupabaseClient).rpc("partner_league_pools_for", {
      p_actor: access.user.id, p_tournament: WINTER_2027.id,
    });
    if (error?.code === "PGRST202") return reply({ pools: [] });
    if (error) throw error;
    return reply({ pools: data });
  } catch (error) {
    console.error("Makkerliga puljer", error);
    return reply({ error: "Puljerne kunne ikke hentes." }, 500);
  }
}
