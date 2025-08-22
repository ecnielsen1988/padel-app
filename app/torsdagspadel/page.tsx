'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type Bruger = { visningsnavn: string; torsdagspadel: boolean }
type Tilmelding = { kan_spille: boolean; tidligste_tid?: string | null } | null

// ← Brug lowercase felter her (tilpas hvis du har snake_case i DB)
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

// Hjælper: find altid NÆSTE torsdag i Europe/Copenhagen (også hvis i dag er torsdag)
function getNextThursdayISO(): string {
  const nowCph = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Copenhagen' }))
  const day = nowCph.getDay() // 0=søn ... 4=tors
  let addDays = (4 - day + 7) % 7
  if (addDays === 0) addDays = 7
  const nextThu = new Date(nowCph)
  nextThu.setDate(nowCph.getDate() + addDays)
  const yyyy = nextThu.getFullYear()
  const mm = String(nextThu.getMonth() + 1).padStart(2, '0')
  const dd = String(nextThu.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function formatDanishDate(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`)
  return d.toLocaleDateString('da-DK', {
    day: '2-digit',
    month: 'long',
    timeZone: 'Europe/Copenhagen',
  })
}

function getThisThursdayISO(): string | null {
  const nowCph = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Copenhagen' }))
  return nowCph.getDay() === 4
    ? `${nowCph.getFullYear()}-${String(nowCph.getMonth()+1).padStart(2,'0')}-${String(nowCph.getDate()).padStart(2,'0')}`
    : null
}

// Beløb i øre → DKK
function oreToDKK(ore: any): number {
  const n = Number(ore ?? 0)
  return Number.isFinite(n) ? n / 100 : 0
}

export default function TorsdagStartside() {
  const [bruger, setBruger] = useState<Bruger | null>(null)
  const [loading, setLoading] = useState(true)
  const [tilmelding, setTilmelding] = useState<Tilmelding>(null)
  const [status, setStatus] = useState<'idle' | 'updating' | 'done' | 'editing'>('idle')

  // NYT: mine sæt (din(e) kamp(e))
  const [mineSaet, setMineSaet] = useState<EventSet[] | null>(null)
  const [loadingSaet, setLoadingSaet] = useState(true)

  // NYT: total regnskab i DKK (samme som i /regnskab-boksen)
  const [totalDKK, setTotalDKK] = useState<number>(0)

  // Tilmelding: ALTID næste torsdag
  const signupDato = useMemo(() => getNextThursdayISO(), [])
  const signupDatoTekst = useMemo(() => formatDanishDate(signupDato), [signupDato])

  // Planvisning: I DAG hvis det er torsdag – ellers næste torsdag
  const thisThursday = useMemo(() => getThisThursdayISO(), [])
  const planDato = thisThursday ?? signupDato
  const planDatoTekst = useMemo(() => formatDanishDate(planDato), [planDato])

  const tider = ['17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00']

  useEffect(() => {
    const hentBruger = async () => {
      try {
        const { data: auth } = await supabase.auth.getUser()
        const user = auth?.user
        if (!user) {
          setLoading(false)
          setLoadingSaet(false)
          return
        }

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('visningsnavn, torsdagspadel')
          .eq('id', user.id)
          .single()

        if (profileError || !profile?.torsdagspadel) {
          setLoading(false)
          setLoadingSaet(false)
          return
        }

        setBruger(profile)

        // Hent evt. eksisterende tilmelding
        const { data: tilmeldingData } = await supabase
          .from('event_signups')
          .select('kan_spille, tidligste_tid')
          .eq('visningsnavn', profile.visningsnavn)
          .eq('event_dato', signupDato)
          .single()

        if (tilmeldingData) {
          setTilmelding(tilmeldingData as Tilmelding)
          setStatus('done')
        }

        // Hent "din kamp" fra event_sets
        setLoadingSaet(true)
        const { data: setsData, error: setsError } = await supabase
          .from('event_sets')
          .select('*')
          .eq('event_dato', planDato)
          .order('kamp_nr', { ascending: true })
          .order('saet_nr', { ascending: true })

        if (setsError) {
          console.error('Fejl ved hentning af event_sets:', setsError)
          setMineSaet([])
        } else {
          const rows = (setsData as EventSet[]) ?? []
          const mine = rows.filter(
            r =>
              r.holda1 === profile.visningsnavn ||
              r.holda2 === profile.visningsnavn ||
              r.holdb1 === profile.visningsnavn ||
              r.holdb2 === profile.visningsnavn
          )
          setMineSaet(mine)
        }

        // Hent bar_entries for at vise Samlet status (identisk med /regnskab-boksen)
        const { data: barData, error: barErr } = await supabase
          .from('bar_entries')
          .select('amount_ore')
          .eq('visningsnavn', profile.visningsnavn)

        if (barErr) {
          console.error('Fejl ved hentning af bar_entries:', barErr)
          setTotalDKK(0)
        } else {
          const total = (barData ?? []).reduce((sum: number, r: any) => sum + oreToDKK(r.amount_ore), 0)
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
    if (!user || !bruger) return

    const payload = {
      visningsnavn: bruger.visningsnavn,
      event_dato: signupDato, // dynamisk næste torsdag
      kan_spille: kanSpille,
      tidligste_tid: kanSpille ? (tidligsteTid ?? null) : null,
    }

    const { error } = await supabase
      .from('event_signups')
      .upsert([payload], { onConflict: 'visningsnavn, event_dato' })

    if (!error) {
      setTilmelding({ kan_spille: kanSpille, tidligste_tid: payload.tidligste_tid })
      setStatus('done')
    } else {
      console.error('Fejl ved tilmelding:', error)
      setStatus('idle')
    }
  }

  if (loading)
    return <p className="text-center mt-10 text-gray-700 dark:text-white">Indlæser...</p>

  if (!bruger)
    return (
      <p className="text-center mt-10 text-gray-700 dark:text-white">
        Du har ikke adgang til denne side.
      </p>
    )

  // Hjælpere til visning
  const fmt = (t?: string | null) => (t ? t.slice(0, 5) : t) // "HH:MM:SS" -> "HH:MM"

  // Gruppér mine sæt pr. kamp_nr
  const grupperet = (mineSaet ?? []).reduce<Map<number, EventSet[]>>((m, row) => {
    const key = row.kamp_nr
    if (!m.has(key)) m.set(key, [])
    m.get(key)!.push(row)
    return m
  }, new Map())

  // Labels/klasse til statusboksen (samme logik som /regnskab)
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

      {/* NYT: Samlet status (identisk med /regnskab) */}
      <div className="mb-8 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm opacity-70">Samlet status</div>
          <div className={`text-lg font-semibold ${totalClass}`}>
            {totalLabel}:{' '}
            {totalDKK.toLocaleString('da-DK', { style: 'currency', currency: 'DKK' })}
          </div>
        </div>
        <div className="mt-2 text-md text-zinc-600 dark:text-zinc-400 italic">
          Indbetalinger kan ske til MobilePay Box 2033WT
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
          href="/torsdagspadel/events"
          className="bg-green-700 hover:bg-green-800 text-white font-semibold py-3 px-5 rounded-xl text-center shadow"
        >
          📅 Kommende Events
        </Link>
      </div>
    </main>
  )
}

