import { paymentConfig, partnerRegistrationId, syncPartnerPayment, verifyMobilePayWebhook } from "@/lib/partnerPayments";
import { UUID_PATTERN } from "@/lib/partnerTournaments";
import { supabaseServiceRole } from "@/lib/supabaseServiceRole";

export async function POST(request: Request) {
  const config = paymentConfig();
  if (!config) return new Response(null, { status: 503 });

  const body = Buffer.from(await request.arrayBuffer());
  if (!verifyMobilePayWebhook(request, body, config)) return new Response(null, { status: 401 });
  const event = await new Response(body).json().catch(() => null);
  const id = partnerRegistrationId(event?.reference);
  if (!UUID_PATTERN.test(id) || String(event?.msn) !== config.msn || event?.success !== true) {
    return new Response(null, { status: 204 });
  }

  try {
    const { data, error } = await supabaseServiceRole.from("partner_registrations").select("id")
      .eq("id", id).eq("merchant", config.merchant).eq("status", "pending").maybeSingle();
    if (error) throw new Error("Kunne ikke hente tilmeldingen.");
    if (data) {
      const result = await syncPartnerPayment(config, id);
      if (result.status === "pending") return new Response(null, { status: 503 });
    }
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("Partner payment webhook", error);
    return new Response(null, { status: 503 });
  }
}
