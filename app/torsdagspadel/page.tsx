'use client'
export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type Bruger = { visningsnavn: string; torsdagspadel: boolean }
type Tilmelding = { kan_spille: boolean; tidligste_tid?: string | null } | null

type EventRow = {
  id: string
  name: string | null
  date: string
  closed_group: boolean
}

// ——— Tidszone-sikre helpers ———
function nowInCopenhagen(): Date {
  try {
    return new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Copenhagen' }))
  } catch {
    return new Date()
  }
}

function getDanishWeekday(isoDate: string): string {
  const dt = new Date(`${isoDate}T00:00:00`)
  try {
    const weekday = dt.toLocaleDateString('da-DK', {
      weekday: 'long',
      timeZone: 'Europe/Copenhagen',
    })
    // Gør første bogstav stort (torsdag → Torsdag)
    return weekday.charAt(0).toUpperCase() + weekday.slice(1)
  } catch {
    const weekday = dt.toLocaleDateString('da-DK', { weekday: 'long' })
    return weekday.charAt(0).toUpperCase() + weekday.slice(1)
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
    ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
        d.getDate()
      ).padStart(2, '0')}`
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

  const [totalDKK, setTotalDKK] = useState<number>(0)

  const [events, setEvents] = useState<EventRow[]>([])
  const [tilmeldinger, setTilmeldinger] = useState<Record<string, Tilmelding>>({})
  const [savingDate, setSavingDate] = useState<string | null>(null)
  const [editingEventDate, setEditingEventDate] = useState<string | null>(null)

  // Kun brugt til teksten på "Se program"-knappen
  const [planDato, setPlanDato] = useState<string>('')

  // Standard og mulige tider
  const standardTid = '17:00'
  const tider = ['17:00', '17:30', '18:40', '20:20']

  const planDatoTekst = useMemo(
    () => (planDato ? formatDanishDate(planDato) : ''),
    [planDato]
  )

  // Sæt planDato (this/next torsdag) til program-linket
  useEffect(() => {
    const now = nowInCopenhagen()
    const nextThu = getNextThursdayISOFrom(now)
    const thisThu = getThisThursdayISOFrom(now)
    setPlanDato(thisThu ?? nextThu)
  }, [])

  useEffect(() => {
    const hentData = async () => {
      try {
        setLoading(true)

        const { data: auth } = await supabase.auth.getUser()
        const user = auth?.user
        if (!user) {
          setLoading(false)
          return
        }

        // Hent profil
        const profResp = await (supabase.from('profiles') as any)
          .select('visningsnavn, torsdagspadel')
          .eq('id', user.id)
          .maybeSingle()

        const profile = (profResp?.data ?? null) as {
          visningsnavn?: string
          torsdagspadel?: boolean
        } | null

        if (!profile?.torsdagspadel || !profile?.visningsnavn) {
          setLoading(false)
          return
        }

        setBruger({
          visningsnavn: profile.visningsnavn,
          torsdagspadel: !!profile.torsdagspadel,
        })

        // Hent bar-regnskab
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

        // Hent næste 4 lukkede torsdags-events
        const todayISO = new Date().toISOString().slice(0, 10)

        const eventsResp = await (supabase.from('events') as any)
          .select('id, name, date, closed_group')
          .eq('closed_group', true)
          .gte('date', todayISO)
          .order('date', { ascending: true })
          .limit(4)

        if (eventsResp?.error) {
          console.error('Fejl ved hentning af events:', eventsResp.error)
          setEvents([])
        } else {
          const rows = (eventsResp?.data ?? []) as EventRow[]
          setEvents(rows)

          // Hent eksisterende tilmeldinger til disse events
          const datoer = rows.map((e) => e.date)
          if (datoer.length > 0) {
            const tilmResp = await (supabase.from('event_signups') as any)
              .select('event_dato, kan_spille, tidligste_tid')
              .eq('visningsnavn', profile.visningsnavn)
              .in('event_dato', datoer)

            if (tilmResp?.error) {
              console.error('Fejl ved hentning af event_signups:', tilmResp.error)
            } else {
              const map: Record<string, Tilmelding> = {}
              for (const row of tilmResp.data ?? []) {
                map[row.event_dato] = {
                  kan_spille: !!row.kan_spille,
                  tidligste_tid: row.kan_spille
                    ? row.tidligste_tid ?? standardTid
                    : null,
                }
              }
              setTilmeldinger(map)
            }
          }
        }
      } finally {
        setLoading(false)
      }
    }

    hentData()
  }, [])

  const sendTilmelding = async (
    eventDato: string,
    kanSpille: boolean,
    tidligsteTid?: string
  ) => {
    if (!bruger) return
    setSavingDate(eventDato)

    const effektiveTid = kanSpille ? tidligsteTid || standardTid : null

    const payload = {
      visningsnavn: bruger.visningsnavn,
      event_dato: eventDato,
      kan_spille: kanSpille,
      tidligste_tid: effektiveTid,
    }

    const upResp = await (supabase.from('event_signups') as any).upsert(payload, {
      onConflict: 'visningsnavn,event_dato',
    })

    if (upResp?.error) {
      console.error('Fejl ved tilmelding:', upResp.error)
    } else {
      setTilmeldinger((prev) => ({
        ...prev,
        [eventDato]: { kan_spille: kanSpille, tidligste_tid: effektiveTid },
      }))
      // Luk edit-mode efter gem
      setEditingEventDate(null)
    }

    setSavingDate(null)
  }

  if (loading) {
    return <p className="text-center mt-10 text-gray-700 dark:text-white">Indlæser...</p>
  }

  if (!bruger) {
    return (
      <p className="text-center mt-10 text-gray-700 dark:text-white">
        Du har ikke adgang til denne side.
      </p>
    )
  }

  const totalLabel =
    totalDKK > 0 ? 'Du har til gode' : totalDKK < 0 ? 'Du skylder' : 'Alt i nul'

  const totalClass =
    totalDKK > 0
      ? 'text-green-700'
      : totalDKK < 0
      ? 'text-red-600'
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

      {/* Tilmelding til de næste 4 lukkede events */}
      <div className="mb-8 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 p-4 rounded-xl">
        <h2 className="text-xl font-semibold mb-3 text-green-700 dark:text-green-300">
          📅 Dine kommende torsdags-events
        </h2>

        {events.length === 0 && (
          <p className="text-sm text-green-900 dark:text-green-100">
            Der er endnu ikke oprettet kommende lukkede torsdags-events.
          </p>
        )}

        <div className="space-y-4">
          {events.map((event) => {
            const t = tilmeldinger[event.date]
            const isSaving = savingDate === event.date
            const isEditing = editingEventDate === event.date || !t

            const datoTekst = formatDanishDate(event.date)
const weekday = getDanishWeekday(event.date)
const eventNavn = event.name || 'Torsdagspadel'
const valgtTid = t?.tidligste_tid || standardTid


            return (
              <div
                key={event.id}
                className="rounded-lg border border-green-200 dark:border-green-800 bg-white/80 dark:bg-green-950/40 p-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                  <div>
                    <div className="text-sm font-semibold text-green-800 dark:text-green-100">
                      {eventNavn}
                    </div>
                    <div className="text-xs text-green-700/80 dark:text-green-200/80">
  {weekday} d. {datoTekst}
</div>

                  </div>
                  {t && !isEditing && (
                    <div className="text-xs text-green-900 dark:text-green-100 text-right">
                      {t.kan_spille ? (
                        <>
                          ✅ Du er tilmeldt – tidligst kl. {t.tidligste_tid || standardTid}
                        </>
                      ) : (
                        <>❌ Du har meldt afbud</>
                      )}
                    </div>
                  )}
                </div>

                {isEditing ? (
                  !t ? (
                    // Ingen tilmelding endnu → vis de to hovedvalg
                    <>
                      <div className="flex flex-col sm:flex-row gap-3">
                        <button
                          onClick={() => sendTilmelding(event.date, false)}
                          disabled={isSaving}
                          className="bg-red-600 hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed text-white px-4 py-2 rounded-xl font-semibold text-sm"
                        >
                          ❌ Kan ikke denne dag
                        </button>
                        <button
                          onClick={() => sendTilmelding(event.date, true, standardTid)}
                          disabled={isSaving}
                          className="bg-green-600 hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed text-white px-4 py-2 rounded-xl font-semibold text-sm"
                        >
                          ✅ Kan godt – start kl. {standardTid}
                        </button>
                      </div>
                      {isSaving && (
                        <p className="text-xs text-gray-600 mt-1">Gemmer tilmelding...</p>
                      )}
                    </>
                  ) : (
                    // Der findes en tilmelding → redigér tidspunkt eller meld afbud
                    <>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <button
                          onClick={() => sendTilmelding(event.date, false)}
                          disabled={isSaving}
                          className="bg-red-600 hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed text-white px-4 py-2 rounded-xl font-semibold text-sm"
                        >
                          ❌ Meld afbud
                        </button>

                        <div className="flex items-center gap-2">
                          <span className="text-xs text-green-900 dark:text-green-100">
                            Ændr tidligste starttid:
                          </span>
                          <select
                            value={valgtTid}
                            onChange={(e) =>
                              sendTilmelding(event.date, true, e.target.value)
                            }
                            disabled={isSaving}
                            className="bg-green-600 text-white font-semibold px-4 py-2 rounded-xl text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                            aria-label="Vælg tidligste starttid"
                          >
                            {tider.map((tid) => (
                              <option key={tid} value={tid}>
                                {tid}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      {isSaving && (
                        <p className="text-xs text-gray-600 mt-1">Gemmer ændringer...</p>
                      )}
                    </>
                  )
                ) : (
                  <button
                    onClick={() => setEditingEventDate(event.date)}
                    className="mt-1 text-xs text-green-700 underline hover:text-green-900 dark:text-green-200 dark:hover:text-green-50"
                  >
                    Rediger tilmelding
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Se program */}
      <div className="mb-8 border border-zinc-200 dark:border-zinc-700 rounded-xl p-4 bg-white dark:bg-zinc-900">
        <h2 className="text-xl font-semibold mb-2">
          📜 Se program – {planDatoTekst || 'kommende torsdag'}
        </h2>
        <p className="text-sm text-zinc-700 dark:text-zinc-300 mb-3">
          Her kan du se det fulde torsdagsprogram med alle kampe, baner og tider.
        </p>
        <Link
          href="/kommende"
          className="inline-flex items-center justify-center gap-2 bg-green-700 hover:bg-green-800 text-white font-semibold py-2 px-4 rounded-xl shadow text-sm"
        >
          📅 Gå til programmet
        </Link>
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

