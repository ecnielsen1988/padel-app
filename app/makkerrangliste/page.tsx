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
          description="Find din makker, og spil jer til den store sæsonfinale. Der er præmier i alle rækker!"
          action={<div className="rounded-2xl border border-[var(--border)] px-5 py-3">
            <p className="text-2xl font-bold">200 kr.</p>
            <p className="text-sm text-[var(--muted)]">pr. par med MobilePay</p>
          </div>}
        />
        <section className="padel-surface space-y-4">
          <h2 className="text-xl font-bold">Tætte kampe hele vinteren</h2>
          <p>
            I møder par på jeres eget niveau, så der er noget at spille om fra første bold.
            Vi bruger ranglisten til at sætte puljerne med så vidt muligt seks par i hver.
            Hver pulje får sin egen sæsonfinale.
          </p>
          <p>Vælg jeres række, og meld jer til som par. Hver spiller kan deltage én gang i sæsonen.</p>
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
