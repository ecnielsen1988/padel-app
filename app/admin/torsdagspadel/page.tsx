'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type EventRow = {
  id: string
  name: string | null
  date: string // YYYY-MM-DD
  start_time: string | null
  end_time: string | null
  location: 'Helsinge' | 'Gilleleje' | string | null
  status: 'planned' | 'published' | 'ongoing' | 'done' | 'canceled' | null
  closed_group: boolean | null
}

const GREEN = '#0b6b3a'
const fmtTime = (t?: string | null) => (t ? t.slice(0, 5) : '')

export default function AdminTorsdagsPage() {
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [events, setEvents] = useState<EventRow[]>([])
  const [loadingEvents, setLoadingEvents] = useState(true)

  useEffect(() => {
    const run = async () => {
      try {
        const { data: auth } = await supabase.auth.getUser()
        const user = auth?.user
        if (!user) { setLoading(false); return }

        // Admin-check
        const jwtRole = (user as any)?.app_metadata?.rolle
        let admin = jwtRole === 'admin'

        if (!admin) {
          const { data: me } = await (supabase.from('profiles') as any)
            .select('id, rolle')
            .eq('id', user.id)
            .maybeSingle()
          if ((me as any)?.rolle === 'admin') admin = true
        }

        setIsAdmin(admin)
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [])

  // Hent torsdags-events (closed_group = true)
  useEffect(() => {
    const fetchEvents = async () => {
      setLoadingEvents(true)
      try {
        const { data, error } = await supabase
          .from('events')
          .select('id, name, date, start_time, end_time, location, status, closed_group')
          .eq('closed_group', true) // skift til 'closed_groups' hvis det er din DB-kolonne
          .order('date', { ascending: true })
          .order('start_time', { ascending: true })

        if (error) throw error
        setEvents((data ?? []) as EventRow[])
      } catch (e) {
        console.error(e)
        setEvents([])
      } finally {
        setLoadingEvents(false)
      }
    }
    fetchEvents()
  }, [])

  const { upcoming, past } = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    const up = (events || []).filter(e => e.date >= today)
      .sort((a, b) => (a.date === b.date
        ? (a.start_time ?? '') < (b.start_time ?? '') ? -1 : 1
        : a.date < b.date ? -1 : 1))

    const pa = (events || []).filter(e => e.date < today)
      .sort((a, b) => (a.date === b.date
        ? (a.start_time ?? '') > (b.start_time ?? '') ? -1 : 1
        : a.date > b.date ? -1 : 1))

    return { upcoming: up, past: pa }
  }, [events])

  if (loading) {
    return (
      <main className="max-w-2xl mx-auto p-8 text-gray-900 dark:text-white">
        <h1 className="text-3xl font-bold mb-6">Admin · Torsdagspadel</h1>
        <p>Indlæser…</p>
      </main>
    )
  }

  if (!isAdmin) {
    return (
      <main className="max-w-2xl mx-auto p-8 text-gray-900 dark:text-white">
        <h1 className="text-3xl font-bold mb-6">Admin · Torsdagspadel</h1>
        <p>Du har ikke adgang til denne side.</p>
        <div className="mt-4">
          <Link
            href="/admin"
            className="inline-block bg-green-700 hover:bg-green-800 text-white font-semibold py-2 px-4 rounded-lg"
          >
            ⬅ Tilbage til Admin
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="max-w-3xl mx-auto p-8 text-gray-900 dark:text-white">
      <h1 className="text-3xl font-bold mb-8 text-center">🟢 Admin · Torsdagspadel</h1>

      {/* Top-knapper */}
      <div className="grid gap-4 mb-8">
        <Link
          href="/admin/torsdagspadel/regnskab"
          className="bg-emerald-700 hover:bg-emerald-800 text-white font-semibold py-3 px-5 rounded-xl text-center shadow"
        >
          📊 Regnskab
        </Link>

        <Link
          href="/admin/torsdagspadel/tilmelding"
          className="bg-blue-700 hover:bg-blue-800 text-white font-semibold py-3 px-5 rounded-xl text-center shadow"
        >
          ✅ Tilmelding
        </Link>

        <Link
          href="/admin/torsdagspadel/besked"
          className="bg-pink-600 hover:bg-pink-700 text-white font-semibold py-3 px-5 rounded-xl text-center shadow"
        >
          📨 Fællesbesked
        </Link>
      </div>

      {/* Torsdags-events (closed_group = true) */}
      <section className="space-y-6">
        <h2 className="text-xl font-semibold">Torsdags-events</h2>

        {loadingEvents ? (
          <div className="opacity-70 text-sm">Indlæser events…</div>
        ) : events.length === 0 ? (
          <div className="opacity-70 text-sm">Ingen events fundet.</div>
        ) : (
          <>
            {/* Kommende */}
            {upcoming.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold mb-2">Kommende</h3>
                <ul className="space-y-2">
                  {upcoming.map(ev => (
                    <li key={ev.id} className="border rounded-lg p-3 bg-white/80 dark:bg-zinc-900/60 shadow-sm">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div>
                          <div className="font-medium">
                            {ev.date} · {fmtTime(ev.start_time)}–{fmtTime(ev.end_time)} · {ev.location}
                          </div>
                          <div className="text-sm opacity-80">{ev.name}</div>
                          {!!ev.status && (
                            <div className="text-xs mt-1 px-2 py-0.5 inline-block rounded-full text-white"
                              style={{ backgroundColor: GREEN }}>
                              {ev.status}
                            </div>
                          )}
                        </div>
                        <div className="shrink-0">
                          <Link
                            href={`/torsdagspadel/event/${ev.id}`}
                            className="inline-block px-3 py-2 rounded-md text-white"
                            style={{ backgroundColor: GREEN }}
                          >
                            Åbn event
                          </Link>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Tidligere */}
            {past.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold mb-2 mt-6">Tidligere</h3>
                <ul className="space-y-2">
                  {past.map(ev => (
                    <li key={ev.id} className="border rounded-lg p-3 bg-white/70 dark:bg-zinc-900/50">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div>
                          <div className="font-medium">
                            {ev.date} · {fmtTime(ev.start_time)}–{fmtTime(ev.end_time)} · {ev.location}
                          </div>
                          <div className="text-sm opacity-80">{ev.name}</div>
                          {!!ev.status && (
                            <div className="text-xs mt-1 px-2 py-0.5 inline-block rounded-full text-white"
                              style={{ backgroundColor: GREEN }}>
                              {ev.status}
                            </div>
                          )}
                        </div>
                        <div className="shrink-0">
                          <Link
                            href={`/torsdagspadel/event/${ev.id}`}
                            className="inline-block px-3 py-2 rounded-md border"
                            style={{ borderColor: GREEN, color: GREEN }}
                          >
                            Åbn event
                          </Link>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  )
}

