import type { SupabaseClient } from "@supabase/supabase-js";
import { messagingAuth, messagingReply } from "@/lib/messagingAuth";
import { paymentConfig, syncPartnerPayment } from "@/lib/partnerPayments";
import { copenhagenDate, isWoman, PARTNER_DIVISIONS, UUID_PATTERN, WINTER_2027, type PartnerRegistration, type PartnerTournament, type TournamentSignupData } from "@/lib/partnerTournaments";
import { supabaseServiceRole } from "@/lib/supabaseServiceRole";

const db = supabaseServiceRole as SupabaseClient;
const entryColumns = "id, tournament_id, payer_id, partner_id, division, status";
const tournamentColumns = "id, name, play_date, closes_on";

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

async function tournamentEntries(tournamentIds: string[]) {
  const entries: PartnerRegistration[] = [];
  if (!tournamentIds.length) return entries;
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await db.from("partner_registrations").select(entryColumns)
      .in("tournament_id", tournamentIds).in("status", ["pending", "paid"])
      .order("id").range(offset, offset + pageSize - 1)
      .overrideTypes<PartnerRegistration[], { merge: false }>();
    if (error) throw error;
    entries.push(...data);
    if (data.length < pageSize) return entries;
  }
}

function registrationOverview(entries: PartnerRegistration[], showWomen: boolean) {
  const occupiedPlayers: TournamentSignupData["occupiedPlayers"] = {};
  const confirmedPairs: TournamentSignupData["confirmedPairs"] = [];
  for (const { tournament_id, payer_id, partner_id, division, status } of entries) {
    (occupiedPlayers[tournament_id] ??= []).push(payer_id, partner_id);
    if (status === "paid" && (showWomen || division !== "women")) {
      confirmedPairs.push({ tournament_id, payer_id, partner_id, division });
    }
  }
  return { occupiedPlayers, confirmedPairs };
}

function adminPreview(userId: string, gender: string | null, today: string) {
  const { id, name, closes_on, play_date } = WINTER_2027;
  const examplePair: PartnerRegistration = {
    id: "example-pair", tournament_id: id, payer_id: "preview-3", partner_id: "preview-4",
    division: "open", status: "paid",
  };
  return {
    userId,
    admin: true,
    preview: true,
    paymentAvailable: false,
    testPayments: false,
    tournaments: [{ id, name, closes_on, play_date, open: closes_on >= today }],
    registrations: [],
    ...registrationOverview([examplePair], isWoman(gender)),
    players: [
      { id: userId, visningsnavn: "Eksempelspiller", koen: gender },
      { id: "preview-1", visningsnavn: "Eksempelmakker 1", koen: "kvinde" },
      { id: "preview-2", visningsnavn: "Eksempelmakker 2", koen: "mand" },
      { id: "preview-3", visningsnavn: "Eksempelspiller 3", koen: "mand" },
      { id: "preview-4", visningsnavn: "Eksempelspiller 4", koen: "kvinde" },
    ],
  } satisfies TournamentSignupData;
}

export async function GET() {
  const access = await messagingAuth();
  if (access.response) return access.response;
  const userId = access.user.id;

  try {
    const [{ data: profile, error: profileError }, { data: entries, error: entryError }] =
      await Promise.all([
        access.db.from("profiles").select("rolle, koen").eq("id", userId).maybeSingle(),
        db.from("partner_registrations").select(entryColumns)
          .or(`payer_id.eq.${userId},partner_id.eq.${userId}`).neq("status", "cancelled")
          .overrideTypes<PartnerRegistration[], { merge: false }>(),
      ]);
    if (profileError) throw profileError;
    const admin = profile?.rolle === "admin";
    const today = copenhagenDate();
    if (entryError?.code === "42P01" || entryError?.code === "PGRST205") {
      return admin
        ? messagingReply(adminPreview(userId, profile?.koen ?? null, today))
        : messagingReply({ error: "Tilmeldingen åbner senere." }, 403);
    }
    if (entryError) throw entryError;
    const tournamentIds = entries.map((entry) => entry.tournament_id);
    const query = db.from("partner_tournaments").select(tournamentColumns).order("play_date");
    if (!admin && tournamentIds.length) {
      query.or(`closes_on.gte.${today},id.in.(${tournamentIds.join(",")})`);
    } else if (!admin) {
      query.gte("closes_on", today);
    }
    const { data: tournaments, error } = await query.overrideTypes<Omit<PartnerTournament, "open">[], { merge: false }>();
    if (error) throw error;
    const [players, activeEntries] = await Promise.all([
      playerDirectory(),
      tournamentEntries(tournaments.map((tournament) => tournament.id)),
    ]);

    const config = paymentConfig();
    return messagingReply({
      userId, admin, paymentAvailable: Boolean(config), testPayments: config?.mode === "test",
      players, registrations: entries,
      ...registrationOverview(activeEntries, isWoman(profile?.koen)),
      tournaments: tournaments.map((tournament) => ({ ...tournament, open: tournament.closes_on >= today })),
    });
  } catch (error) {
    console.error("Partner tournament list", error);
    return messagingReply({ error: "Tilmeldingen kunne ikke indlæses." }, 503);
  }
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString().startsWith(value);
}

export async function POST(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
    return messagingReply({ error: "Anmodningen skal sendes som JSON." }, 415);
  }
  const access = await messagingAuth();
  if (access.response) return access.response;
  const userId = access.user.id;
  const input = await request.json().catch(() => null);

  if (input?.action === "createTournament") {
    const { data: profile, error: profileError } = await access.db.from("profiles").select("rolle")
      .eq("id", userId).maybeSingle();
    if (profileError || profile?.rolle !== "admin") return messagingReply({ error: "Kun admin har adgang." }, 403);
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!name || name.length > 100 || !validDate(input.play_date) || !validDate(input.closes_on) ||
      input.closes_on < copenhagenDate() || input.closes_on > input.play_date) {
      return messagingReply({ error: "Angiv navn og en frist fra i dag til og med spilledatoen." }, 400);
    }
    const { error } = await db.from("partner_tournaments").insert({
      name, play_date: input.play_date, closes_on: input.closes_on,
    });
    if (error) {
      console.error("Create partner tournament", error);
      return messagingReply({ error: "Turneringen kunne ikke oprettes." }, 503);
    }
    return messagingReply({ ok: true }, 201);
  }

  if (!["register", "resume", "status"].includes(input?.action)) {
    return messagingReply({ error: "Ukendt handling." }, 400);
  }
  const config = paymentConfig();
  if (!config) return unavailable();

  try {
    if (input.action === "register") {
      const { tournamentId, partnerId, division } = input;
      if (typeof tournamentId !== "string" || typeof partnerId !== "string" ||
        !UUID_PATTERN.test(tournamentId) || !UUID_PATTERN.test(partnerId) ||
        typeof division !== "string" || !Object.hasOwn(PARTNER_DIVISIONS, division)) {
        return messagingReply({ error: "Vælg turnering, række og makker." }, 400);
      }
      const { data: id, error } = await db.rpc("reserve_partner_registration", {
        p_tournament: tournamentId, p_payer: userId, p_partner: partnerId,
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
