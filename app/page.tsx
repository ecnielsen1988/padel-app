import Image from "next/image"
import Link from "next/link"
import { beregnNyRangliste } from "@/lib/beregnNyRangliste"
import { PageShell } from "./components/ui"
import { supabase } from "@/lib/supabaseClient"

type Spiller = {
  visningsnavn: string
  elo: number
}

type ProfileRow = {
  visningsnavn: string
  status: "active" | "sleep" | "inactive" | null
}

// ✅ Server component
export default async function Home() {
  // 1) Hent rangliste (alle spillere)
  const rangliste: Spiller[] = await beregnNyRangliste()

  // 2) Hent aktive profiler
  const { data: profiles } = await supabase
  .from("profiles")
  .select("visningsnavn, status")

  const activeNameSet = new Set(
  ((profiles as ProfileRow[] | null) ?? [])
    .filter((p) => p.status === "active")
    .map((p) => (p.visningsnavn ?? "").toString().trim())
    .filter(Boolean)
)

  // 3) Filtrér ranglisten til kun aktive spillere
  const aktiveRangliste = rangliste.filter((spiller) =>
    activeNameSet.has((spiller.visningsnavn ?? "").toString().trim())
  )

  // 4) Top 5 blandt de aktive
  const top5 = aktiveRangliste.slice(0, 5)

  return (
    <PageShell>
      <section className="padel-surface padel-hero overflow-hidden">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_0.9fr] lg:items-center">
          <div className="space-y-8">
            <div className="space-y-5">
              <div className="inline-flex rounded-full border border-[var(--border)] bg-white/55 px-4 py-2">
                <Image
                  src="/padelhuset-logo.png"
                  alt="Padelhuset Logo"
                  width={180}
                  height={54}
                  priority
                />
              </div>
              <div className="space-y-4">
                <p className="padel-eyebrow">Padelhuset Helsinge</p>
                <h1 className="padel-title max-w-3xl">
                  Ranglisten, resultaterne og rivaliseringen samlet ét sted.
                </h1>
                <p className="padel-lead">
                  Hold styr på dine kampe, se din udvikling og følg med i hvem
                  der rykker lige nu. Appen samler ranglister, events og
                  profiler i et hurtigere og mere levende overblik.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {[
                "Live rangliste med aktive spillere",
                "Profiler med Elo, streaks og historik",
                "Nem registrering af kampe og resultater",
                "Kommende events og aktuelle highlights",
              ].map((feature) => (
                <div
                  key={feature}
                  className="rounded-2xl border border-[var(--border)] bg-white/55 px-4 py-3 text-sm font-semibold text-[color:var(--foreground)]"
                >
                  {feature}
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link href="/login" className="padel-primary-button inline-flex">
                Log ind
              </Link>
              <Link href="/signup" className="padel-secondary-button inline-flex">
                Opret profil
              </Link>
            </div>
          </div>

          <aside className="padel-surface bg-white/55">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <p className="padel-eyebrow">Lige nu</p>
                <h2 className="font-[var(--font-display)] text-2xl font-bold tracking-tight">
                  Top 5 aktive
                </h2>
              </div>
              <span className="rounded-full bg-[color:var(--gold)]/15 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-[color:var(--gold)]">
                Live
              </span>
            </div>
            <ol className="space-y-3">
              {top5.map((spiller, index) => (
                <li
                  key={spiller.visningsnavn}
                  className="flex items-center justify-between rounded-2xl border border-[var(--border)] bg-white/70 px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[color:var(--brand)]/12 text-sm font-extrabold text-[color:var(--brand-strong)]">
                      {index === 0 ? "1" : index + 1}
                    </span>
                    <div>
                      <p className="font-semibold">{spiller.visningsnavn}</p>
                      <p className="text-sm text-[color:var(--muted)]">
                        {index === 0
                          ? "Fører feltet"
                          : index === 1
                            ? "Ligger lige efter"
                            : index === 2
                              ? "På podiet"
                              : "Jager toppen"}
                      </p>
                    </div>
                  </div>
                  <span className="text-sm font-bold text-[color:var(--foreground)]">
                    {Math.round(spiller.elo)} Elo
                  </span>
                </li>
              ))}
            </ol>
          </aside>
        </div>
      </section>
    </PageShell>
  )
}
