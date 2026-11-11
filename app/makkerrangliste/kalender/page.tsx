import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PageHeader, PageShell } from "@/app/components/ui";
import { PARTNER_DIVISIONS, WINTER_2027 } from "@/lib/partnerTournaments";
import { matchCourtLabel, matchDate } from "@/lib/playerMatches";
import type { LeagueCalendarMatch } from "@/lib/partnerLeague";
import { supabaseServiceRole } from "@/lib/supabaseServiceRole";

export const metadata: Metadata = { title: "Makkerligaens kampkalender" };

export default async function LeagueCalendarPage() {
  await connection();
  let days: Map<string, LeagueCalendarMatch[]> | undefined;
  try {
    const { data, error } = await (supabaseServiceRole as SupabaseClient).rpc("confirmed_partner_league_matches", {
      p_tournament: WINTER_2027.id,
    });
    if (error && error.code !== "PGRST202") throw error;
    days = new Map();
    for (const match of (data ?? []) as LeagueCalendarMatch[]) {
      const matches = days.get(match.date) ?? [];
      matches.push(match);
      days.set(match.date, matches);
    }
  } catch (error) {
    console.error("Makkerliga kalender", error);
  }

  return (
    <PageShell>
      <div className="mx-auto w-full max-w-4xl space-y-5">
        <Link href="/makkerrangliste" className="font-semibold text-[var(--brand-strong)]">← Makkerliga</Link>
        <PageHeader title="Bekræftede Makkerliga-kampe" description={WINTER_2027.name} />
        {days ? (
          days.size ? [...days].map(([date, matches]) => <section key={date} className="padel-surface space-y-3">
            <h2 className="text-xl font-bold"><time dateTime={date}>{matchDate(date)}</time></h2>
            <ul className="divide-y divide-[var(--border)]">
              {matches.map((match, index) => <li key={index} className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-3">
                <p><strong>Kl. {match.start_time.slice(0, 5)}</strong> · Padelhuset {match.location} · {matchCourtLabel(match.court)}</p>
                <p className="text-sm text-[var(--muted)]">{PARTNER_DIVISIONS[match.division].name} · Pulje {match.pool}</p>
              </li>)}
            </ul>
          </section>) : <p className="padel-surface">Der er ingen bekræftede kampe endnu.</p>
        ) : <p role="alert" className="padel-surface">Kampkalenderen kunne ikke hentes lige nu.</p>}
      </div>
    </PageShell>
  );
}
