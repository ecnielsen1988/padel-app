import type { SupabaseClient } from "@supabase/supabase-js";
import { messagingAuth, messagingReply } from "@/lib/messagingAuth";
import { paymentConfig, syncPartnerPayment } from "@/lib/partnerPayments";
import { copenhagenDate, PARTNER_DIVISIONS, UUID_PATTERN, WINTER_2027, type PartnerRegistration, type TournamentSignupData } from "@/lib/partnerTournaments";
import { supabaseServiceRole } from "@/lib/supabaseServiceRole";

const db = supabaseServiceRole as SupabaseClient;
const entryColumns = "id, tournament_id, payer_id, partner_id, division, status";

function unavailable() {
  return messagingReply({ error: "MobilePay er ikke tilgængelig lige nu." }, 503);
}

async function playerDirectory() {
  const players: TournamentSignupData["players"] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await db.from("profiles").select("id, visningsnavn, koen")
      .order("visningsnavn").order("id").range(offset, offset + pageSize - 1)
      .overrideTypes<TournamentSignupData["players"], { merge: false }>();
    if (error) throw error;
    players.push(...data.filter((player) => player.visningsnavn?.trim()));
    if (data.length < pageSize) return players;
  }
}

async function tournamentEntries() {
  const entries: PartnerRegistration[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await db.from("partner_registrations").select(entryColumns)
      .eq("tournament_id", WINTER_2027.id).in("status", ["pending", "paid"])
      .order("id").range(offset, offset + pageSize - 1)
      .overrideTypes<PartnerRegistration[], { merge: false }>();
    if (error) throw error;
    entries.push(...data);
    if (data.length < pageSize) return entries;
  }
}

export async function GET() {
  const access = await messagingAuth();
  if (access.response) return access.response;
  const userId = access.user.id;

  try {
    const [{ data: profile, error: profileError }, { data: tournament, error: tournamentError }] =
      await Promise.all([
        access.db.from("profiles").select("rolle").eq("id", userId).maybeSingle(),
        db.from("partner_tournaments").select("closes_on").eq("id", WINTER_2027.id)
          .maybeSingle().overrideTypes<{ closes_on: string }, { merge: false }>(),
      ]);
    if (profileError) throw profileError;
    if (tournamentError && !["42P01", "PGRST205"].includes(tournamentError.code)) throw tournamentError;

    if (!tournament) {
      if (profile?.rolle !== "admin") return messagingReply({ error: "Tilmeldingen åbner senere." }, 403);
      return messagingReply({
        userId, preview: true, open: WINTER_2027.closes_on >= copenhagenDate(),
        paymentAvailable: false, testPayments: false, registration: null, occupiedPlayers: [],
        players: await playerDirectory(),
      } satisfies TournamentSignupData);
    }

    const [players, entries] = await Promise.all([playerDirectory(), tournamentEntries()]);
    const config = paymentConfig();
    return messagingReply({
      userId, open: tournament.closes_on >= copenhagenDate(),
      paymentAvailable: Boolean(config), testPayments: config?.mode === "test",
      players,
      registration: entries.find((entry) => entry.payer_id === userId || entry.partner_id === userId) ?? null,
      occupiedPlayers: entries.flatMap((entry) => [entry.payer_id, entry.partner_id]),
    } satisfies TournamentSignupData);
  } catch (error) {
    console.error("Partner tournament signup", error);
    return messagingReply({ error: "Tilmeldingen kunne ikke indlæses." }, 503);
  }
}

export async function POST(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
    return messagingReply({ error: "Anmodningen skal sendes som JSON." }, 415);
  }
  const access = await messagingAuth();
  if (access.response) return access.response;
  const userId = access.user.id;
  const input = await request.json().catch(() => null);

  if (!["register", "resume", "status"].includes(input?.action)) {
    return messagingReply({ error: "Ukendt handling." }, 400);
  }
  const config = paymentConfig();
  if (!config) return unavailable();

  try {
    if (input.action === "register") {
      const { partnerId, division } = input;
      if (typeof partnerId !== "string" || !UUID_PATTERN.test(partnerId) ||
        typeof division !== "string" || !Object.hasOwn(PARTNER_DIVISIONS, division)) {
        return messagingReply({ error: "Vælg række og makker." }, 400);
      }
      const { data: id, error } = await db.rpc("reserve_partner_registration", {
        p_tournament: WINTER_2027.id, p_payer: userId, p_partner: partnerId,
        p_division: division, p_merchant: config.merchant,
      });
      if (error?.code === "22023" || error?.code === "23505") {
        return messagingReply({ error: error.message }, error.code === "23505" ? 409 : 400);
      }
      if (error || !id) throw error || new Error("Tilmeldingen mangler en reference.");
      return messagingReply(await syncPartnerPayment(config, id, true), 201);
    }

    if (typeof input.id !== "string" || !UUID_PATTERN.test(input.id)) {
      return messagingReply({ error: "Ugyldig tilmelding." }, 400);
    }
    const { data: entry, error } = await db.from("partner_registrations")
      .select("id, tournament_id, status, payer_id, merchant").eq("id", input.id)
      .or(`payer_id.eq.${userId},partner_id.eq.${userId}`).maybeSingle()
      .overrideTypes<Pick<PartnerRegistration, "id" | "tournament_id" | "status" | "payer_id"> & { merchant: string }, { merge: false }>();
    if (error) throw error;
    if (!entry || (input.action === "resume" && entry.payer_id !== userId)) {
      return messagingReply({ error: "Tilmeldingen blev ikke fundet." }, 404);
    }
    const tournamentId = entry.tournament_id;
    if (entry.status !== "pending") return messagingReply({ status: entry.status, tournamentId });
    if (entry.merchant !== config.merchant) return unavailable();
    const result = await syncPartnerPayment(config, entry.id, input.action === "resume");
    return messagingReply({ ...result, tournamentId });
  } catch (error) {
    console.error("Partner tournament payment", error);
    return messagingReply({ error: "Betalingen kunne ikke opdateres. Prøv igen fra din tilmelding." }, 502);
  }
}
