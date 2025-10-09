'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

/** Offentligt view-navn (tilpas hvis nødvendigt) */
const PUBLIC_VIEW = 'publicerede_kampe'

/** Matchi-links */
const MATCHI_HELSINGE = 'https://www.matchi.se/facilities/PadelhusetHelsinge'
const MATCHI_GILLELEJE = 'https://www.matchi.se/facilities/padelhuset.dk'

/** Datatyper */
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

export default function KommendeKampePage() {
  const [visningsnavn, setVisningsnavn] = useState<string | null>(null)
  const [mineSets, setMineSets] = useState<EventSet[]>([])
  const [alleUpcoming, setAlleUpcoming] = useState<EventSet[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Modal
  const [programOpen, setProgramOpen] = useState(false)
  const [programDato, setProgramDato] = useState<string | null>(null)
  const [programRows, setProgramRows] = useState<EventSet[]>([])
  const [programLoading, setProgramLoading] = useState(false)

  const todayISO = useMemo(() => todayInCphISO(), [])

  // Lås scroll når modal er åben
  useEffect(() => {
    if (!programOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') lukProgram() }
    window.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey) }
  }, [programOpen])

  useEffect(() => {
    async function run() {
      setLoading(true)
      setError(null)
      try {
        // 1) Hent bruger + visningsnavn
        const { data: auth } = await supabase.auth.getUser()
        const user = auth?.user ?? null
        let navn = ''

        if (user) {
          navn = String(user.user_metadata?.visningsnavn ?? '').trim()
          if (!navn) {
            const { data: prof } = await supabase
              .from('profiles')
              .select('visningsnavn')
              .eq('id', user.id)
              .maybeSingle()
            const raw = (prof as { visningsnavn?: unknown } | null)?.visningsnavn
            if (typeof raw === 'string') navn = raw.trim()
          }
          setVisningsnavn(navn || null)
        } else {
          setVisningsnavn(null)
        }

        // 2) Hent publicerede sæt
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
            setMineSets([]); setAlleUpcoming([])
            return
          }
          rows = (setsData as EventSet[]) ?? []
        }

        setAlleUpcoming(rows)

        // 3) Filtrér mine (brug lokalt navn for at undgå race)
        if (user && navn) {
          const navnTilMatch = navn.trim()
          const mine = rows.filter((r) =>
            [r.holda1, r.holda2, r.holdb1, r.holdb2]
              .map((x) => (x || '').trim())
              .includes(navnTilMatch)
          )
          setMineSets(mine)
        } else {
          setMineSets([])
        }
      } finally {
        setLoading(false)
      }
    }
    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayISO])

  // Åbn modal med fuldt program
  async function visFuldtProgram(dato: string) {
    setProgramOpen(true)
    setProgramDato(dato)
    const cached = alleUpcoming.filter((r) => r.event_dato === dato)
    if (cached.length > 0) { setProgramRows(cached); return }

    setProgramLoading(true)
    try {
      let out: EventSet[] = []
      const { data: pubData, error: pubErr } = await supabase
        .from(PUBLIC_VIEW)
        .select('*')
        .eq('event_dato', dato)
        .order('kamp_nr', { ascending: true })
        .order('saet_nr', { ascending: true })
      if (!pubErr && pubData && pubData.length) out = pubData as EventSet[]
      else {
        const { data: setsData, error: setsErr } = await supabase
          .from('event_sets')
          .select('*')
          .eq('event_dato', dato)
          .order('kamp_nr', { ascending: true })
          .order('saet_nr', { ascending: true })
        if (setsErr) throw setsErr
        out = (setsData as EventSet[]) ?? []
      }
      setProgramRows(out)
    } catch {
      setProgramRows([])
    } finally {
      setProgramLoading(false)
    }
  }

  function lukProgram() { setProgramOpen(false); setProgramDato(null); setProgramRows([]) }
  function goBack() {
    if (typeof window !== 'undefined') {
      if (window.history.length > 1) window.history.back()
      else window.location.href = '/'
    }
  }

  // Gruppér
  const groupedMine = groupByDateAndMatch(mineSets)
  const mineDatoer = Array.from(groupedMine.keys()).sort()

  const groupedAlle = groupByDateAndMatch(alleUpcoming)
  const alleDatoer = Array.from(groupedAlle.keys()).sort()

  const programGroups = useMemo(() => groupByMatch(programRows), [programRows])

  // =============== RENDER =============== //
  if (loading) {
    return (
      <main className="max-w-xl mx-auto p-6 sm:p-8 text-gray-900 dark:text-white relative">
        <div className="fixed top-4 left-4 z-50">
          <button type="button" onClick={goBack}
            className="px-3 py-1.5 rounded-full border-2 border-pink-500 text-pink-600 bg-white/90 dark:bg-[#2a2a2a]/90 shadow hover:bg-pink-50 dark:hover:bg-pink-900/20 transition">
            ← Tilbage
          </button>
        </div>
        <p className="text-center text-zinc-600 dark:text-zinc-300">Indlæser kommende kampe...</p>
      </main>
    )
  }

  return (
    <main className="max-w-xl mx-auto p-6 sm:p-8 text-gray-900 dark:text-white relative">
      {/* ← Tilbage */}
      <div className="fixed top-4 left-4 z-50">
        <button type="button" onClick={goBack}
          className="px-3 py-1.5 rounded-full border-2 border-pink-500 text-pink-600 bg-white/90 dark:bg-[#2a2a2a]/90 shadow hover:bg-pink-50 dark:hover:bg-pink-900/20 transition">
          ← Tilbage
        </button>
      </div>

      <h1 className="text-3xl font-bold mb-6 text-center">📅 Kommende kampe</h1>
      {error && <p className="text-center text-red-600 mb-4">{error}</p>}

      {/* ===== Mine kampe ===== */}
      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-4">Mine kampe</h2>

        {visningsnavn && mineDatoer.length > 0 ? (
          mineDatoer.map((dato) => {
            const kampe = groupedMine.get(dato)!
            const metaForDag = getEventMetaByISODate(dato)
            return (
              <div key={`mine-${dato}`} className="mb-6">
                <h3 className="text-xl font-semibold mb-3">
                  {formatDanishDate(dato)} · {metaForDag.titleWithEmoji}
                </h3>
                <div className="space-y-4">
                  {Array.from(kampe.keys()).map((kampKey) => {
                    const sets = kampe.get(kampKey)!
                    const meta = sets[0]
                    return (
                      <div key={kampKey}
                        className="rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 p-4 shadow-sm">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-semibold">Kamp #{meta.kamp_nr}</h4>
                          <div className="text-sm">🏟 {meta.bane} · ⏱ {fmt(meta.starttid)}–{fmt(meta.sluttid)}</div>
                        </div>
                        <div className="space-y-1 text-sm">
                          {sets.map((r) => (
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

                <div className="mt-4">
                  <button type="button" onClick={() => visFuldtProgram(dato)}
                    className="inline-block px-3 py-1.5 rounded-full border-2 border-pink-500 text-pink-600 bg-white/90 dark:bg-[#2a2a2a]/90 shadow hover:bg-pink-50 dark:hover:bg-pink-900/20 transition">
                    📋 Fuldt program
                  </button>
                </div>
              </div>
            )
          })
        ) : (
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
            <p className="text-zinc-700 dark:text-zinc-300">Ingen kommende kampe.</p>
            <p className="text-sm mt-1 text-zinc-600 dark:text-zinc-400">
              Hold øje med de programsatte kampe nedenfor.
            </p>
          </div>
        )}
      </section>

      {/* ===== Programsatte kampe (offentlige) ===== */}
      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-4">Programsatte kampe</h2>

        {alleDatoer.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
            <p className="text-zinc-700 dark:text-zinc-300">Der er endnu ikke publiceret nogle kommende kampe.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {alleDatoer.map((dato) => {
              const meta = getEventMetaByISODate(dato)
              return (
                <div key={`offentlig-${dato}`}
                  className="flex items-center justify-between rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-3">
                  <div className="font-medium">
                    {formatDanishDate(dato)} · {meta.titleWithEmoji}
                  </div>
                  <button type="button" onClick={() => visFuldtProgram(dato)}
                    className="px-3 py-1.5 rounded-full border-2 border-pink-500 text-pink-600 bg-white/90 dark:bg-[#2a2a2a]/90 shadow hover:bg-pink-50 dark:hover:bg-pink-900/20 transition"
                    title={`Se programmet for ${formatDanishDate(dato)}`}>
                    📋 Se program
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ===== Kommende events (med niveau + tilmelding) ===== */}
      <section>
        <h2 className="text-2xl font-semibold mb-4">Kommende events</h2>
        {alleDatoer.length === 0 ? (
          <p className="text-zinc-600 dark:text-zinc-400">Ingen datoer at vise endnu.</p>
        ) : (
          <div className="space-y-2">
            {/* Vis fx de næste 8 datoer */}
            {alleDatoer.slice(0, 8).map((dato) => {
              const meta = getEventMetaByISODate(dato)
              const signupUrl = getSignupUrlByISODate(dato)
              return (
                <div key={`meta-${dato}`} className="rounded-lg border border-zinc-200 dark:border-zinc-800 px-3 py-2 bg-white dark:bg-zinc-900">
                  <div className="font-medium mb-1">
                    {formatDanishDate(dato)} · {meta.titleWithEmoji}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm opacity-80">{meta.levelText}</div>
                    <a
                      href={signupUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center px-3 py-1.5 rounded-full border-2 border-pink-500 text-pink-600 bg-white/90 dark:bg-[#2a2a2a]/90 shadow hover:bg-pink-50 dark:hover:bg-pink-900/20 transition"
                    >
                      Tilmelding ↗
                    </a>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ===== Modal ===== */}
      {programOpen && (
        <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-stretch sm:items-center justify-center p-4 sm:p-6"
          onClick={(e) => { if (e.target === e.currentTarget) lukProgram() }}>
          <div
            className="w-full sm:max-w-2xl bg-white dark:bg-[#2a2a2a] shadow-xl border border-pink-200 dark:border-pink-900/40 rounded-none sm:rounded-2xl flex flex-col min-h-0 h-full sm:h-auto max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
            role="dialog" aria-modal="true" aria-label="Fuldt program"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
              <h3 className="text-lg font-semibold">📋 Fuldt program — {programDato ? formatDanishDate(programDato) : ''}</h3>
              <button onClick={lukProgram}
                className="px-2 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                aria-label="Luk" title="Luk">✕</button>
            </div>

            <div className="flex-1 min-h-0 px-4 py-3 overflow-y-auto overscroll-contain"
              style={{ WebkitOverflowScrolling: 'touch' as unknown as undefined }}>
              {programLoading ? (
                <p className="text-center text-zinc-600 dark:text-zinc-300">Indlæser…</p>
              ) : programRows.length === 0 ? (
                <p className="text-center text-zinc-600 dark:text-zinc-300">Der er ingen planlagte kampe for denne dato.</p>
              ) : (
                <div className="space-y-3">
                  {Array.from(programGroups.entries()).map(([kampKey, sets]) => {
                    const meta = sets[0]
                    return (
                      <div key={kampKey}
                        className="rounded-xl px-4 py-3 shadow bg-white dark:bg-[#232323] border border-zinc-200 dark:border-zinc-800">
                        <div className="flex items-center justify-between mb-1.5 text-sm">
                          <div className="font-semibold">Kamp #{meta.kamp_nr}</div>
                          <div className="opacity-80">🏟 {meta.bane} · ⏱ {fmt(meta.starttid)}–{fmt(meta.sluttid)}</div>
                        </div>
                        <div className="space-y-1 text-sm">
                          {sets.map((r) => (
                            <div key={r.saet_nr} className="flex items-start gap-2">
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

            <div className="px-4 py-3 border-t border-zinc-200 dark:border-zinc-800 flex justify-end">
              <button onClick={lukProgram}
                className="px-3 py-1.5 rounded-full border-2 border-pink-500 text-pink-600 bg-white/90 dark:bg-[#2a2a2a]/90 shadow hover:bg-pink-50 dark:hover:bg-pink-900/20 transition">
                Luk
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

/* ===================== Hjælpere ===================== */
function fmt(t?: string | null) {
  if (!t) return ''
  return t.slice(0, 5)
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

/** Ugedag → event-navn + emoji + niveau-tekst */
function getEventMetaByISODate(isoDate: string): {
  title: string; emoji: string; titleWithEmoji: string; levelText: string
} {
  // JS: 0=Sunday, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
  const day = new Date(`${isoDate}T00:00:00`).getDay()
  if (day === 3) { // Onsdag
    const title = 'Onsdags Mix & Match'
    const emoji = '🎾'
    return { title, emoji, titleWithEmoji: `${title} ${emoji}`, levelText: '750–1750 Elo' }
  }
  if (day === 4) { // Torsdag
    const title = 'TorsdagsBold & Bajere'
    const emoji = '🍻'
    return { title, emoji, titleWithEmoji: `${title} ${emoji}`, levelText: 'Lukket gruppe' }
  }
  if (day === 5) { // Fredag
    const title = 'Fredags Fun & Fairplay'
    const emoji = '🎉'
    return { title, emoji, titleWithEmoji: `${title} ${emoji}`, levelText: 'Pop-up · varierende niveau' }
  }
  if (day === 0) { // Søndag
    const title = 'Sunday Socials'
    const emoji = '☀️'
    return { title, emoji, titleWithEmoji: `${title} ${emoji}`, levelText: 'For alle' }
  }
  const title = 'Event'
  const emoji = '🏟'
  return { title, emoji, titleWithEmoji: `${title} ${emoji}`, levelText: '' }
}

/** Ugedag → korrekt tilmeldingslink */
function getSignupUrlByISODate(isoDate: string): string {
  const day = new Date(`${isoDate}T00:00:00`).getDay()
  // Ons (3) & Søn (0) → Gilleleje
  if (day === 3 || day === 0) return MATCHI_GILLELEJE
  // Tor (4) & Fre (5) → Helsinge
  if (day === 4 || day === 5) return MATCHI_HELSINGE
  // Default fallback
  return MATCHI_HELSINGE
}

/** Map<dato, Map<kampKey, EventSet[]>> */
function groupByDateAndMatch(rows: EventSet[]) {
  const byDate = new Map<string, Map<string, EventSet[]>>()
  for (const r of rows) {
    const dateKey = r.event_dato
    const kampKey = `${r.event_dato}#${r.kamp_nr}`
    if (!byDate.has(dateKey)) byDate.set(dateKey, new Map())
    const inner = byDate.get(dateKey)!
    if (!inner.has(kampKey)) inner.set(kampKey, [])
    inner.get(kampKey)!.push(r)
  }
  for (const [, map] of byDate) {
    for (const [k, arr] of map) {
      arr.sort((a, b) => a.saet_nr - b.saet_nr)
      map.set(k, arr)
    }
  }
  return byDate
}

/** Map<kampKey, EventSet[]> */
function groupByMatch(rows: EventSet[]) {
  const map = new Map<string, EventSet[]>()
  for (const r of rows) {
    const key = `${r.event_dato}#${r.kamp_nr}`
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(r)
  }
  for (const [k, arr] of map) {
    arr.sort((a, b) => a.saet_nr - b.saet_nr)
    map.set(k, arr)
  }
  return map
}

