'use client'
export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type Bruger = { visningsnavn: string; torsdagspadel: boolean }
type Tilmelding = { kan_spille: boolean; tidligste_tid?: string | null } | null

type EventSet = {
  id: number
  event_dato: string
  kamp_nr: number
  saet_nr: number
  bane: string
  starttid: string
  sluttid: string
  holda1: string
  holda2: string
  holdb1: string
  holdb2: string
}

// ——— Tidszone-sikre helpers ———
function nowInCopenhagen(): Date {
  // Bygger kan mangle full-ICU → catch og fald tilbage til lokal tid
  try {
    return new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Copenhagen' }))
  } catch {
    return new Date()
  }
}

function getNextThursdayISOFrom(d: Date): string {
  const day = d.getDay() // 0..6 (torsdag=4)
  let addDays = (4 - day + 7) % 7
  if (addDays === 0) addDays = 7
  const nextThu = new Date(d)
  nextThu.setDate(d.getDate() + addDays)
  const yyyy = nextThu.getFullYear()
  const mm = String(nextThu.getMonth() + 1).padStart(2, '0')
  const dd = String(nextThu.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function getThisThursdayISOFrom(d: Date): string | null {
  return d.getDay() === 4
    ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    : null
}

function formatDanishDate(isoDate: string): string {
  const dt = new Date(`${isoDate}T00:00:00`)
  try {
    return dt.toLocaleDateString('da-DK', {
      day: '2-digit',
      month: 'long',
      timeZone: 'Europe/Copenhagen',
    })
  } catch {
    // fallback uden specificeret timeZone
    return dt.toLocaleDateString('da-DK', { day: '2-digit', month: 'long' })
  }
}

function oreToDKK(ore: any): number {
  const n = Number(ore ?? 0)
  return Number.isFinite(n) ? n / 100 : 0
}

export default function TorsdagStartside() {
  const [bruger, setBruger] = useState<Bruger | null>(null)
  const [loading, setLoading] = useState(true)
  const [tilmelding, setTilmelding] = useState<Tilmelding>(null)
  const [status, setStatus] = useState<'idle' | 'updating' | 'done' | 'editing'>('idle')

  const [mineSaet, setMineSaet] = useState<EventSet[] | null>(null)
  const [loadingSaet, setLoadingSaet] = useState(true)

  const [totalDKK, setTotalDKK] = useState<number>(0)

  // ❗️NYT: Beregn datoer efter mount (så server-prerender ikke rammer timeZone-fejl)
  const [signupDato, setSignupDato] = useState<string>('') // næste torsdag
  const [planDato, setPlanDato] = useState<string>('')     // i dag hvis torsdag, ellers næste

  useEffect(() => {
    const now = nowInCopenhagen()
    const nextThu = getNextThursdayISOFrom(now)
    const thisThu = getThisThursdayISOFrom(now)
    setSignupDato(nextThu)
    setPlanDato(thisThu ?? nextThu)
  }, [])

  const signupDatoTekst = useMemo(() => (signupDato ? formatDanishDate(signupDato) : ''), [signupDato])
  const planDatoTekst   = useMemo(() => (planDato   ? formatDanishDate(planDato)   : ''), [planDato])

  const tider = ['17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00']

  useEffect(() => {
    const hentBruger = async () => {
      try {
        // Vent til datoer er sat (ellers spilder vi kald)
        if (!signupDato || !planDato) return

        const { data: auth } = await supabase.auth.getUser()
        const user = auth?.user
        if (!user) {
          setLoading(false)
          setLoadingSaet(false)
          return
        }

        // PROFIL (any-shim)
        const profResp = await (supabase.from('profiles') as any)
          .select('visningsnavn, torsdagspadel')
          .eq('id', user.id)
          .maybeSingle()

        const profile = (profResp?.data ?? null) as { visningsnavn?: string; torsdagspadel?: boolean } | null
        if (!profile?.torsdagspadel || !profile?.visningsnavn) {
          setLoading(false)
          setLoadingSaet(false)
          return
        }

        setBruger({ visningsnavn: profile.visningsnavn, torsdagspadel: !!profile.torsdagspadel })

        // EVT. EKSISTERENDE TILMELDING
        const tilmResp = await (supabase.from('event_signups') as any)
          .select('kan_spille, tidligste_tid')
          .eq('visningsnavn', profile.visningsnavn)
          .eq('event_dato', signupDato)
          .maybeSingle()

        if (tilmResp?.data) {
          const t = tilmResp.data as { kan_spille?: boolean; tidligste_tid?: string | null }
          setTilmelding({ kan_spille: !!t.kan_spille, tidligste_tid: t.tidligste_tid ?? null })
          setStatus('done')
        }

        // HENT DINE SÆT TIL PLAN-DATOEN
        setLoadingSaet(true)
        const setsResp = await (supabase.from('event_sets') as any)
          .select('id, event_dato, kamp_nr, saet_nr, bane, starttid, sluttid, holda1, holda2, holdb1, holdb2')
          .eq('event_dato', planDato)
          .order('kamp_nr', { ascending: true })
          .order('saet_nr', { ascending: true })

        if (setsResp?.error) {
          console.error('Fejl ved hentning af event_sets:', setsResp.error)
          setMineSaet([])
        } else {
          const rows = (setsResp?.data ?? []) as EventSet[]
          const mine = rows.filter(
            r =>
              r.holda1 === profile.visningsnavn ||
              r.holda2 === profile.visningsnavn ||
              r.holdb1 === profile.visningsnavn ||
              r.holdb2 === profile.visningsnavn
          )
          setMineSaet(mine)
        }

        // HENT BAR-ENTRIES TIL TOTAL
        const barResp = await (supabase.from('bar_entries') as any)
          .select('amount_ore')
          .eq('visningsnavn', profile.visningsnavn)

        if (barResp?.error) {
          console.error('Fejl ved hentning af bar_entries:', barResp.error)
          setTotalDKK(0)
        } else {
          const total = (barResp?.data ?? []).reduce(
            (sum: number, r: any) => sum + oreToDKK(r?.amount_ore),
            0
          )
          setTotalDKK(total)
        }
      } finally {
        setLoading(false)
        setLoadingSaet(false)
      }
    }

    hentBruger()
  }, [signupDato, planDato])

  const sendTilmelding = async (kanSpille: boolean, tidligsteTid?: string) => {
    setStatus('updating')
    const { data: auth } = await supabase.auth.getUser()
    const user = auth?.user
    if (!user || !bruger || !signupDato) return

    const payload = {
      visningsnavn: bruger.visningsnavn,
      event_dato: signupDato,
      kan_spille: kanSpille,
      tidligste_tid: kanSpille ? (tidligsteTid ?? null) : null,
    }

    const upResp = await (supabase.from('event_signups') as any)
      .upsert(payload, { onConflict: 'visningsnavn,event_dato' })

    if (!upResp?.error) {
      setTilmelding({ kan_spille: kanSpille, tidligste_tid: payload.tidligste_tid })
      setStatus('done')
    } else {
      console.error('Fejl ved tilmelding:', upResp.error)
      setStatus('idle')
    }
  }

  if (loading || !signupDato || !planDato) {
    return <p className="text-center mt-10 text-gray-700 dark:text-white">Indlæser...</p>
  }

  if (!bruger) {
    return (
      <p className="text-center mt-10 text-gray-700 dark:text-white">
        Du har ikke adgang til denne side.
      </p>
    )
  }

  const fmt = (t?: string | null) => (t ? t.slice(0, 5) : t)

  const grupperet = (mineSaet ?? []).reduce<Map<number, EventSet[]>>((m, row) => {
    const key = row.kamp_nr
    if (!m.has(key)) m.set(key, [])
    m.get(key)!.push(row)
    return m
  }, new Map())

  const totalLabel =
    totalDKK > 0 ? 'Du har til gode'
      : totalDKK < 0 ? 'Du skylder'
      : 'Alt i nul'

  const totalClass =
    totalDKK > 0 ? 'text-green-700'
      : totalDKK < 0 ? 'text-red-600'
      : 'text-zinc-700 dark:text-zinc-300'

  return (
    <main className="max-w-xl mx-auto p-8 text-gray-900 dark:text-white">
      <h1 className="text-3xl font-bold mb-6 text-center">
        💪 Torsdagspadel – velkommen, {bruger.visningsnavn}!
      </h1>

      {/* Samlet status */}
      <div className="mb-8 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm opacity-70">Samlet status</div>
          <div className={`text-lg font-semibold ${totalClass}`}>
            {totalLabel}:{' '}
            {totalDKK.toLocaleString('da-DK', { style: 'currency', currency: 'DKK' })}
          </div>
        </div>
        <div className="mt-2 text-md text-zinc-600 dark:text-zinc-400 italic">
          Indbetalinger kan ske til MobilePay Box 1637CJ
        </div>
      </div>

      {/* Tilmeldingssektion */}
      <div className="mb-8 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 p-4 rounded-xl">
        <h2 className="text-xl font-semibold mb-3 text-green-700 dark:text-green-300">
          📅 Kan du spille torsdag d. {signupDatoTekst}?
        </h2>

        {tilmelding && status !== 'updating' && status !== 'editing' ? (
          <>
            <p className="text-green-800 dark:text-green-200 mb-2">
              ✅ Du er registreret d. {signupDatoTekst}{' '}
              {tilmelding.kan_spille
                ? `– du kan starte tidligst kl. ${tilmelding.tidligste_tid}`
                : '– du har meldt afbud'}
            </p>
            <button
              onClick={() => setStatus('editing')}
              className="text-sm text-green-700 underline hover:text-green-900 dark:hover:text-green-100"
            >
              Rediger min tilmelding
            </button>
          </>
        ) : (
          <>
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-4">
              <button
                onClick={() => sendTilmelding(false)}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl font-semibold"
              >
                ❌ Nej, jeg kan ikke
              </button>
              <select
                onChange={(e) => {
                  const valgtTid = e.target.value
                  if (valgtTid) sendTilmelding(true, valgtTid)
                }}
                defaultValue=""
                className="bg-green-600 text-white font-semibold px-4 py-2 rounded-xl"
                aria-label="Vælg tidligste starttid"
              >
                <option value="" disabled>
                  ✅ Ja, vælg tidligste tid
                </option>
                {tider.map((tid) => (
                  <option key={tid} value={tid}>
                    {tid}
                  </option>
                ))}
              </select>
            </div>
            {status === 'updating' && (
              <p className="text-sm text-gray-500">Gemmer tilmelding...</p>
            )}
          </>
        )}
      </div>

      {/* Din kamp */}
      <div className="mb-8 border border-zinc-200 dark:border-zinc-700 rounded-xl p-4">
        <h2 className="text-xl font-semibold mb-3">🎾 Din kamp – {planDatoTekst}</h2>

        {loadingSaet ? (
          <p className="text-sm text-gray-600 dark:text-gray-300">Henter kampplan...</p>
        ) : grupperet.size === 0 ? (
          <div className="text-sm">
            <p>Ingen kamp fundet for dig den dag.</p>
            <p className="text-gray-600 dark:text-gray-300">
              Enten er planen ikke publiceret endnu, eller også er du ikke på næste event.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {Array.from(grupperet.entries()).map(([kampNr, saet]) => {
              const meta = saet[0]
              return (
                <div key={kampNr} className="rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold">Kamp #{kampNr}</h3>
                    <div className="text-sm">
                      🏟 {meta.bane} · ⏱ {fmt(meta.starttid)}–{fmt(meta.sluttid)}
                    </div>
                  </div>
                  <div className="space-y-1 text-sm">
                    {saet.map((r) => (
                      <div key={r.saet_nr} className="flex items-start gap-3">
                        <span className="font-medium shrink-0">Sæt {r.saet_nr}:</span>
                        <span className="leading-tight break-words text-left">
                          {r.holda1} & {r.holda2} <span className="opacity-60">vs</span><br />
                          {r.holdb1} & {r.holdb2}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Links */}
      <div className="grid gap-4">
        <Link
          href="/torsdagspadel/rangliste"
          className="bg-green-700 hover:bg-green-800 text-white font-semibold py-3 px-5 rounded-xl text-center shadow"
        >
          📊 Torsdagsranglisten
        </Link>
        <Link
          href="/torsdagspadel/monthly"
          className="bg-green-700 hover:bg-green-800 text-white font-semibold py-3 px-5 rounded-xl text-center shadow"
        >
          🌟 Månedens Torsdagsspiller
        </Link>
        <Link
          href="/torsdagspadel/regnskab"
          className="bg-green-700 hover:bg-green-800 text-white font-semibold py-3 px-5 rounded-xl text-center shadow"
        >
          💸 Regnskab
        </Link>
        <Link
  href="/torsdagspadel/reglement"
  className="bg-green-700 hover:bg-green-800 text-white font-semibold py-3 px-5 rounded-xl text-center shadow"
>
  § Reglement
</Link>
      </div>
    </main>
  )
}

