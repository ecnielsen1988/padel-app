import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { tournamentDateLabel, WINTER_2027 } from "@/lib/partnerTournaments";
import { PageHeader, PageShell } from "../components/ui";
import { RegisteredTeamCount } from "./registered-team-count";
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
          title={WINTER_2027.name}
          action={<Link href="/makkerrangliste/reglement" className="padel-secondary-button inline-flex">Læs reglementet</Link>}
        />
        <section className="padel-surface space-y-4">
          <h2 className="text-xl font-bold">Derfor skal I med</h2>
          <ul className="list-disc space-y-2 pl-5 marker:text-[var(--brand-strong)]">
            <li><strong>Spil jer til den store sæsonfinale.</strong> Hver pulje har sin egen finale.</li>
            <li><strong>Spil om præmier.</strong> Der er præmier i alle rækker.</li>
            <li><strong>Få tætte kampe hele vinteren.</strong> Vi bruger ranglisten til at lave jævnbyrdige puljer med så vidt muligt seks par i hver.</li>
          </ul>
        </section>
        <section className="padel-surface space-y-5">
          <h2 className="text-xl font-bold">Tilmelding</h2>
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
          <TournamentSignup />
        </section>
        <section className="padel-surface space-y-2">
          <h2 className="text-xl font-bold">Tilmeldte hold</h2>
          <Suspense fallback={<p role="status" className="text-sm text-[var(--muted)]">Henter antal …</p>}>
            <RegisteredTeamCount />
          </Suspense>
        </section>
      </div>
    </PageShell>
  );
}
