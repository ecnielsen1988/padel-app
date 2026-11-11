import type { Metadata } from "next";
import Link from "next/link";
import { tournamentDateLabel, WINTER_2027 } from "@/lib/partnerTournaments";
import { PageHeader, PageShell } from "../components/ui";
import { TournamentSignup } from "./signup";

export const metadata: Metadata = { title: "Makkerliga" };

export default function PartnerTournamentPage() {
  return (
    <PageShell>
      <div className="mx-auto w-full max-w-4xl space-y-5">
        <Link href="/startside" className="inline-flex font-semibold text-[var(--brand-strong)]">
          ← Til forsiden
        </Link>
        <PageHeader
          eyebrow="Turneringstilmelding"
          title={WINTER_2027.name}
          description="Find en makker, og få en vintersæson med jævnbyrdige kampe og en finale at spille frem mod."
          action={<div className="rounded-2xl border border-[var(--border)] px-5 py-3">
            <p className="text-2xl font-bold">200 kr.</p>
            <p className="text-sm text-[var(--muted)]">pr. par med MobilePay</p>
          </div>}
        />
        <section className="padel-surface space-y-4">
          <h2 className="text-xl font-bold">Spil med i vinterens Makkerliga</h2>
          <p>
            Vi bruger ranglisten til at samle par på nogenlunde samme niveau. Vi sigter efter
            seks par i hver pulje og tilpasser størrelsen efter antallet af tilmeldinger.
            Alle puljer får deres egen sæsonfinale.
          </p>
          <p>Vælg din makker og den række, I vil spille i. Hver spiller kan deltage én gang i sæsonen.</p>
          <dl className="grid gap-3 sm:grid-cols-3">
            {[
              ["Tilmeldingsfrist", WINTER_2027.closes_on],
              ["Programmet offentliggøres", WINTER_2027.program_on],
              ["Sæsonafslutning", WINTER_2027.play_date],
            ].map(([label, date]) => (
              <div key={label} className="rounded-xl border border-[var(--border)] p-3">
                <dt className="text-sm text-[var(--muted)]">{label}</dt>
                <dd className="font-semibold"><time dateTime={date}>{tournamentDateLabel(date)}</time></dd>
              </div>
            ))}
          </dl>
        </section>
        <TournamentSignup />
      </div>
    </PageShell>
  );
}
