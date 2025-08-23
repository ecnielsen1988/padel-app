'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

// Hvis jeres publicerede plan ligger i et view/tabellen med et andet navn,
// så skift 'PUBLIC_VIEW' til det rigtige navn.
const PUBLIC_VIEW = 'publicerede_kampe'

// Datatyper (tilpas evt. feltnavne/casing til jeres DB)
type EventSet = {
  id: number
  event_dato: string // 'YYYY-MM-DD'
  kamp_nr: number
  saet_nr: number
  bane: string
  starttid: string // 'HH:MM' eller 'HH:MM:SS'
  sluttid: string  // 'HH:MM' eller 'HH:MM:SS'
  holda1: string
  holda2: string
  holdb1: string
  holdb2: string
}

export default function KommendeKampePage() {
  const [visningsnavn, setVisningsnavn] = useState<string | null>(null)
  const [mineSets, setMineSets] = useState<EventSet[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const todayISO = useMemo(() => todayInCphISO(), [])

  useEffect(() => {
    async function run() {
      setLoading(true)
      setError(null)
      try {
        // 1) Hent bruger + visningsnavn (metadata -> fallback profiles)
        const { data: auth } = await supabase.auth.getUser()
        const user = auth?.user
        if (!user) {
          setVisningsnavn(null)
          setMineSets([])
          return
        }
        let navn = (user.user_metadata?.visningsnavn || '').trim()
        if (!navn) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('visningsnavn')
            .eq('id', user.id)
            .maybeSingle()
          navn = (profile?.visningsnavn || '').trim()
        }
        setVisningsnavn(navn || null)

        // 2) Hent alle KOMMENDE (fra i dag og frem) publicerede sæt
        //    Forsøg først i publiceret view; fald tilbage til event_sets
        let rows: EventSet[] = []

        const { data: pubData, error: pubErr } = await supabase
          .from(PUBLIC_VIEW)
          .select('*')
          .gte('event_dato', todayISO)
          .order('event_dato', { ascending: true })
          .order('kamp_nr', { ascending: true })
          .order('saet_nr', { ascending: true })

        if (!pubErr && pubData && pubData.length > 0) {
          rows = pubData as EventSet[]
        } else {
          const { data: setsData, error: setsErr } = await supabase
            .from('event_sets')
            .select('*')
            .gte('event_dato', todayISO)
            .order('event_dato', { ascending: true })
            .order('kamp_nr', { ascending: true })
            .order('saet_nr', { ascending: true })

          if (setsErr) {
            setError('Kunne ikke hente kommende kampe.')
            setMineSets([])
            return
          }
          rows = (setsData as EventSet[]) ?? []
        }

        const n = (navn || '').trim()
        const mine = rows.filter((r) =>
          r.holda1?.trim() === n ||
          r.holda2?.trim() === n ||
          r.holdb1?.trim() === n ||
          r.holdb2?.trim() === n
        )

        setMineSets(mine)
      } finally {
        setLoading(false)
      }
    }

    run()
  }, [todayISO])

  // =============== RENDER =============== //
  if (loading) {
    return (
      <main className="max-w-xl mx-auto p-6 sm:p-8 text-gray-900 dark:text-white">
        <p className="text-center text-zinc-600 dark:text-zinc-300">Indlæser kommende kampe...</p>
      </main>
    )
  }

  if (!visningsnavn) {
    return (
      <main className="max-w-xl mx-auto p-6 sm:p-8 text-gray-900 dark:text-white">
        <h1 className="text-3xl font-bold mb-4 text-center">📅 Kommende kampe</h1>
        <p className="text-center text-zinc-600 dark:text-zinc-300">
          Du skal være logget ind for at se dine kommende kampe.
        </p>
      </main>
    )
  }

  // Gruppér pr. dato og pr. kamp
  const grouped = groupByDateAndMatch(mineSets)
  const dates = Array.from(grouped.keys()).sort() // stigende dato (viser fx søndag og torsdag)

  return (
    <main className="max-w-xl mx-auto p-6 sm:p-8 text-gray-900 dark:text-white">
      <h1 className="text-3xl font-bold mb-6 text-center">📅 Kommende kampe</h1>

      {dates.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
          <p className="text-zinc-700 dark:text-zinc-300">Ingen kommende kampe fundet for dig.</p>
          <p className="text-sm mt-1 text-zinc-600 dark:text-zinc-400">
            Enten er planerne ikke publiceret endnu, eller også er du ikke sat på kommende events.
          </p>
        </div>
      ) : (
        dates.map((dato) => {
          const kampe = grouped.get(dato)!
          return (
            <section key={dato} className="mb-8">
              <h2 className="text-xl font-semibold mb-3">{formatDanishDate(dato)}</h2>

              <div className="space-y-4">
                {Array.from(kampe.keys()).map((kampKey) => {
                  const sets = kampe.get(kampKey)!
                  const meta = sets[0]
                  return (
                    <div
                      key={kampKey}
                      className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 p-4 shadow-sm"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold">Kamp #{meta.kamp_nr}</h3>
                        <div className="text-sm">
                          🏟 {meta.bane} · ⏱ {fmt(meta.starttid)}–{fmt(meta.sluttid)}
                        </div>
                      </div>

                      <div className="space-y-1 text-sm">
                        {sets.map((r) => (
                          <div key={r.saet_nr} className="flex items-start gap-3">
                            <span className="font-medium shrink-0">Sæt {r.saet_nr}:</span>
                            <span className="leading-tight break-words text-left">
                              {r.holda1} & {r.holda2} <span className="opacity-60">vs</span>
                              <br />
                              {r.holdb1} & {r.holdb2}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })
      )}
    </main>
  )
}

// ===================== Hjælpere ===================== //
function fmt(t?: string | null) {
  if (!t) return ''
  return t.slice(0, 5) // 'HH:MM:SS' -> 'HH:MM'
}

function todayInCphISO(): string {
  const nowCph = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Copenhagen' }))
  const yyyy = nowCph.getFullYear()
  const mm = String(nowCph.getMonth() + 1).padStart(2, '0')
  const dd = String(nowCph.getDate()).padStart(2, '0')
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

function groupByDateAndMatch(rows: EventSet[]) {
  // Struktur: Map<dato, Map<kampKey, EventSet[]>>
  const byDate = new Map<string, Map<string, EventSet[]>>()
  for (const r of rows) {
    const dateKey = r.event_dato
    const kampKey = `${r.event_dato}#${r.kamp_nr}`
    if (!byDate.has(dateKey)) byDate.set(dateKey, new Map())
    const inner = byDate.get(dateKey)!
    if (!inner.has(kampKey)) inner.set(kampKey, [])
    inner.get(kampKey)!.push(r)
  }

  // Sørg for sæt er sorteret efter saet_nr
  for (const [, map] of byDate) {
    for (const [k, arr] of map) {
      arr.sort((a, b) => a.saet_nr - b.saet_nr)
      map.set(k, arr)
    }
  }

  return byDate
}

