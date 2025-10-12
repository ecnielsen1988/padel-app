'use client';

import React from 'react';
import Link from 'next/link';

// Lille §-overskrift med ankerlink
function ParaHeading({ id, title }: { id: string; title: string }) {
  return (
    <h3
      id={id}
      className="group scroll-mt-24 text-lg sm:text-xl font-semibold tracking-tight text-emerald-800 dark:text-emerald-200 flex items-center gap-2"
    >
      <span className="inline-flex items-center justify-center rounded-md border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 text-emerald-700 dark:text-emerald-200">
        §
      </span>
      <span>{title}</span>
      <a
        href={`#${id}`}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-emerald-600 dark:text-emerald-300 text-sm"
        aria-label="Kopiér link til paragraf"
      >
        #
      </a>
    </h3>
  );
}

// Wrapper der giver tydelige sektioner med luft og en diskret linje
function Section({
  children,
  first = false,
}: {
  children: React.ReactNode;
  first?: boolean;
}) {
  return (
    <section
      className={[
        'space-y-4 sm:space-y-5 leading-relaxed',
        first ? 'pt-0' : 'pt-8 sm:pt-10',
        'mt-8 sm:mt-10 border-t border-emerald-100/80 dark:border-emerald-900/40',
      ].join(' ')}
    >
      {children}
    </section>
  );
}

export default function ReglementPage() {
  const updated = new Intl.DateTimeFormat('da-DK', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date());

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8">
      {/* Header-kort */}
      <div className="mb-8 rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-white/70 dark:bg-zinc-900/60 shadow-sm backdrop-blur">
        <div className="h-2 w-full rounded-t-2xl bg-gradient-to-r from-emerald-600 via-green-500 to-emerald-600" />
        <div className="p-6">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              Reglement for <span className="text-emerald-700 dark:text-emerald-300">TorsdagsBold &amp; Bajere</span>
            </h1>
            <span className="inline-flex items-center whitespace-nowrap rounded-full border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/30 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-200">
              Torsdagspadel
            </span>
          </div>

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
                className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-zinc-900/60 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 hover:border-emerald-300 dark:hover:bg-zinc-900 transition"
              >
                {label}
              </a>
            ))}
          </div>

          <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">Sidst opdateret: {updated}</p>
        </div>
      </div>

      {/* Indhold – bevidst uden 'prose' for at have fuld kontrol over spacing på lys/mørk */}
      {/* KAPITEL 1 */}
      <h2 id="kapitel-1" className="scroll-mt-24 text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-100">
        Kapitel 1 – Formål og Rammer
      </h2>

      <Section first>
        <ParaHeading id="§1" title="§1. Navn og formål" />
        <div className="space-y-4 text-zinc-800 dark:text-zinc-200">
          <p>
            Padel-netværket bærer navnet <strong>TorsdagsBold &amp; Bajere</strong>. Formålet er at
            samle mænd i deres bedste alder til social hygge, grin og masser af padelspil i en
            uformel, men organiseret ramme.
          </p>
          <p>
            Netværket fungerer også som et socialt og forretningsmæssigt fællesskab, hvor
            <strong> lokumsaftaler, handler og samarbejder</strong> gerne må opstå – altid med et smil
            og et håndtryk.
          </p>
        </div>

        <ParaHeading id="§2" title="§2. Spillested og afvikling" />
        <div className="space-y-3 text-zinc-800 dark:text-zinc-200">
          <p>
            Der spilles i <strong>Padelhuset Helsinge</strong> hver torsdag mellem kl. <strong>17.00 – 22.00</strong>,
            samt på udvalgte afslutnings- og festdage fastsat af <strong>TorsdagsRådet</strong>.
          </p>
        </div>

        <ParaHeading id="§3" title="§3. Medlemmer og gæstespillere" />
        <ul className="list-disc pl-6 space-y-2 text-zinc-800 dark:text-zinc-200">
          <li>
            <strong>Medlemmer</strong> har adgang til alle arrangementer, deltager i præmier, og skal
            til- og framelde sig hver uge. Medlemmer inviteres ligeledes til <strong>Lunar-holdkampe</strong> og
            øvrige særlige arrangementer.
          </li>
          <li>
            <strong>Gæstespillere</strong> kan deltage, hvis der er ledige pladser. De har ingen faste forpligtelser
            og deltager ikke i præmier eller holdkampe.
          </li>
        </ul>
      </Section>

      {/* KAPITEL 2 */}
      <h2 id="kapitel-2" className="scroll-mt-24 text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-100">
        Kapitel 2 – Tilmelding og Fremmøde
      </h2>

      <Section>
        <ParaHeading id="§4" title="§4. Tilmelding" />
        <div className="space-y-4 text-zinc-800 dark:text-zinc-200">
          <p>
            Alle medlemmer skal til- eller framelde sig <strong>både på Matchi og i ranglisteappen</strong> senest
            <strong> mandag ved midnat</strong> før den kommende torsdag.
          </p>
          <p>
            Ved tilmelding skal der noteres i appen, <strong>hvornår man tidligst kan møde ind</strong>. Dette er ikke
            et ønske om præference, men alene <strong>hvornår man tidligst kan spille</strong>. For at få plads til flest
            mulige kampe, forsøges flest mulige kampe startet <strong>kl. 17.00</strong>. Markereres et senere
            starttidspunkt, kan man risikere at blive <strong>rykket ned i niveau</strong> – og i værste fald
            <strong> afmeldt arrangementet</strong>, dog med fuld refusion.
          </p>
        </div>

        <ParaHeading id="§5" title="§5. Afbud og udeblivelse" />
        <p className="text-zinc-800 dark:text-zinc-200">
          Afbud skal meldes til en <strong>repræsentant fra TorsdagsRådet</strong> hurtigst muligt. Overtrædelser og
          bøder behandles jf. <a href="#§12" className="text-emerald-700 dark:text-emerald-300 underline decoration-dotted">
            §12 (Bødekasse)
          </a>.
        </p>

        <ParaHeading id="§6" title="§6. Fremmøde" />
        <p className="text-zinc-800 dark:text-zinc-200">
          Kampprogrammet offentliggøres i appen aftenen før. Spillerne skal være <strong>kampklare på det angivne tidspunkt</strong>.
          Forsinkelse medfører bøde jf. §12.
        </p>
      </Section>

      {/* KAPITEL 3 */}
      <h2 id="kapitel-3" className="scroll-mt-24 text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-100">
        Kapitel 3 – Spillets Afvikling
      </h2>

      <Section>
        <ParaHeading id="§7" title="§7. Kampformat" />
        <div className="space-y-4 text-zinc-800 dark:text-zinc-200">
          <p>
            Hver kamp varer <strong>1 time og 30–40 minutter</strong>, afhængigt af antal tilmeldte. Der spilles ét sæt
            pr. kamp, hvorefter der byttes makker og modstandere efter kampprogrammet. Sættene spilles som almindelige sæt
            til <strong>først til 6 (tie-break til 7 ved 6–6)</strong>.
          </p>
          <p>
            Ved stillingen <strong>40–40</strong> spilles med <em>killer point</em>: der spilles med fordel én gang, og hvis
            stillingen derefter igen bliver lige, spilles en afgørende bold, hvor returnerende hold vælger side for serven.
          </p>
        </div>

        <ParaHeading id="§8" title="§8. Pointsystem og Elo-beregning" />
        <div className="space-y-4 text-zinc-800 dark:text-zinc-200">
          <p>
            Alle kampe skal registreres i ranglisteappen umiddelbart efter afslutning. Kampene sættes op efter
            <strong> niveau</strong>, således at de 4 bedste spiller på samme bane, de 4 næstbedste på næste osv. Der kan
            foretages justeringer, hvis tilmeldingstidspunkter eller praktiske forhold kræver det.
          </p>
          <p>
            Ranglisten baseres på <strong>Elo-systemet</strong>, hvor point justeres efter forventet styrkeforhold mellem
            holdene.
          </p>
          <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-4 text-sm text-emerald-900 dark:text-emerald-100">
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
              Systemet sikrer, at vindernes gevinst svarer til tabernes tab. Det er spillernes eget ansvar at
              <strong> indtaste og bekræfte resultaterne</strong> efter hvert sæt.
            </p>
          </div>
        </div>

        <ParaHeading id="§9" title="§9. Fairplay og opførsel" />
        <p className="text-zinc-800 dark:text-zinc-200">
          Alle deltagere forpligter sig til at spille med <strong>god tone og respekt</strong> for både medspillere,
          modspillere og baner. Dårlig opførsel, udstyrskast eller anden uhensigtsmæssig adfærd takseres som
          <strong> adfærdsregulering</strong> jf. §12.
        </p>
      </Section>

      {/* KAPITEL 4 */}
      <h2 id="kapitel-4" className="scroll-mt-24 text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-100">
        Kapitel 4 – Sociale Regler og Økonomi
      </h2>

      <Section>
        <ParaHeading id="§10" title="§10. Drikkevarer" />
        <p className="text-zinc-800 dark:text-zinc-200">
          Ved almindelige TorsdagsBold &amp; Bajere-arrangementer er <strong>én drikkevare</strong> inkluderet i
          deltagelsen. Yderligere forplejning <strong>noteres i regnskabet</strong> og afregnes via barkontoen.
        </p>

        <ParaHeading id="§11" title="§11. Præmier og hæder" />
        <div className="space-y-3 text-zinc-800 dark:text-zinc-200">
          <p>Hver torsdag uddeles følgende præmier blandt de deltagende <strong>medlemmer</strong>:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>1. præmie: <strong>100 kr.</strong></li>
            <li>2. præmie: <strong>50 kr.</strong></li>
            <li>3. præmie: <strong>25 kr.</strong></li>
          </ul>
          <p>Hver måned:</p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Top 3 i Elo-fremgang: <strong>250 kr.</strong>, <strong>100 kr.</strong>, <strong>50 kr.</strong></li>
            <li>Mest aktive spiller: <strong>200 kr.</strong></li>
          </ul>
        </div>

        <ParaHeading id="§12" title="§12. Bødekasse" />
        <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="min-w-full divide-y divide-zinc-200 dark:divide-zinc-800 text-sm">
            <thead className="bg-zinc-50 dark:bg-zinc-900/60">
              <tr>
                <th className="px-4 py-2 text-left font-semibold text-zinc-700 dark:text-zinc-100">Overtrædelse</th>
                <th className="px-4 py-2 text-left font-semibold text-zinc-700 dark:text-zinc-100">Bøde</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 bg-white dark:divide-zinc-800 dark:bg-zinc-900/30">
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
                  <td className="px-4 py-2 text-zinc-800 dark:text-zinc-100">{label}</td>
                  <td className="px-4 py-2 text-zinc-900 dark:text-zinc-100 font-medium">{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ParaHeading id="§13" title="§13. Økonomi og medlemskab" />
        <div className="space-y-4 text-zinc-800 dark:text-zinc-200">
          <p>
            Der føres løbende <strong>regnskab i appen</strong>, hvor køb og forbrug noteres. Skyldes der mere end
            <strong> 100 kr.</strong>, skal beløbet betales til den <strong>MobilePay-boks</strong> anført i appen. For
            sen betaling medfører bøde jf. §12.
          </p>
          <ul className="list-disc pl-6 space-y-1">
            <li>Indmeldelse: <strong>100 kr.</strong></li>
            <li>Genindmeldelse efter pause: <strong>50 kr.</strong></li>
          </ul>
          <p>
            Automatisk udmeldelse sker, hvis der ikke er deltaget i <strong>3 måneder</strong>, eller hvis medlemmet
            undlader at tilmelde/framelde sig <strong>5 torsdage i træk</strong>.
          </p>
        </div>
      </Section>

      {/* KAPITEL 5 */}
      <h2 id="kapitel-5" className="scroll-mt-24 text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-100">
        Kapitel 5 – Administration
      </h2>

      <Section>
        <ParaHeading id="§14" title="§14. TorsdagsRådet" />
        <div className="space-y-4 text-zinc-800 dark:text-zinc-200">
          <p>
            Den øverste beslutningsmyndighed er <strong>TorsdagsRådet</strong>, bestående af
            <strong> Formanden</strong>, <strong>Kassereren</strong> og <strong>Bødesvinet</strong>. Rådet mødes hver
            fredag for at evaluere torsdagen og kan ændre, tilføje og fortolke alle regler i dette reglement, herunder
            bøder, præmier og kampformat.
          </p>
          <blockquote className="border-l-4 border-emerald-300 dark:border-emerald-700 bg-emerald-50/70 dark:bg-emerald-900/20 p-3 text-sm text-emerald-900 dark:text-emerald-200 rounded-r-md">
            God padel, kolde bajere og solid kammeratlig tone.
          </blockquote>
        </div>
      </Section>

      {/* KAPITEL 6 */}
      <h2 id="kapitel-6" className="scroll-mt-24 text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-100">
        Kapitel 6 – Ikrafttrædelse, ændringer og tolkning
      </h2>

      <Section>
        <ParaHeading id="§15" title="§15. Ikrafttrædelse" />
        <p className="text-zinc-800 dark:text-zinc-200">
          Reglementet trådte i kraft den dag, det blev offentliggjort på appen.
        </p>

        <ParaHeading id="§16" title="§16. Ændringer" />
        <p className="text-zinc-800 dark:text-zinc-200">
          Ændringer, tilføjelser eller fortolkninger kan alene foretages af <strong>TorsdagsRådet</strong>. Forslag fra
          medlemmer kan indsendes og tages op på det efterfølgende fredagsmøde.
        </p>

        <ParaHeading id="§17" title="§17. Tolkning og ånd" />
        <ul className="list-disc pl-6 space-y-1 text-zinc-800 dark:text-zinc-200">
          <li>Hyggen går forud for regelrytteriet.</li>
          <li>En kold øl løser mere end en paragraf.</li>
          <li>Fairplay, grin og respekt står over alt andet.</li>
        </ul>
      </Section>

      {/* Footer */}
      <div className="mt-12 flex items-center justify-between">
        <Link
          href="/torsdagspadel"
          className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-zinc-900/50 px-4 py-2 text-sm font-medium text-emerald-700 dark:text-emerald-200 hover:bg-emerald-50 dark:hover:bg-zinc-900 transition"
        >
          ← Tilbage til Torsdagspadel
        </Link>
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 dark:hover:bg-emerald-500 transition"
        >
          Til toppen
        </button>
      </div>
    </div>
  );
}

