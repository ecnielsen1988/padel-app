'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

/** Matchi-links */
const MATCHI_HELSINGE = 'https://www.matchi.se/facilities/PadelhusetHelsinge'
const MATCHI_GILLELEJE = 'https://www.matchi.se/facilities/padelhuset.dk'

/* ======================== Typer ======================== */
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
  status?: string | null
}

type EventResultRow = {
  event_id: string | number
  group_index: number
  set_index: number
  court_label: string | null
  start_time: string | null
  end_time: string | null
  holdA1: string | null
  holdA2: string | null
  holdB1: string | null
  holdB2: string | null
  scoreA: number | null
  scoreB: number | null
  tiebreak: boolean | null
}

/** Render-type (for både "Mine" og "Program") */
type EventSet = {
  id: string
  event_id: string | number
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
  const [isFemale, setIsFemale] = useState<boolean>(false)
  const [isTorsdagspadel, setIsTorsdagspadel] = useState<boolean>(false)

  const [elo, setElo] = useState<number | null>(null)

  const [mineSets, setMineSets] = useState<EventSet[]>([])
  const [alleUpcoming, setAlleUpcoming] = useState<EventSet[]>([])   // alle sæt fra event_result for publicerede events
  const [kommendeEvents, setKommendeEvents] = useState<EventRow[]>([])

  // Inline program under hvert event
  const programByEvent = useMemo(() => groupByEventThenMatch(alleUpcoming), [alleUpcoming])

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
        // ===== 1) Auth + PROFIL =====
        const { data: auth } = await supabase.auth.getUser()
        const user = auth?.user ?? null

        let navn: string | null = null
        let female = false
        let tors = false

        if (user) {
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

        // ===== 2) Elo dynamisk =====
        let aktueltElo: number | null = null
        if (navn) {
          try {
            const res = await fetch('/api/rangliste', { cache: 'no-store' })
            const json = await res.json()
            const maybeList = Array.isArray(json) ? json : Array.isArray(json?.data) ? json.data : []
            const list: Array<{ visningsnavn: string; elo: number }> =
              maybeList
                .map((r: any) => ({
                  visningsnavn: toStr(r?.visningsnavn) ?? '',
                  elo: Number(r?.elo ?? r?.Elo ?? 0),
                }))
                .filter((r: any) => r.visningsnavn && Number.isFinite(r.elo))
            const me = list.find((r) => r.visningsnavn.toLowerCase() === navn!.toLowerCase())
            aktueltElo = me ? me.elo : null
          } catch { /* ignorer */ }
        }
        setElo(aktueltElo)

        // ===== 3) Hent events (i dag → +14 dage) =====
        const toISO = plusDaysISO(todayISO, 14)
        const { data: eventsData, error: eventsErr } = await supabase
          .from('events')
          .select('id,name,date,start_time,end_time,location,min_elo,max_elo,only_women,closed_group,signup_url,status')
          .gte('date', todayISO)
          .lte('date', toISO)
          .order('date', { ascending: true })

        if (eventsErr) throw eventsErr
        const events = (eventsData as EventRow[]) ?? []
        setKommendeEvents(events)

        // Map for hurtig opslag af dato pr. event
        const dateByEvent: Record<string, string> = {}
        events.forEach(e => { if (e.id && e.date) dateByEvent[String(e.id)] = e.date })

        // Saml alle publicerede event_id'er
        const publishedIds = events
          .filter(e => (e.status ?? '').toLowerCase() === 'published')
          .map(e => e.id)

        // ===== 4) Hent alle sæt fra event_result for publicerede events =====
        let allSets: EventSet[] = []
        if (publishedIds.length > 0) {
          const { data: erows, error: erErr } = await (supabase.from('event_result') as any)
            .select('*')
            .in('event_id', publishedIds)
            .order('group_index', { ascending: true })
            .order('set_index', { ascending: true })

          if (erErr) throw erErr

          allSets = (erows as EventResultRow[]).map(r => ({
            id: `${r.event_id}-${r.group_index}-${r.set_index}`,
            event_id: r.event_id,
            event_dato: dateByEvent[String(r.event_id)] ?? todayISO,
            kamp_nr: (r.group_index ?? 0) + 1,
            saet_nr: (r.set_index ?? 0) + 1,
            bane: (r.court_label ?? '') as string,
            starttid: (r.start_time ?? '').slice(0, 5),
            sluttid: (r.end_time ?? '').slice(0, 5),
            holda1: r.holdA1 ?? '',
            holda2: r.holdA2 ?? '',
            holdb1: r.holdB1 ?? '',
            holdb2: r.holdB2 ?? '',
          }))
        }
        setAlleUpcoming(allSets)

        // ===== 5) Mine kampe: kun publicerede events hvor mit navn indgår i sættene =====
        if (navn && allSets.length > 0) {
          const lower = navn.toLowerCase()
          const mine = allSets.filter(r => {
            const names = [r.holda1, r.holda2, r.holdb1, r.holdb2].map(x => (x || '').trim().toLowerCase())
            return names.includes(lower)
          })
          setMineSets(mine)
        } else {
          setMineSets([])
        }
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

  /* ============ Modal: fuldt program for et event (fra event_result) ============ */
  async function visFuldtProgramForEvent(eventId: string | number) {
    setProgramOpen(true)
    setProgramLoading(true)
    try {
      // cache-hit først
      const cached = alleUpcoming.filter(r => String(r.event_id) === String(eventId))
      if (cached.length > 0) {
        setProgramRows(cached)
        setProgramDato(cached[0]?.event_dato ?? null)
        return
      }

      // ellers hent fra DB
      const { data: evRows, error } = await (supabase.from('event_result') as any)
        .select('*')
        .eq('event_id', eventId)
        .order('group_index', { ascending: true })
        .order('set_index', { ascending: true })

      if (error) throw error

      // Hent dato fra events (til header)
      const { data: evMeta } = await (supabase.from('events') as any)
        .select('date')
        .eq('id', eventId)
        .maybeSingle()

      const dato = (evMeta?.date as string) ?? todayISO

      const rows: EventSet[] = (evRows as EventResultRow[]).map(r => ({
        id: `${r.event_id}-${r.group_index}-${r.set_index}`,
        event_id: r.event_id,
        event_dato: dato,
        kamp_nr: (r.group_index ?? 0) + 1,
        saet_nr: (r.set_index ?? 0) + 1,
        bane: (r.court_label ?? '') as string,
        starttid: (r.start_time ?? '').slice(0, 5),
        sluttid: (r.end_time ?? '').slice(0, 5),
        holda1: r.holdA1 ?? '',
        holda2: r.holdA2 ?? '',
        holdb1: r.holdB1 ?? '',
        holdb2: r.holdB2 ?? '',
      }))

      setProgramRows(rows)
      setProgramDato(dato)
    } catch (e) {
      console.error(e)
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

      {visningsnavn && (
        <p className="text-center text-xs opacity-70 mb-4">
          {`Bruger: ${visningsnavn} · Køn: ${isFemale ? 'kvinde' : 'mand'} · Elo: ${elo ?? 'ikke fundet'}`}
        </p>
      )}

      {error && <p className="text-center text-red-600 mb-4">{error}</p>}

      {/* ===== Mine kampe (fra event_result for publicerede events) ===== */}
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
                                {highlightName(r.holda1, visningsnavn)} & {highlightName(r.holda2, visningsnavn)} <span className="opacity-60">vs</span><br />
                                {highlightName(r.holdb1, visningsnavn)} & {highlightName(r.holdb2, visningsnavn)}
                              </span>
                            </div>
                          ))}
                        </div>
                        <div className="mt-3">
                          <button
                            type="button"
                            onClick={() => visFuldtProgramForEvent(meta.event_id)}
                            className="inline-block px-3 py-1.5 rounded-full border-2 border-pink-500 text-pink-600 bg-white/90 dark:bg-[#2a2a2a]/90 shadow hover:bg-pink-50 dark:hover:bg-pink-900/20 transition"
                            title="Se fuldt program"
                          >
                            📋 Fuldt program
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })
        ) : (
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
            <p className="text-zinc-700 dark:text-zinc-300">Ingen kommende kampe.</p>
            <p className="text-sm mt-1 text-zinc-600 dark:text-zinc-400">
              Tjek events nedenfor – programmet vises under publicerede events (også selvom du ikke er kvalificeret).
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
              const navn = (ev.name ?? '').toString().trim() || 'Event'

              const womenOnly = !!ev.only_women || /torsdagstøserne/i.test(navn)
              const closedGroup = !!ev.closed_group
              const status = (ev.status ?? '').toLowerCase()

              const minElo = numOrNull(ev.min_elo)
              const maxElo = numOrNull(ev.max_elo)
              const hasEloReq = minElo != null || maxElo != null

              const eloOk = hasEloReq
                ? (elo != null)
                  && (minElo == null || (elo as number) >= minElo)
                  && (maxElo == null || (elo as number) <= maxElo)
                : true

              const membersOk = closedGroup ? isTorsdagspadel : true
              const womenOk = womenOnly ? isFemale : true
              const eligible = eloOk && membersOk && womenOk

              const signupUrl =
                (ev as any).signup_url
                || (ev.location ? getSignupUrlByLocation(ev.location) : getSignupUrlByISODate(ev.date))

              const timeStr = [fmt(ev.start_time), fmt(ev.end_time)].filter(Boolean).join('–')
              const locationStr = ev.location ? ` · ${ev.location}` : ''

              const emoji = getEmojiForEvent({ requireMembers: closedGroup, womenOnly })

              const showProgram = status === 'published'

              // Inline program for dette event
              const evMap = programByEvent.get(String(ev.id))
              const matchEntries = evMap ? Array.from(evMap.entries()) : []

              // er brugeren programsat i dette event?
              const userScheduled = !!(visningsnavn && matchEntries.some(([_, sets]) => sets.some(s => isNameInSet(visningsnavn, s))))

              return (
                <div
                  key={`ev-${ev.id}`}
                  className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3"
                >
                  {/* 1: Dato – tid – location */}
                  <div className="text-sm opacity-80">
                    {formatDanishDate(ev.date)}
                    {timeStr ? ` · ${timeStr}` : ''}
                    {locationStr}
                  </div>

                  {/* 2: Emoji · Navn · Emoji */}
                  <div className="text-base font-semibold my-1 flex items-center gap-2 flex-wrap">
                    <span className="mr-1">{emoji}</span>
                    {navn}
                    <span className="ml-1">{emoji}</span>
                    {showProgram && userScheduled && (
                      <span className="ml-2 text-xs px-2 py-0.5 rounded-full border border-pink-500 text-pink-600">Du er programsat</span>
                    )}
                  </div>

                  {/* 3: Krav + CTA */}
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <div className="text-sm opacity-80">
                      {buildRequirementsText(minElo, maxElo, closedGroup, womenOnly)}
                    </div>

                    {showProgram ? (
                      <button
                        type="button"
                        onClick={() => visFuldtProgramForEvent(ev.id)}
                        className="inline-flex items-center justify-center px-3 py-1.5 rounded-full border-2 border-pink-500 text-pink-600 bg-white/90 dark:bg-[#2a2a2a]/90 shadow hover:bg-pink-50 dark:hover:bg-pink-900/20 transition"
                        title="Åbn i modal"
                      >
                        📋 Åbn program
                      </button>
                    ) : eligible ? (
                      <a
                        href={signupUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center px-3 py-1.5 rounded-full border-2 border-pink-500 text-pink-600 bg-white/90 dark:bg-[#2a2a2a]/90 shadow hover:bg-pink-50 dark:hover:bg-pink-900/20 transition"
                        title="Åbner i nyt vindue"
                      >
                        Tilmelding ↗
                      </a>
                    ) : (
                      <span className="text-xs px-2 py-1 rounded-full border border-zinc-300 dark:border-zinc-700 opacity-70">
                        Ikke kvalificeret
                      </span>
                    )}
                  </div>

                  {/* 4: Inline program (vises ALTID når event er publiceret – også hvis man ikke er kvalificeret) */}
                  {showProgram && (
                    <div className="mt-3 space-y-2">
                      {matchEntries.length === 0 ? (
                        <div className="text-sm text-zinc-600 dark:text-zinc-400">Der er endnu ikke sat kampe på.</div>
                      ) : (
                        matchEntries.map(([matchKey, sets]) => {
                          const meta = sets[0]
                          return (
                            <div key={matchKey}
                              className="rounded-xl px-3 py-2 shadow bg-white dark:bg-[#232323] border border-zinc-200 dark:border-zinc-800">
                              <div className="flex items-center justify-between mb-1 text-sm">
                                <div className="font-semibold">Kamp #{meta.kamp_nr}</div>
                                <div className="opacity-80">🏟 {meta.bane} · ⏱ {fmt(meta.starttid)}–{fmt(meta.sluttid)}</div>
                              </div>
                              <div className="space-y-1 text-sm">
                                {sets.map((r) => (
                                  <div key={r.saet_nr} className="flex items-start gap-2">
                                    <span className="font-medium shrink-0">Sæt {r.saet_nr}:</span>
                                    <span className="leading-tight break-words text-left">
                                      {highlightName(r.holda1, visningsnavn)} & {highlightName(r.holda2, visningsnavn)} <span className="opacity-60">vs</span><br />
                                      {highlightName(r.holdb1, visningsnavn)} & {highlightName(r.holdb2, visningsnavn)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )
                        })
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ===== Modal (📋 Program) – stadig tilgængelig fra "Mine kampe" eller knap ===== */}
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
                  {Array.from(groupByMatch(programRows).entries()).map(([kampKey, sets]) => {
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
                                {highlightName(r.holda1, visningsnavn)} & {highlightName(r.holda2, visningsnavn)} <span className="opacity-60">vs</span><br />
                                {highlightName(r.holdb1, visningsnavn)} & {highlightName(r.holdb2, visningsnavn)}
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
  if (day === 3 || day === 0) return MATCHI_GILLELEJE // ons/søn
  if (day === 4 || day === 5) return MATCHI_HELSINGE  // tor/fre
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

/** Gruppér helpers (dato → kamp → sæt) */
function groupByDateAndMatch(rows: EventSet[]) {
  const byDate = new Map<string, Map<string, EventSet[]>>()
  for (const r of rows) {
    const dateKey = r.event_dato
    const kampKey = `${r.event_id}#${r.kamp_nr}` // mere entydig nøgle
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
    const key = `${r.event_id}#${r.kamp_nr}`
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(r)
  }
  for (const [k, arr] of map) {
    arr.sort((a, b) => a.saet_nr - b.saet_nr)
    map.set(k, arr)
  }
  return map
}

function groupByEventThenMatch(rows: EventSet[]) {
  // returnerer Map<EventId, Map<MatchKey, EventSet[]>>
  const byEvent = new Map<string, Map<string, EventSet[]>>()
  for (const r of rows) {
    const evKey = String(r.event_id)
    const matchKey = `${r.event_id}#${r.kamp_nr}`
    if (!byEvent.has(evKey)) byEvent.set(evKey, new Map())
    const inner = byEvent.get(evKey)!
    if (!inner.has(matchKey)) inner.set(matchKey, [])
    inner.get(matchKey)!.push(r)
  }
  for (const [, matchMap] of byEvent) {
    for (const [k, arr] of matchMap) {
      arr.sort((a, b) => a.saet_nr - b.saet_nr)
      matchMap.set(k, arr)
    }
  }
  return byEvent
}

function isNameInSet(name: string, s: EventSet) {
  const n = name.trim().toLowerCase()
  return [s.holda1, s.holda2, s.holdb1, s.holdb2].some(x => (x || '').trim().toLowerCase() === n)
}

function highlightName(n: string, me: string | null) {
  if (!me) return <span>{n}</span>
  const isMe = n.trim().toLowerCase() === me.trim().toLowerCase()
  return <span className={isMe ? 'font-semibold text-pink-600' : ''}>{n}</span>
}

