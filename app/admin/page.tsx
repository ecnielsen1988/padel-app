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

type GroupKind = 'weekly' | 'monthly' | 'custom'

function fmtTime(t?: string | null) {
  if (!t) return ''
  return t.slice(0, 5) // 'HH:MM' eller 'HH:MM:SS' → 'HH:MM'
}

export default function AdminHomePage() {
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [events, setEvents] = useState<UiEvent[]>([])

  // --- NY: state til "Skriv til torsdagspadel" ---
  const [writeOpen, setWriteOpen] = useState(false)
  const [gmLoading, setGmLoading] = useState(false)
  const [gmKind, setGmKind] = useState<GroupKind>('weekly')
  const [gmTitle, setGmTitle] = useState('')
  const [gmBody, setGmBody] = useState('')

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

  // --- NY: helpers til skrivepanelet ---
  async function fetchDraft(kind: Extract<GroupKind, 'weekly' | 'monthly'>) {
    setGmLoading(true)
    try {
      const res = await fetch('/api/groupmessage/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind }),
      })
      const data = await res.json()
      if (data?.ok) {
        setGmKind(kind)
        setGmTitle(data.title || '')
        setGmBody(data.body || '')
      } else {
        alert(data?.error || 'Kunne ikke hente udkast')
      }
    } catch (err: any) {
      alert(err?.message || 'Uventet fejl ved generering')
    } finally {
      setGmLoading(false)
    }
  }

  async function sendGroupMessage() {
    if (!gmTitle || !gmBody) {
      alert('Titel og besked skal udfyldes.')
      return
    }
    setGmLoading(true)
    try {
      const res = await fetch('/api/groupmessage/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: gmTitle, body: gmBody, kind: gmKind }),
      })
      const data = await res.json()
      if (data?.ok) {
        alert('Besked sendt ✅')
        setGmTitle('')
        setGmBody('')
        setGmKind('weekly')
      } else {
        alert(data?.error || 'Der opstod en fejl ved afsendelse')
      }
    } catch (err: any) {
      alert(err?.message || 'Uventet fejl ved afsendelse')
    } finally {
      setGmLoading(false)
    }
  }

  function MarkdownPreview({ body }: { body: string }) {
    // Meget simpel "preview": ### = h3, "- " = bullet, ellers p
    const lines = body.split('\n')
    return (
      <article className="mt-2 text-sm leading-6">
        {lines.map((line, i) => {
          if (line.startsWith('### ')) {
            return <h3 key={i} className="text-base font-semibold mt-3">{line.replace('### ', '')}</h3>
          }
          if (line.startsWith('- ')) {
            return <li key={i} className="ml-6 list-disc">{line.replace('- ', '')}</li>
          }
          if (line.trim() === '') return <div key={i} className="h-2" />
          return <p key={i} className="mt-1">{line}</p>
        })}
      </article>
    )
  }

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

        {/* Link til Admin · Event */}
        <Link
          href="/admin/event"
          className="bg-zinc-800 hover:bg-zinc-900 text-white font-semibold py-3 px-5 rounded-xl text-center shadow"
        >
          📅 Admin · Event
        </Link>
      </div>

      {/* NY: Skriv til torsdagspadel */}
      <section className="mb-10">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-semibold">📝 Skriv til torsdagspadel</h2>
          <button
            onClick={() => setWriteOpen(v => !v)}
            className="bg-pink-600 hover:bg-pink-700 text-white font-semibold py-2 px-4 rounded-lg"
          >
            {writeOpen ? 'Luk' : 'Åbn'} skrivepanel
          </button>
        </div>

        {writeOpen && (
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => fetchDraft('weekly')}
                disabled={gmLoading}
                className="rounded-lg bg-pink-600 text-white px-3 py-2"
              >
                ✨ Hent ugemail
              </button>
              <button
                onClick={() => fetchDraft('monthly')}
                disabled={gmLoading}
                className="rounded-lg border px-3 py-2"
              >
                📅 Hent månedsmail
              </button>
              <button
                onClick={sendGroupMessage}
                disabled={gmLoading || !gmTitle || !gmBody}
                className="rounded-lg bg-black text-white px-3 py-2"
              >
                📤 Send som besked
              </button>
            </div>

            <div className="grid gap-3">
              <input
                className="w-full rounded-md border px-3 py-2"
                placeholder="Titel"
                value={gmTitle}
                onChange={(e) => setGmTitle(e.target.value)}
              />
              <div className="grid md:grid-cols-2 gap-3">
                <textarea
                  className="w-full h-64 rounded-md border px-3 py-2 font-mono text-sm"
                  placeholder="Markdown-indhold"
                  value={gmBody}
                  onChange={(e) => setGmBody(e.target.value)}
                />
                <div className="w-full h-64 rounded-md border p-3 overflow-auto">
                  <MarkdownPreview body={gmBody} />
                </div>
              </div>
              <p className="text-xs opacity-70">
                Bemærk: Dette sender en <strong>besked</strong> i systemet (ikke e-mail) til spillere med <code>torsdagspadel = true</code>.
              </p>
              <div className="flex items-center gap-2 text-xs opacity-70">
                <span>Type:</span>
                <code className="px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800">{gmKind}</code>
              </div>
              <div className="flex gap-2 text-sm">
                <Link href="/torsdagspadel/beskeder" className="underline">Se seneste gruppebeskeder</Link>
              </div>
            </div>
          </div>
        )}
      </section>

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
