'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type AdminFlag = { isAdmin: boolean }
type EventFromEvents = { id: number; event_dato: string; title?: string | null; published?: boolean | null }
type EventSetRow = { event_dato: string; bane?: string | null; starttid?: string | null; sluttid?: string | null }

type UiEvent = {
  event_dato: string
  title?: string
  source: 'events' | 'event_sets'
  courts?: number
  timeRange?: string
}

function fmtTime(t?: string | null) {
  if (!t) return ''
  // 'HH:MM' eller 'HH:MM:SS' → 'HH:MM'
  return t.slice(0, 5)
}

export default function AdminHomePage() {
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [events, setEvents] = useState<UiEvent[]>([])

  useEffect(() => {
    const run = async () => {
      try {
        // Auth
        const { data: auth } = await supabase.auth.getUser()
        const user = auth?.user
        if (!user) { setLoading(false); return }

        // Admin check (JWT eller profiles)
        const jwtRole = (user.app_metadata as any)?.rolle
        let admin = jwtRole === 'admin'
        const { data: me } = await supabase
          .from('profiles')
          .select('id, rolle')
          .eq('id', user.id)
          .single()
        if (!admin && me?.rolle === 'admin') admin = true
        setIsAdmin(admin)
        if (!admin) { setLoading(false); return }

        // 1) Forsøg fra 'events' (published=true)
        let uiEvents: UiEvent[] = []
        const { data: evs, error: evErr } = await supabase
          .from('events')
          .select('id, event_dato, title, published')
          .eq('published', true)
          .order('event_dato', { ascending: false })

        if (!evErr && Array.isArray(evs) && evs.length > 0) {
          uiEvents = (evs as EventFromEvents[]).map(e => ({
            event_dato: e.event_dato,
            title: e.title ?? undefined,
            source: 'events' as const,
          }))
        } else {
          // 2) Fallback: afled publicerede events ud fra 'event_sets'
          const { data: setRows, error: setErr } = await supabase
            .from('event_sets')
            .select('event_dato, bane, starttid, sluttid')
            .order('event_dato', { ascending: false })

          if (!setErr && Array.isArray(setRows) && setRows.length > 0) {
            const byDate = new Map<string, EventSetRow[]>()
            ;(setRows as EventSetRow[]).forEach(r => {
              if (!r.event_dato) return
              if (!byDate.has(r.event_dato)) byDate.set(r.event_dato, [])
              byDate.get(r.event_dato)!.push(r)
            })

            uiEvents = Array.from(byDate.entries()).map(([date, rows]) => {
              // antal baner (distinct)
              const courts = Array.from(new Set(rows.map(r => (r.bane ?? '').trim()).filter(Boolean))).length
              // tidsinterval
              const starts = rows.map(r => r.starttid ?? '').filter(Boolean).sort()
              const ends   = rows.map(r => r.sluttid ?? '').filter(Boolean).sort()
              const startMin = starts[0]
              const endMax   = ends[ends.length - 1]
              const timeRange = (startMin && endMax) ? `${fmtTime(startMin)}–${fmtTime(endMax)}` : undefined
              return {
                event_dato: date,
                title: undefined,
                source: 'event_sets' as const,
                courts: courts || undefined,
                timeRange,
              }
            })

            // sortér nyeste først
            uiEvents.sort((a, b) => (a.event_dato < b.event_dato ? 1 : -1))
          }
        }

        setEvents(uiEvents)
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [])

  if (loading) {
    return (
      <main className="max-w-2xl mx-auto p-8 text-gray-900 dark:text-white">
        <h1 className="text-3xl font-bold mb-6">Admin</h1>
        <p>Indlæser…</p>
      </main>
    )
  }

  if (!isAdmin) {
    return (
      <main className="max-w-2xl mx-auto p-8 text-gray-900 dark:text-white">
        <h1 className="text-3xl font-bold mb-6">Admin</h1>
        <p>Du har ikke adgang til denne side.</p>
        <div className="mt-4">
          <Link href="/torsdagspadel" className="inline-block bg-green-700 hover:bg-green-800 text-white font-semibold py-2 px-4 rounded-lg">
            ⬅ Tilbage til Torsdagspadel
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="max-w-2xl mx-auto p-8 text-gray-900 dark:text-white">
      <h1 className="text-3xl font-bold mb-6 text-center">⛳ Admin</h1>

      {/* Hurtige links */}
      <div className="grid gap-4 mb-8">
        <Link
          href="/admin/regnskab"
          className="bg-green-700 hover:bg-green-800 text-white font-semibold py-3 px-5 rounded-xl text-center shadow"
        >
          💸 Admin · Regnskab
        </Link>

         {/* NY: Link til Admin · Event */}
  <Link
    href="/admin/event"
    className="bg-zinc-800 hover:bg-zinc-900 text-white font-semibold py-3 px-5 rounded-xl text-center shadow"
  >
    📅 Admin · Event
  </Link>
  
        {/* Tilpas/udvid gerne flere admin-links her */}
      </div>

      {/* Publicerede events */}
      <div className="mb-3">
        <h2 className="text-xl font-semibold">📅 Publicerede events</h2>
        <p className="text-sm opacity-70">
          Viser enten <code>events(published=true)</code> eller distinct datoer fra <code>event_sets</code>.
        </p>
      </div>

      {events.length === 0 ? (
        <div className="text-sm text-gray-700 dark:text-gray-300">
          Ingen publicerede events fundet.
        </div>
      ) : (
        <ul className="space-y-3">
          {events.map((e) => (
            <li key={`${e.source}-${e.event_dato}`} className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm opacity-70">{e.source === 'events' ? 'events' : 'event_sets'}</div>
                  <div className="text-lg font-semibold">
                    {new Date(`${e.event_dato}T00:00:00`).toLocaleDateString('da-DK', {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric',
                      timeZone: 'Europe/Copenhagen',
                    })}
                  </div>
                  {e.title && <div className="opacity-80">{e.title}</div>}
                  {(e.courts || e.timeRange) && (
                    <div className="text-sm opacity-80 mt-1">
                      {e.courts ? `Baner: ${e.courts}` : ''}{e.courts && e.timeRange ? ' · ' : ''}{e.timeRange ?? ''}
                    </div>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <Link
                    href={`/event?date=${encodeURIComponent(e.event_dato)}`}
                    className="inline-block bg-green-700 hover:bg-green-800 text-white font-semibold py-2 px-3 rounded-lg"
                  >
                    Se event
                  </Link>
                  {/* Hvis du har en rediger-side (fx /lavevent), så drop knappen nedenfor ind */}
                  <Link
                    href={`/lavevent?date=${encodeURIComponent(e.event_dato)}`}
                    className="inline-block bg-zinc-800 hover:bg-zinc-900 text-white font-semibold py-2 px-3 rounded-lg"
                  >
                    Redigér
                  </Link>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-8">
        <Link
          href="/torsdagspadel"
          className="inline-block bg-green-700 hover:bg-green-800 text-white font-semibold py-2 px-4 rounded-lg"
        >
          ⬅ Tilbage til Torsdagspadel
        </Link>
      </div>
    </main>
  )
}

