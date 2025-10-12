'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';

// Lille hjælper til ankerlinks på §§
function ParaHeading({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  return (
    <h3
      id={id}
      className="group scroll-mt-20 anchor text-lg font-semibold tracking-tight text-gray-900 flex items-center gap-2"
    >
      <span className="inline-flex items-center justify-center rounded-md border border-green-300 bg-green-50 px-2 py-0.5 text-green-700">
        §
      </span>
      <span>{children}</span>
      <a
        href={`#${id}`}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-green-600 text-sm"
        aria-label="Kopiér link til paragraf"
      >
        #
      </a>
    </h3>
  );
}

export default function ReglementPage() {
  const updated = useMemo(() => {
    // Opdater gerne manuelt hvis du vil have en fast dato
    return new Intl.DateTimeFormat('da-DK', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(new Date());
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-6">
      {/* Header */}
      <div className="mb-6 rounded-2xl border border-green-200 bg-white/60 shadow-sm">
        <div className="relative overflow-hidden rounded-t-2xl">
          <div className="h-2 w-full bg-gradient-to-r from-green-600 via-emerald-500 to-green-600" />
        </div>
        <div className="p-5">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-gray-900">
              Reglement for <span className="text-green-700">TorsdagsBold &amp; Bajere</span>
            </h1>
            <span className="inline-flex items-center whitespace-nowrap rounded-full border border-green-300 bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
              Torsdagspadel
            </span>
          </div>
          <p className="mt-2 text-sm text-gray-500">
            Sidst opdateret: {updated}
          </p>

          {/* Hurtig navigation */}
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              ['Kapitel 1 – Formål og Rammer', '#kapitel-1'],
              ['Kapitel 2 – Tilmelding og Fremmøde', '#kapitel-2'],
              ['Kapitel 3 – Spillets Afvikling', '#kapitel-3'],
              ['Kapitel 4 – Sociale Regler og Økonomi', '#kapitel-4'],
              ['Kapitel 5 – Administration', '#kapitel-5'],
              ['Kapitel 6 – Ikrafttrædelse, ændringer og tolkning', '#kapitel-6'],
            ].map(([label, href]) => (
              <a
                key={href}
                href={href}
                className="rounded-xl border border-green-200 bg-white px-3 py-2 text-sm text-green-700 hover:bg-green-50 hover:border-green-300 transition"
              >
                {label}
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* Indhold */}
      <article
  className="
    prose prose-sm sm:prose-base max-w-none
    leading-7 sm:leading-8
    prose-p:my-5
    prose-li:my-2
    prose-ul:my-5 prose-ol:my-5
    prose-h2:mt-12 prose-h2:mb-4
    prose-h3:mt-8  prose-h3:mb-3
    prose-table:my-6
    prose-strong:text-gray-900
  "
>
        {/* Kapitel 1 */}
        <h2 id="kapitel-1" className="scroll-mt-24 text-xl font-bold text-gray-900">
          Kapitel 1 – Formål og Rammer
        </h2>

        <ParaHeading id="§1">§1. Navn og formål</ParaHeading>
        <p>
          Padel-netværket bærer navnet <strong>TorsdagsBold &amp; Bajere</strong>. Formålet er at
          samle mænd i deres bedste alder til social hygge, grin og masser af padelspil i en
          uformel, men organiseret ramme. Netværket fungerer også som et socialt og forretningsmæssigt
          fællesskab, hvor <strong>lokumsaftaler, handler og samarbejder</strong> gerne må opstå –
          altid med et smil og et håndtryk.
        </p>

        <ParaHeading id="§2">§2. Spillested og afvikling</ParaHeading>
        <p>
          Der spilles i <strong>Padelhuset Helsinge</strong> hver torsdag mellem kl. <strong>17.00
          – 22.00</strong>, samt på udvalgte afslutnings- og festdage fastsat af
          <strong> TorsdagsRådet</strong>.
        </p>

        <ParaHeading id="§3">§3. Medlemmer og gæstespillere</ParaHeading>
        <ul>
          <li>
            <strong>Medlemmer</strong> har adgang til alle arrangementer, deltager i præmier, og
            skal til- og framelde sig hver uge. Medlemmer inviteres ligeledes til
            <strong> Lunar-holdkampe</strong> og øvrige særlige arrangementer.
          </li>
          <li>
            <strong>Gæstespillere</strong> kan deltage, hvis der er ledige pladser. De har ingen
            faste forpligtelser og deltager ikke i præmier eller holdkampe.
          </li>
        </ul>

        {/* Kapitel 2 */}
        <h2 id="kapitel-2" className="scroll-mt-24 text-xl font-bold text-gray-900">
          Kapitel 2 – Tilmelding og Fremmøde
        </h2>

        <ParaHeading id="§4">§4. Tilmelding</ParaHeading>
        <p>
          Alle medlemmer skal til- eller framelde sig <strong>både på Matchi og i ranglisteappen</strong>{' '}
          senest <strong>mandag ved midnat</strong> før den kommende torsdag.
        </p>
        <p>
          Ved tilmelding skal der noteres i appen, <strong>hvornår man tidligst kan møde ind</strong>.
          Dette er ikke et spørgsmål om præference, men alene et udtryk for <strong>hvornår man
          tidligst kan spille</strong>. For at få plads til flest mulige kampe, forsøges flest mulige
          kampe startet <strong>kl. 17.00</strong>, og man opfordres derfor til at vælge dette
          tidspunkt, hvis det kan lade sig gøre. Markereres et senere starttidspunkt, kan man
          risikere at blive <strong>rykket ned i niveau</strong> – og i værste fald <strong>afmeldt
          arrangementet</strong>, dog med fuld refusion.
        </p>

        <ParaHeading id="§5">§5. Afbud og udeblivelse</ParaHeading>
        <p>
          Afbud skal meldes til en <strong>repræsentant fra TorsdagsRådet</strong> hurtigst muligt.
          Overtrædelser og bøder behandles jf. <a href="#§12" className="text-green-700 underline decoration-dotted">§12 (Bødekasse)</a>.
        </p>

        <ParaHeading id="§6">§6. Fremmøde</ParaHeading>
        <p>
          Kampprogrammet offentliggøres i appen aftenen før. Spillerne skal være <strong>kampklare
          på det angivne tidspunkt</strong>. Forsinkelse medfører bøde jf. §12.
        </p>

        {/* Kapitel 3 */}
        <h2 id="kapitel-3" className="scroll-mt-24 text-xl font-bold text-gray-900">
          Kapitel 3 – Spillets Afvikling
        </h2>

        <ParaHeading id="§7">§7. Kampformat</ParaHeading>
        <p>
          Hver kamp varer <strong>1 time og 30–40 minutter</strong>, afhængigt af antal tilmeldte.
          Der spilles ét sæt pr. kamp, hvorefter der byttes makker og modstandere efter
          kampprogrammet. Sættene spilles som almindelige sæt til <strong>først til 6 (tie-break
          til 7 ved 6–6)</strong>.
        </p>
        <p>
          Ved stillingen <strong>40–40</strong> spilles med <em>killer point</em>: der spilles med
          fordel én gang, og hvis stillingen derefter igen bliver lige, spilles en afgørende bold,
          hvor returnerende hold vælger side for serven.
        </p>

        <ParaHeading id="§8">§8. Pointsystem og Elo-beregning</ParaHeading>
        <p>
          Alle kampe skal registreres i ranglisteappen umiddelbart efter afslutning. Kampene sættes
          op efter <strong>niveau</strong>, således at de 4 bedste spiller på samme bane, de 4
          næstbedste på næste osv. Der kan foretages justeringer, hvis tilmeldingstidspunkter eller
          praktiske forhold kræver det.
        </p>
        <p>
          Ranglisten baseres på <strong>Elo-systemet</strong>, hvor point justeres efter forventet
          styrkeforhold mellem holdene.
        </p>
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900">
          <p className="font-semibold">Formel for Elo-gevinst:</p>
          <pre className="mt-2 overflow-x-auto text-[13px] leading-6">
            {`Elo-gevinst = K × (S − E)

K = kampfaktor
  • 32 ved Torsdagspadel
  • 16 ved almindelige kampe

S = (vundne partier / samlede partier)

E = 1 / (1 + 10^((Elo_modstandere − Elo_egne) / 400))`}
          </pre>
          <p className="mt-2">
            Systemet sikrer, at vindernes gevinst svarer til tabernes tab. Det er spillernes eget
            ansvar at <strong>indtaste og bekræfte resultaterne</strong> efter hvert sæt.
          </p>
        </div>

        <ParaHeading id="§9">§9. Fairplay og opførsel</ParaHeading>
        <p>
          Alle deltagere forpligter sig til at spille med <strong>god tone og respekt</strong> for
          både medspillere, modspillere og baner. Dårlig opførsel, udstyrskast eller anden
          uhensigtsmæssig adfærd takseres som <strong>adfærdsregulering</strong> jf. §12.
        </p>

        {/* Kapitel 4 */}
        <h2 id="kapitel-4" className="scroll-mt-24 text-xl font-bold text-gray-900">
          Kapitel 4 – Sociale Regler og Økonomi
        </h2>

        <ParaHeading id="§10">§10. Drikkevarer</ParaHeading>
        <p>
          Ved almindelige TorsdagsBold &amp; Bajere-arrangementer er <strong>én drikkevare</strong>{' '}
          inkluderet i deltagelsen. Yderligere forplejning <strong>noteres i regnskabet</strong> og
          afregnes via barkontoen.
        </p>

        <ParaHeading id="§11">§11. Præmier og hæder</ParaHeading>
        <p>Hver torsdag uddeles følgende præmier blandt de deltagende <strong>medlemmer</strong>:</p>
        <ul>
          <li>1. præmie: <strong>100 kr.</strong></li>
          <li>2. præmie: <strong>50 kr.</strong></li>
          <li>3. præmie: <strong>25 kr.</strong></li>
        </ul>
        <p>Hver måned:</p>
        <ul>
          <li>Top 3 i Elo-fremgang: <strong>250 kr.</strong>, <strong>100 kr.</strong>, <strong>50 kr.</strong></li>
          <li>Mest aktive spiller: <strong>200 kr.</strong></li>
        </ul>

        <ParaHeading id="§12">§12. Bødekasse</ParaHeading>
        <div className="overflow-hidden rounded-xl border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left font-semibold text-gray-700">Overtrædelse</th>
                <th className="px-4 py-2 text-left font-semibold text-gray-700">Bøde</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {[
                ['Udeblivelse', '500 kr.'],
                ['Afbud på dagen', '150 kr.'],
                ['Afbud efter mandag', '100 kr.'],
                ['Afbud efter tilmelding', '30 kr.'],
                ['Forsent fremmøde', '30 kr. + 5 kr./min'],
                ['Adfærdsregulering (fx slag mod bane, dårlig tone)', '50–150 kr.'],
                ['Glemte ting', '30 kr./ting'],
                ['Manglende resultat', '10 kr./mand'],
                ['Forsent betaling (saldo >100 kr.)', '10% pr. uge'],
              ].map(([label, value]) => (
                <tr key={label}>
                  <td className="px-4 py-2 text-gray-800">{label}</td>
                  <td className="px-4 py-2 text-gray-900 font-medium">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ParaHeading id="§13">§13. Økonomi og medlemskab</ParaHeading>
        <p>
          Der føres løbende <strong>regnskab i appen</strong>, hvor køb og forbrug noteres. Skyldes
          der mere end <strong>100 kr.</strong>, skal beløbet betales til den
          <strong> MobilePay-boks</strong> anført i appen. For sen betaling medfører bøde jf. §12.
        </p>
        <ul>
          <li>Indmeldelse: <strong>100 kr.</strong></li>
          <li>Genindmeldelse efter pause: <strong>50 kr.</strong></li>
        </ul>
        <p>
          Automatisk udmeldelse sker, hvis der ikke er deltaget i <strong>3 måneder</strong>, eller
          hvis medlemmet undlader at tilmelde/framelde sig <strong>5 torsdage i træk</strong>.
        </p>

        {/* Kapitel 5 */}
        <h2 id="kapitel-5" className="scroll-mt-24 text-xl font-bold text-gray-900">
          Kapitel 5 – Administration
        </h2>

        <ParaHeading id="§14">§14. TorsdagsRådet</ParaHeading>
        <p>
          Den øverste beslutningsmyndighed er <strong>TorsdagsRådet</strong>, bestående af
          <strong> Formanden</strong>, <strong>Kassereren</strong> og <strong>Bødesvinet</strong>.
          Rådet mødes hver fredag for at evaluere torsdagen og kan ændre, tilføje og fortolke alle
          regler i dette reglement, herunder bøder, præmier og kampformat.
        </p>
        <blockquote className="border-l-4 border-green-300 bg-green-50/60 p-3 text-sm text-green-800 rounded-r-md">
          God padel, kolde bajere og solid kammeratlig tone.
        </blockquote>

        {/* Kapitel 6 */}
        <h2 id="kapitel-6" className="scroll-mt-24 text-xl font-bold text-gray-900">
          Kapitel 6 – Ikrafttrædelse, ændringer og tolkning
        </h2>

        <ParaHeading id="§15">§15. Ikrafttrædelse</ParaHeading>
        <p>
          Reglementet trådte i kraft den dag, det blev offentliggjort på appen.
        </p>

        <ParaHeading id="§16">§16. Ændringer</ParaHeading>
        <p>
          Ændringer, tilføjelser eller fortolkninger kan alene foretages af <strong>TorsdagsRådet</strong>.
          Forslag fra medlemmer kan indsendes og tages op på det efterfølgende fredagsmøde.
        </p>

        <ParaHeading id="§17">§17. Tolkning og ånd</ParaHeading>
        <ul>
          <li>Hyggen går forud for regelrytteriet.</li>
          <li>En kold øl løser mere end en paragraf.</li>
          <li>Fairplay, grin og respekt står over alt andet.</li>
        </ul>

        <hr className="my-8 border-dashed border-green-200" />
        <p className="text-xs text-gray-500">
          TorsdagsBold &amp; Bajere er et levende padel-netværk – ikke en traditionel forening.
        </p>
      </article>

      {/* Footer actions */}
      <div className="mt-8 flex items-center justify-between">
        <Link
          href="/torsdagspadel"
          className="inline-flex items-center gap-2 rounded-xl border border-green-300 bg-white px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-50 transition"
        >
          ← Tilbage til Torsdagspadel
        </Link>
        <a
          href="#top"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 transition"
        >
          Til toppen
        </a>
      </div>
    </div>
  );
}
