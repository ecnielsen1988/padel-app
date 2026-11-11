import { connection } from "next/server";
import { WINTER_2027 } from "@/lib/partnerTournaments";
import { supabaseServiceRole } from "@/lib/supabaseServiceRole";

export async function RegisteredTeamCount() {
  await connection();

  let count: number | null = null;
  try {
    const result = await supabaseServiceRole.from("partner_registrations")
      .select("id", { count: "exact" })
      .eq("tournament_id", WINTER_2027.id)
      .eq("status", "paid")
      .limit(1)
      .abortSignal(AbortSignal.timeout(5000));

    if (!result.error) {
      count = result.count;
    } else if (["42P01", "PGRST205"].includes(result.error.code)) {
      count = 0;
    } else {
      console.error("Makkerliga team count", result.error);
    }
  } catch (error) {
    console.error("Makkerliga team count", error);
  }

  if (count === null) {
    return <p className="text-sm text-[var(--muted)]">Antallet kan ikke hentes lige nu.</p>;
  }

  return <p className="text-4xl font-bold tabular-nums text-[var(--brand-strong)]">{count.toLocaleString("da-DK")}</p>;
}
