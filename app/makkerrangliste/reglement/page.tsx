import type { Metadata } from "next";
import Link from "next/link";
import { PARTNER_DIVISIONS, tournamentDateLabel, WINTER_2027 } from "@/lib/partnerTournaments";
import { PageHeader, PageShell } from "../../components/ui";

export const metadata: Metadata = { title: "Reglement · Makkerliga 2027 Vinter" };

export default function PartnerTournamentRulesPage() {
  return (
    <PageShell>
      <div className="mx-auto w-full max-w-4xl space-y-5">
        <PageHeader title="Reglement" description={WINTER_2027.name}
          action={<Link href="/makkerrangliste" className="padel-secondary-button inline-flex">Tilbage til Makkerliga</Link>} />
        <section className="padel-surface space-y-3">
          <h2 className="text-xl font-bold">Tilmelding</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>Begge spillere skal have en profil i appen. Hver spiller kan kun deltage på ét hold i sæsonen.</li>
            <li>Det koster 200 kr. pr. par. Tilmeldingen er bekræftet, når parret har betalt med MobilePay.</li>
            <li>Tilmeldingsfristen er {tournamentDateLabel(WINTER_2027.closes_on)} ved dagens udgang.</li>
          </ul>
        </section>
        <section className="padel-surface space-y-3">
          <h2 className="text-xl font-bold">Rækker</h2>
          <ul className="list-disc space-y-2 pl-5">
            {Object.entries(PARTNER_DIVISIONS).map(([id, division]) => (
              <li key={id}><strong>{division.name}.</strong> {division.description}</li>
            ))}
          </ul>
        </section>
        <section className="padel-surface space-y-3">
          <h2 className="text-xl font-bold">Puljer og finaler</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>Ranglisten bruges til at sammensætte jævnbyrdige puljer med så vidt muligt seks par i hver.</li>
            <li>Programmet offentliggøres {tournamentDateLabel(WINTER_2027.program_on)}.</li>
            <li>Hver pulje har sin egen finale. Der er præmier i alle rækker ved sæsonafslutningen {tournamentDateLabel(WINTER_2027.play_date)}.</li>
          </ul>
        </section>
      </div>
    </PageShell>
  );
}
