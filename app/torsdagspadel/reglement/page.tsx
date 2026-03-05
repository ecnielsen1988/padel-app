'use client';

import Link from 'next/link';

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4 pt-8 mt-8 border-t border-emerald-100 dark:border-emerald-900/40">
      <h2 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-100">
        {title}
      </h2>
      <div className="space-y-3 text-zinc-800 dark:text-zinc-200 leading-relaxed">
        {children}
      </div>
    </section>
  );
}

export default function ReglementPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8">

      {/* Header */}
      <div className="mb-8 rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-zinc-900/60 shadow-sm">
        <div className="h-2 w-full rounded-t-2xl bg-gradient-to-r from-emerald-600 via-green-500 to-emerald-600" />
        <div className="p-6 space-y-3">
          <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 dark:text-zinc-100">
            🎾 Torsdagspadel – sådan fungerer det
          </h1>
          <p className="text-zinc-700 dark:text-zinc-300">
            TorsdagsBold & Bajere er vores ugentlige padelaften.  
            Målet er enkelt: <strong>god padel, gode kampe og god stemning.</strong>
          </p>
          <p className="text-sm text-zinc-500">
            Vi spiller primært i <strong>Padelhuset Helsinge</strong> fra ca. kl. <strong>17:00</strong>.
          </p>
        </div>
      </div>

      {/* Tilmelding */}
      <Section title="📅 Tilmelding">
        <p>Tilmelding foregår via <strong>Matchi</strong>.</p>

        <p>
          Hvis du <strong>kan spille fra start kl. 17:00</strong>, er det nok blot
          at tilmelde sig på Matchi.
        </p>

        <p>
          Hvis du:
        </p>

        <ul className="list-disc pl-6 space-y-1">
          <li>ikke kan møde kl. 17</li>
          <li>vil framelde dig</li>
          <li>eller har ændringer</li>
        </ul>

        <p>
          skal dette <strong>noteres i rangliste-appen</strong>.
        </p>

        <p>
          Hvis du kun kan spille i et helt bestemt tidsrum, bør du
          <strong> ikke tilmelde dig på Matchi</strong>.
        </p>

        <p>
          Skriv i stedet til arrangøren hvornår du kan spille.  
          Når programmet er lagt, får du besked hvis det kan lade sig gøre.
        </p>
      </Section>

      {/* Mødetid */}
      <Section title="⏰ Mødetid">
        <p>Programmet bliver lagt når kabalen går op.</p>

        <p>
          Når der står en kamp på programmet, forventes det at du er:
        </p>

        <ul className="list-disc pl-6 space-y-1">
          <li>på stedet</li>
          <li>klar</li>
          <li>og på banen til tiden</li>
        </ul>

        <p>
          Hvis du skriver at du først kan møde senere, kan du
          <strong> risikere at blive sat på et lavere niveau</strong>.
        </p>

        <p>
          Programmet bygges først og fremmest op omkring spillere der
          kan starte kl. 17.
        </p>
      </Section>

      {/* Kampformat */}
      <Section title="🎾 Kampformat">
        <p>Vi spiller normalt <strong>ét sæt pr. kamp</strong>.</p>

        <ul className="list-disc pl-6 space-y-1">
          <li>Sæt til <strong>6 partier</strong></li>
          <li><strong>Tie-break</strong> ved 6–6</li>
        </ul>

        <p className="font-semibold mt-2">Killer point ved 40–40</p>

        <p>
          Ved 40–40 spilles:
        </p>

        <ol className="list-decimal pl-6 space-y-1">
          <li>én fordelbold</li>
          <li>hvis stillingen igen bliver lige spilles en afgørende bold</li>
        </ol>

        <p>
          Returnerende hold vælger side for serven.
        </p>
      </Section>

      {/* Elo */}
      <Section title="📊 Rangliste og Elo">
        <p>
          Alle kampe registreres i <strong>ranglisteappen</strong>.
        </p>

        <p>
          Ranglisten beregnes via et <strong>Elo-system</strong>, hvor:
        </p>

        <ul className="list-disc pl-6 space-y-1">
          <li>modstandernes niveau indgår</li>
          <li>klare sejre giver flere point</li>
          <li>overraskelser giver større udsving</li>
        </ul>

        <p>
          Det er spillernes eget ansvar at sørge for at
          <strong> resultaterne bliver registreret korrekt</strong>.
        </p>
      </Section>

      {/* Dagens vinder */}
      <Section title="🏆 Dagens vinder">
        <p>
          Dagens vinder er den spiller der
          <strong> samler flest positive Elo-point på dagen</strong>.
        </p>

        <ul className="space-y-1">
          <li>🥇 1. plads – 2 øl + 1 sodavand</li>
          <li>🥈 2. plads – 1 øl</li>
          <li>🥉 3. plads – 1 sodavand</li>
        </ul>
      </Section>

      {/* Årets vinder */}
      <Section title="🏅 Årets torsdagsvinder">
        <p>
          Der føres også en <strong>torsdags-vinderliste</strong> for medlemmer.
        </p>

        <p>Point gives pr. torsdag:</p>

        <ul className="space-y-1">
          <li>🥇 1. plads → 10 point</li>
          <li>🥈 2. plads → 5 point</li>
          <li>🥉 3. plads → 3 point</li>
          <li>4. plads → 2 point</li>
          <li>5. plads → 1 point</li>
        </ul>

        <p>
          Disse point bruges til at kåre <strong>årets torsdagsspiller</strong>.
        </p>
      </Section>

      {/* Pris */}
      <Section title="💰 Pris">
        <p>
          Det koster:
        </p>

        <ul className="list-disc pl-6 space-y-1">
          <li><strong>150 kr. pr. gang</strong></li>
          <li><strong>100 kr. for medlemmer</strong></li>
        </ul>

        <p>
          I prisen er <strong>én øl eller sodavand</strong> inkluderet.
        </p>

        <p>
          Øvrige drikkevarer købes <strong>direkte i baren hos Padelhuset</strong>.
          Der føres ikke længere kredit eller barkonto.
        </p>
      </Section>

      {/* Bolde */}
      <Section title="🎾 Bolde">
        <p>
          Der spilles med <strong>nye bolde i første runde</strong> på alle baner.
        </p>

        <p>
          Derefter bruges de samme bolde videre resten af aftenen.
        </p>
      </Section>

      {/* Træning */}
      <Section title="🏋️ Træning og hold">
        <p>
          <strong>Guldmedlemmer</strong> tilbydes:
        </p>

        <ul className="list-disc pl-6 space-y-1">
          <li>holdtræning</li>
          <li>mulighed for deltagelse på ligahold</li>
        </ul>

        <p>
          Hvis du er interesseret, så tag fat i arrangøren.
        </p>
      </Section>

      {/* Uskrevne regler */}
      <Section title="🍻 Den uskrevne torsdagsregel">
        <p>
          Bødekassen er sat på pause.
        </p>

        <p>
          Men der findes stadig lidt <strong>torsdagslogik</strong>.
        </p>

        <p>
          Hvis du fx:
        </p>

        <ul className="list-disc pl-6 space-y-1">
          <li>kommer for sent</li>
          <li>skyder din makker ned</li>
          <li>giver eller får et æg</li>
          <li>laver dobbeltfejl på killer point</li>
          <li>eller på anden måde laver noget spektakulært</li>
        </ul>

        <p>
          …så er det god stil at <strong>give en omgang til banen</strong>.
        </p>

        <p>
          Det er ikke tvang – men det gør stemningen bedre, og
          <strong> støtter samtidig baren i Padelhuset</strong>,
          som lægger faciliteter til vores torsdage.
        </p>
      </Section>

      {/* Footer */}
      <div className="mt-12">
        <Link
          href="/torsdagspadel"
          className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 dark:border-emerald-700 px-4 py-2 text-sm font-medium text-emerald-700 dark:text-emerald-200 hover:bg-emerald-50 dark:hover:bg-zinc-900 transition"
        >
          ← Tilbage til Torsdagspadel
        </Link>
      </div>
    </div>
  );
}
