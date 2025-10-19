'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

/** Offentligt view (fallback til event_sets) */
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

type EventRow = {
  id: string | number
  name: string | null
  date: string | null
  start_time: string | null
  end_time: string | null
  location: string | null
  min_elo: number | null
  max_elo: number | null
  only_women: boolean | null
  closed_group: boolean | null
  signup_url?: string | null
}

export default function KommendeKampePage() {
  const [visningsnavn, setVisningsnavn] = useState<string | null>(null)
  const [isFemale, setIsFemale] = useState<boolean>(false)
  const [isTorsdagspadel, setIsTorsdagspadel] = useState<boolean>(false)

  const [elo, setElo] = useState<number | null>(null)

  const [mineSets, setMineSets] = useState<EventSet[]>([])
  const [alleUpcoming, setAlleUpcoming] = useState<EventSet[]>([])
  const [kommendeEvents, setKommendeEvents] = useState<EventRow[]>([])

  const [programOpen, setProgramOpen] = useState(false)
  const [programDato, setProgramDato] = useState<string | null>(null)
  const [programRows, setProgramRows] = useState<EventSet[]>([])
  const [programLoading, setProgramLoading] = useState(false)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
        // ===== 1) Auth + PROFIL (visningsnavn, torsdagspadel, koen) =====
        const { data: auth } = await supabase.auth.getUser()
        const user = auth?.user ?? null

        let navn: string | null = null
        let female = false
        let tors = false

        if (user) {
          // Cast .from(...) til any som i din rangliste for at undgå TS-issues
          const { data: prof, error: profErr } = await (supabase.from('profiles') as any)
            .select('visningsnavn, torsdagspadel, koen')
            .eq('id', user.id)
            .maybeSingle()

          if (profErr) throw profErr

          navn = toStr(prof?.visningsnavn)
          tors = !!prof?.torsdagspadel
          female = normKoen(prof?.koen) === 'kvinde'
        }

        setVisningsnavn(navn)
        setIsTorsdagspadel(tors)
        setIsFemale(female)

        // ===== 2) Elo: dynamisk fra /api/rangliste (samme model som din rangliste-side) =====
        let aktueltElo: number | null = null
        if (navn) {
          try {
            const res = await fetch('/api/rangliste', { cache: 'no-store' })
            const json = await res.json()

            // Din rangliste bruger en "ren liste", men vi understøtter også {data:[...]} fallback
            const maybeList = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : []
            const list: Array<{ visningsnavn: string; elo: number; koen?: string | null }> =
              maybeList
                .map((r: any) => ({
                  visningsnavn: toStr(r?.visningsnavn) ?? '',
                  elo: Number(r?.elo ?? r?.Elo ?? 0),
                  koen: r?.koen ?? null,
                }))
                .filter((r: any) => r.visningsnavn && Number.isFinite(r.elo))

            const me = list.find(
              (r) => r.visningsnavn.toLowerCase() === navn!.toLowerCase()
            )
            aktueltElo = me ? me.elo : null
          } catch { /* ignorer netværksfejl */ }
        }
        setElo(aktueltElo)

        // ===== 3) Programsatte sæt (public view → fallback event_sets) =====
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
          if (setsErr) throw setsErr
          rows = (setsData as EventSet[]) ?? []
        }
        setAlleUpcoming(rows)

        // ===== 4) Mine kampe (filtrér på visningsnavn) =====
        if (navn) {
          const mine = rows.filter((r) =>
            [r.holda1, r.holda2, r.holdb1, r.holdb2]
              .map((x) => (x || '').trim())
              .includes(navn!)
          )
          setMineSets(mine)
        } else {
          setMineSets([])
        }

        // ===== 5) Events (i dag → +14 dage) =====
        const toISO = plusDaysISO(todayISO, 14)
        const { data: eventsData, error: eventsErr } = await supabase
          .from('events')
          .select('id,name,date,start_time,end_time,location,min_elo,max_elo,only_women,closed_group,signup_url')
          .gte('date', todayISO)
          .lte('date', toISO)
          .order('date', { ascending: true })

        if (eventsErr) throw eventsErr
        setKommendeEvents((eventsData as EventRow[]) ?? [])
      } catch (e) {
        console.error(e)
        setError('Noget gik galt under indlæsning.')
      } finally {
        setLoading(false)
      }
    }
    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayISO])

  // Åbn modal med fuldt program for en given dato
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

  // Hjælpere til render
  const groupedMine = groupByDateAndMatch(mineSets)
  const mineDatoer = Array.from(groupedMine.keys()).sort()
  const hasProgramForDate = (isoDate: string) => alleUpcoming.some(r => r.event_dato === isoDate)
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

      <h1 className="text-3xl font-bold mb-2 text-center">📅 Kommende</h1>

      {/* Debug badge — valgfri (fjern hvis ikke ønsket) */}
      {visningsnavn && (
        <p className="text-center text-xs opacity-70 mb-4">
          {`Bruger: ${visningsnavn} · Køn: ${isFemale ? 'kvinde' : 'mand'} · Elo: ${elo ?? 'ikke fundet'}`}
        </p>
      )}

      {error && <p className="text-center text-red-600 mb-4">{error}</p>}

      {/* ===== Mine kampe ===== */}
      <section className="mb-10">
        <h2 className="text-2xl font-semibold mb-4">Mine kampe</h2>

        {visningsnavn && mineDatoer.length > 0 ? (
          mineDatoer.map((dato) => {
            const kampe = groupedMine.get(dato)!
            return (
              <div key={`mine-${dato}`} className="mb-6">
                <h3 className="text-xl font-semibold mb-3">
                  {formatDanishDate(dato)}
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
                {hasProgramForDate(dato) && (
                  <div className="mt-4">
                    <button type="button" onClick={() => visFuldtProgram(dato)}
                      className="inline-block px-3 py-1.5 rounded-full border-2 border-pink-500 text-pink-600 bg-white/90 dark:bg-[#2a2a2a]/90 shadow hover:bg-pink-50 dark:hover:bg-pink-900/20 transition">
                      📋 Fuldt program
                    </button>
                  </div>
                )}
              </div>
            )
          })
        ) : (
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
            <p className="text-zinc-700 dark:text-zinc-300">Ingen kommende kampe.</p>
            <p className="text-sm mt-1 text-zinc-600 dark:text-zinc-400">
              Tjek events nedenfor – “📋 Program” vises på de datoer, der har planlagte sæt.
            </p>
          </div>
        )}
      </section>

      {/* ===== Kommende events ===== */}
      <section>
        <h2 className="text-2xl font-semibold mb-4">Kommende events</h2>

        {kommendeEvents.length === 0 ? (
          <p className="text-zinc-600 dark:text-zinc-400">Ingen datoer at vise endnu.</p>
        ) : (
          <div className="space-y-3">
            {kommendeEvents.map((ev) => {
              if (!ev.date) return null
              const dato = ev.date
              const navn = (ev.name ?? '').toString().trim() || 'Event'

              const womenOnly = !!ev.only_women || /torsdagstøserne/i.test(navn)
              const closedGroup = !!ev.closed_group

              const minElo = numOrNull(ev.min_elo)
              const maxElo = numOrNull(ev.max_elo)
              const hasEloReq = minElo != null || maxElo != null

              // Elo-krav: hvis event har krav og Elo ukendt/udenfor range → ikke kvalificeret
              const eloOk = hasEloReq
                ? (elo != null)
                  && (minElo == null || (elo as number) >= minElo)
                  && (maxElo == null || (elo as number) <= maxElo)
                : true

              const membersOk = closedGroup ? isTorsdagspadel : true
              const womenOk = womenOnly ? isFemale : true
              const eligible = eloOk && membersOk && womenOk

              const hasProgram = hasProgramForDate(dato)

              const signupUrl =
                (ev as any).signup_url
                || (ev.location ? getSignupUrlByLocation(ev.location) : getSignupUrlByISODate(dato))

              const timeStr = [fmt(ev.start_time), fmt(ev.end_time)].filter(Boolean).join('–')
              const locationStr = ev.location ? ` · ${ev.location}` : ''

              const emoji = getEmojiForEvent({ requireMembers: closedGroup, womenOnly })

              return (
                <div
                  key={`ev-${ev.id}`}
                  className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3"
                >
                  {/* 1: Dato – tid – location */}
                  <div className="text-sm opacity-80">
                    {formatDanishDate(dato)}
                    {timeStr ? ` · ${timeStr}` : ''}
                    {locationStr}
                  </div>

                  {/* 2: Emoji · Navn · Emoji */}
                  <div className="text-base font-semibold my-1">
                    <span className="mr-1">{emoji}</span>
                    {navn}
                    <span className="ml-1">{emoji}</span>
                  </div>

                  {/* 3: Krav + CTA */}
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <div className="text-sm opacity-80">
                      {buildRequirementsText(minElo, maxElo, closedGroup, womenOnly)}
                    </div>

                    {hasProgram ? (
                      <button
                        type="button"
                        onClick={() => visFuldtProgram(dato)}
                        className="inline-flex items-center justify-center px-3 py-1.5 rounded-full border-2 border-pink-500 text-pink-600 bg-white/90 dark:bg-[#2a2a2a]/90 shadow hover:bg-pink-50 dark:hover:bg-pink-900/20 transition"
                        title="Se fuldt program"
                      >
                        📋 Program
                      </button>
                    ) : eligible ? (
                      <a
                        href={signupUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center px-3 py-1.5 rounded-full border-2 border-pink-500 text-pink-600 bg-white/90 dark:bg-[#2a2a2a]/90 shadow hover:bg-pink-50 dark:hover:bg-pink-900/20 transition"
                      >
                        Tilmelding ↗
                      </a>
                    ) : (
                      <span className="text-xs px-2 py-1 rounded-full border border-zinc-300 dark:border-zinc-700 opacity-70">
                        Ikke kvalificeret
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ===== Modal (📋 Program) ===== */}
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
function toStr(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s || null
}

function numOrNull(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string') {
    const p = parseFloat(v.replace(',', '.'))
    return Number.isFinite(p) ? p : null
  }
  return null
}

function normKoen(s?: string | null) {
  return (s ?? '').toString().trim().toLowerCase()
}

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

function plusDaysISO(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00+02:00`)
  d.setDate(d.getDate() + days)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
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

/** Signup links */
function getSignupUrlByLocation(location?: string | null): string {
  const loc = (location ?? '').toLowerCase()
  if (loc.includes('gilleleje')) return MATCHI_GILLELEJE
  if (loc.includes('helsinge')) return MATCHI_HELSINGE
  return MATCHI_HELSINGE
}

function getSignupUrlByISODate(isoDate: string): string {
  const day = new Date(`${isoDate}T00:00:00`).getDay()
  if (day === 3 || day === 0) return MATCHI_GILLELEJE
  if (day === 4 || day === 5) return MATCHI_HELSINGE
  return MATCHI_HELSINGE
}

// Emojis: 🍺 = “Kun for medlemmer”, 💃 = “Kun for kvinder”, ellers 🎾
function getEmojiForEvent(opts: { requireMembers: boolean; womenOnly: boolean }) {
  if (opts.womenOnly) return '💃'
  if (opts.requireMembers) return '🍺'
  return '🎾'
}

function buildRequirementsText(
  minElo: number | null,
  maxElo: number | null,
  requireMembers: boolean,
  womenOnly: boolean
) {
  const bits: string[] = []
  if (minElo != null || maxElo != null) {
    const lo = minElo ?? '…'
    const hi = maxElo ?? '…'
    bits.push(`${lo}–${hi} Elo`)
  }
  if (requireMembers) bits.push('Kun for medlemmer')
  if (womenOnly) bits.push('Kun for kvinder')
  return bits.join(' · ')
}

/** Gruppér helpers */
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

