'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type Bruger = { visningsnavn: string; torsdagspadel: boolean }

type Tilmelding = { kan_spille: boolean; tidligste_tid?: string | null } | null

// Hjælper: find altid NÆSTE torsdag i Europe/Copenhagen (også hvis i dag er torsdag)
function getNextThursdayISO(): string {
  // Lokaltid i CPH
  const nowCph = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Copenhagen' }))
  const day = nowCph.getDay() // 0=søn ... 4=tors
  let addDays = (4 - day + 7) % 7
  if (addDays === 0) addDays = 7
  const nextThu = new Date(nowCph)
  nextThu.setDate(nowCph.getDate() + addDays)

  // Sikr CPH-dato ved at bygge en lokal dato (undgår UTC-afkortning over midnat)
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

export default function TorsdagStartside() {
  const [bruger, setBruger] = useState<Bruger | null>(null)
  const [loading, setLoading] = useState(true)
  const [tilmelding, setTilmelding] = useState<Tilmelding>(null)
  const [status, setStatus] = useState<'idle' | 'updating' | 'done' | 'editing'>('idle')

  const eventDato = useMemo(() => getNextThursdayISO(), [])
  const eventDatoTekst = useMemo(() => formatDanishDate(eventDato), [eventDato])

  const tider = ['17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00']

  useEffect(() => {
    const hentBruger = async () => {
      try {
        const { data: auth } = await supabase.auth.getUser()
        const user = auth?.user
        if (!user) {
          setLoading(false)
          return
        }

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('visningsnavn, torsdagspadel')
          .eq('id', user.id)
          .single()

        if (profileError || !profile?.torsdagspadel) {
          setLoading(false)
          return
        }

        setBruger(profile)

        // Hent evt. eksisterende tilmelding for NÆSTE torsdag
        const { data: tilmeldingData } = await supabase
          .from('event_signups')
          .select('kan_spille, tidligste_tid')
          .eq('user_id', user.id)
          .eq('event_dato', eventDato)
          .single()

        if (tilmeldingData) {
          setTilmelding(tilmeldingData as Tilmelding)
          setStatus('done')
        }
      } finally {
        setLoading(false)
      }
    }

    hentBruger()
    // eventDato er memoized; afhænger ikke af tid under sessionen
  }, [eventDato])

  const sendTilmelding = async (kanSpille: boolean, tidligsteTid?: string) => {
    setStatus('updating')
    const { data: auth } = await supabase.auth.getUser()
    const user = auth?.user
    if (!user || !bruger) return

    const payload = {
      user_id: user.id,
      visningsnavn: bruger.visningsnavn,
      event_dato: eventDato, // ← dynamisk næste torsdag
      kan_spille: kanSpille,
      tidligste_tid: kanSpille ? tidligsteTid ?? null : null,
    }

    const { error } = await supabase
      .from('event_signups')
      .upsert([payload], { onConflict: 'user_id, event_dato' }) // en pr. bruger pr. torsdag

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

  return (
    <main className="max-w-xl mx-auto p-8 text-gray-900 dark:text-white">
      <h1 className="text-3xl font-bold mb-6 text-center">
        💪 Torsdagspadel – velkommen, {bruger.visningsnavn}!
      </h1>

      {/* Tilmeldingssektion */}
      <div className="mb-8 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 p-4 rounded-xl">
        <h2 className="text-xl font-semibold mb-3 text-green-700 dark:text-green-300">
          📅 Kan du spille torsdag d. {eventDatoTekst}?
        </h2>

        {tilmelding && status !== 'updating' && status !== 'editing' ? (
          <>
            <p className="text-green-800 dark:text-green-200 mb-2">
              ✅ Du er registreret d. {eventDatoTekst}{' '}
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
          href="/torsdagspadel/events"
          className="bg-green-700 hover:bg-green-800 text-white font-semibold py-3 px-5 rounded-xl text-center shadow"
        >
          📅 Kommende Events
        </Link>
      </div>
    </main>
  )
}

