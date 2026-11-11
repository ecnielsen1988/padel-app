import type { Metadata } from "next";
import Link from "next/link";
import { PARTNER_DIVISIONS, tournamentDateLabel, WINTER_2027 } from "@/lib/partnerTournaments";
import { PageHeader, PageShell } from "../../components/ui";

export const metadata: Metadata = { title: "Reglement · Makkerliga 2027 Vinter" };

const section = "padel-surface space-y-3";
const list = "list-disc space-y-2 pl-5";

export default function PartnerTournamentRulesPage() {
  return (
    <PageShell>
      <div className="mx-auto w-full max-w-4xl space-y-5">
        <PageHeader title="Reglement" description={WINTER_2027.name}
          action={<Link href="/makkerrangliste" className="padel-secondary-button inline-flex">Tilbage til Makkerliga</Link>} />

        <section className={section}>
          <h2 className="text-xl font-bold">Tilmelding og puljer</h2>
          <p>I tilmelder jer som par i appen. Det koster <strong>200 kr. pr. par</strong>, og tilmeldingen er bekræftet, når I har betalt med MobilePay.</p>
          <p>Hver spiller kan deltage på <strong>ét hold pr. række</strong> i sæsonen. I kan derfor godt stille op i både Mix og Åben.</p>
          <ul className={list}>
            {Object.entries(PARTNER_DIVISIONS).map(([id, division]) => (
              <li key={id}><strong>{division.name}.</strong> {division.description}</li>
            ))}
          </ul>
          <p>Efter tilmeldingsfristen fordeler vi parrene i puljer ud fra deres samlede ranglistepoint. Vi sigter efter seks par pr. pulje, så I møder par på nogenlunde samme niveau.</p>
        </section>

        <section className={section}>
          <h2 className="text-xl font-bold">Kampformat og point</h2>
          <p>Alle kampe spilles <strong>bedst af tre fulde sæt</strong>. Står det 1–1 i sæt, spiller I et fuldt tredje sæt.</p>
          <p>Begge par får <strong>1 point</strong> for at gennemføre kampen. Vinderne får <strong>2 ekstra point</strong>, og taberne får <strong>1 ekstra point</strong>, hvis de vinder et sæt.</p>
          <table className="w-full text-left">
            <thead className="border-b border-[var(--border)]">
              <tr><th scope="col" className="py-2 pr-3">Jeres resultat</th><th scope="col" className="py-2 text-right">Point i puljen</th></tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              <tr><td className="py-2 pr-3">Sejr 2–0 eller 2–1</td><td className="py-2 text-right font-bold">3</td></tr>
              <tr><td className="py-2 pr-3">Nederlag 1–2</td><td className="py-2 text-right font-bold">2</td></tr>
              <tr><td className="py-2 pr-3">Nederlag 0–2</td><td className="py-2 text-right font-bold">1</td></tr>
            </tbody>
          </table>
          <p>Stillingen afgøres af antallet af puljepoint. Ved pointlighed afgøres placeringen i denne rækkefølge.</p>
          <ol className="list-decimal space-y-2 pl-5">
            <li><strong>Sætforskel</strong> – vundne sæt minus tabte sæt.</li>
            <li><strong>Partiforskel</strong> – vundne partier minus tabte partier.</li>
            <li><strong>Indbyrdes opgør.</strong></li>
          </ol>
        </section>

        <section className={section}>
          <h2 className="text-xl font-bold">Booking, baner og bolde</h2>
          <p>Begge par har ansvar for at finde en tid, få banen booket og få kampen spillet. Aftal indbyrdes, hvem der booker.</p>
          <p>I vælger sammen, om kampen spilles i <strong>Padelhuset Helsinge</strong> eller <strong>Padelhuset Gilleleje</strong>. Udgifter til bane og bolde deles ligeligt mellem parrene. <strong>Der spilles med nye bolde i alle kampe.</strong></p>
        </section>

        <section className={section}>
          <h2 className="text-xl font-bold">Skade, afbud og skift af makker</h2>
          <p>Ved skade eller andet afbud kan I skifte en spiller ud. Den nye makker skal opfylde følgende krav.</p>
          <ul className={list}>
            <li>Have <strong>færre ranglistepoint</strong> end den spiller, der skiftes ud.</li>
            <li>Stå uden et hold i Makkerligaen.</li>
            <li>Opfylde kravene til den række, parret er tilmeldt.</li>
          </ul>
        </section>

        <section className={section}>
          <h2 className="text-xl font-bold">Fair play og uenigheder</h2>
          <p>Vi spiller for at vinde, og vi er først og fremmest med for at have det sjovt. Hvis I bliver uenige om noget, så prøv at finde en løsning sammen på kampdagen. Kan I ikke blive enige, tager I fat i de turneringsansvarlige. <strong>De har det sidste ord.</strong> 🙂</p>
        </section>

        <section className={section}>
          <h2 className="text-xl font-bold">Finaler og vigtige datoer</h2>
          <p><strong>Nr. 1 og 2 i hver pulje spiller finale</strong> ved sæsonafslutningen. Der er præmier i alle rækker.</p>
          <ul className={list}>
            <li><strong>{tournamentDateLabel(WINTER_2027.closes_on)}</strong> – sidste tilmeldingsdag.</li>
            <li><strong>{tournamentDateLabel(WINTER_2027.program_on)}</strong> – programmet offentliggøres.</li>
            <li><strong>{tournamentDateLabel(WINTER_2027.last_match_on)}</strong> – sidste dag for puljekampe.</li>
            <li><strong>{tournamentDateLabel(WINTER_2027.play_date)}</strong> – sæsonafslutning og finaler.</li>
          </ul>
        </section>
      </div>
    </PageShell>
  );
}
