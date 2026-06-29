'use client'
export const dynamic = 'force-dynamic'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { LoadingState, PageShell } from '../components/ui'

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
  scoreA: number
  scoreB: number
}

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

function mapEventRowsToSets(rows: EventResultRow[], eventDate: string): EventSet[] {
  return rows.map((r) => ({
    id: `${r.event_id}-${r.group_index}-${r.set_index}`,
    event_id: r.event_id,
    event_dato: eventDate,
    kamp_nr: (r.group_index ?? 0) + 1,
    saet_nr: (r.set_index ?? 0) + 1,
    bane: (r.court_label ?? '') as string,
    starttid: (r.start_time ?? '').slice(0, 5),
    sluttid: (r.end_time ?? '').slice(0, 5),
    holda1: r.holdA1 ?? '',
    holda2: r.holdA2 ?? '',
    holdb1: r.holdB1 ?? '',
    holdb2: r.holdB2 ?? '',
    scoreA: Number(r.scoreA ?? 0),
    scoreB: Number(r.scoreB ?? 0),
  }))
}

export default function KommendeKampePage() {
  const [visningsnavn, setVisningsnavn] = useState<string | null>(null)
  const [isFemale, setIsFemale] = useState<boolean>(false)
  const [isTorsdagspadel, setIsTorsdagspadel] = useState<boolean>(false)

  const [elo, setElo] = useState<number | null>(null)

  const [mineSets, setMineSets] = useState<EventSet[]>([])
  const [alleUpcoming, setAlleUpcoming] = useState<EventSet[]>([])   // alle sæt fra event_result for publicerede events
  const [kommendeEvents, setKommendeEvents] = useState<EventRow[]>([])

  const [programOpen, setProgramOpen] = useState(false)
  const [programDato, setProgramDato] = useState<string | null>(null)
  const [programRows, setProgramRows] = useState<EventSet[]>([])
  const [programLoading, setProgramLoading] = useState(false)
  const [scoreOpen, setScoreOpen] = useState(false)
  const [scoreRows, setScoreRows] = useState<EventSet[]>([])
  const [scoreBusy, setScoreBusy] = useState(false)
  const [scoreError, setScoreError] = useState<string | null>(null)

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

          allSets = mapEventRowsToSets(erows as EventResultRow[], todayISO).map((row) => ({
            ...row,
            event_dato: dateByEvent[String(row.event_id)] ?? todayISO,
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

      const rows: EventSet[] = mapEventRowsToSets(evRows as EventResultRow[], dato)

      setProgramRows(rows)
      setProgramDato(dato)
    } catch (e) {
      console.error(e)
      setProgramRows([])
    } finally {
      setProgramLoading(false)
    }
  }

  async function reloadEventSets(eventId: string | number, eventDate?: string | null) {
    const { data: evRows, error } = await (supabase.from('event_result') as any)
      .select('*')
      .eq('event_id', eventId)
      .order('group_index', { ascending: true })
      .order('set_index', { ascending: true })

    if (error) throw error

    let dato = eventDate ?? null
    if (!dato) {
      const { data: evMeta } = await (supabase.from('events') as any)
        .select('date')
        .eq('id', eventId)
        .maybeSingle()
      dato = (evMeta?.date as string | null) ?? todayISO
    }

    const rows = mapEventRowsToSets(evRows as EventResultRow[], dato ?? todayISO)
    setAlleUpcoming((prev) => [
      ...prev.filter((row) => String(row.event_id) !== String(eventId)),
      ...rows,
    ])

    if (visningsnavn) {
      const lower = visningsnavn.toLowerCase()
      setMineSets((prev) => {
        const rest = prev.filter((row) => String(row.event_id) !== String(eventId))
        const mine = rows.filter((row) =>
          [row.holda1, row.holda2, row.holdb1, row.holdb2]
            .map((name) => (name || '').trim().toLowerCase())
            .includes(lower)
        )
        return [...rest, ...mine]
      })
    }

    if (programOpen && programRows[0] && String(programRows[0].event_id) === String(eventId)) {
      setProgramRows(rows)
      setProgramDato(dato ?? todayISO)
    }

    if (scoreOpen && scoreRows[0] && String(scoreRows[0].event_id) === String(eventId)) {
      const currentKampNr = scoreRows[0].kamp_nr
      setScoreRows(
        rows
          .filter((row) => row.kamp_nr === currentKampNr)
          .sort((a, b) => a.saet_nr - b.saet_nr)
      )
    }
  }

  async function saveSetScore(setRow: EventSet, scoreA: number, scoreB: number) {
    setScoreBusy(true)
    setScoreError(null)
    try {
      const res = await fetch('/api/event-score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'updateScore',
          eventId: setRow.event_id,
          groupIndex: setRow.kamp_nr - 1,
          setIndex: setRow.saet_nr - 1,
          scoreA,
          scoreB,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error ?? 'Kunne ikke gemme sættet.')
      }

      await reloadEventSets(setRow.event_id, setRow.event_dato)
    } catch (e: any) {
      setScoreError(e?.message ?? 'Kunne ikke gemme sættet.')
    } finally {
      setScoreBusy(false)
    }
  }

  async function addExtraSet() {
    const first = scoreRows[0]
    if (!first) return
    setScoreBusy(true)
    setScoreError(null)
    try {
      const res = await fetch('/api/event-score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'addSet',
          eventId: first.event_id,
          groupIndex: first.kamp_nr - 1,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data?.error ?? 'Kunne ikke tilføje et nyt sæt.')
      }

      await reloadEventSets(first.event_id, first.event_dato)
    } catch (e: any) {
      setScoreError(e?.message ?? 'Kunne ikke tilføje et nyt sæt.')
    } finally {
      setScoreBusy(false)
    }
  }

  function åbnScorekort(sets: EventSet[]) {
    setScoreError(null)
    setScoreRows([...sets].sort((a, b) => a.saet_nr - b.saet_nr))
    setScoreOpen(true)
  }

  function lukProgram() { setProgramOpen(false); setProgramDato(null); setProgramRows([]) }
  function lukScore() { setScoreOpen(false); setScoreRows([]); setScoreError(null) }
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
  if (loading) return <LoadingState text="Indlæser kommende..." />

  return (
    <PageShell className="bg-[#1a1a2e] px-0 py-0 md:px-6 md:py-6">
      <div className="mx-auto flex min-h-screen w-full max-w-[820px] flex-col overflow-hidden bg-[#f4f5f7] md:min-h-[min(100vh,980px)] md:rounded-[34px] md:border md:border-white/10 md:shadow-[0_28px_80px_rgba(0,0,0,0.35)]">
        <header className="bg-gradient-to-br from-[#f01f78] to-[#c0135a] px-4 pb-5 pt-4 text-white md:px-6">
          <div className="mb-4 flex items-center justify-between text-[11px] font-semibold opacity-90">
            <span>Padelhuset</span>
            <span>
              {new Intl.DateTimeFormat('da-DK', {
                hour: '2-digit',
                minute: '2-digit',
              }).format(new Date())}
            </span>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/75">
                Kalender
              </p>
              <h1 className="mt-1 text-2xl font-black tracking-tight">
                Kommende Events
              </h1>
            </div>

            <Link
              href={visningsnavn ? `/profil/${encodeURIComponent(visningsnavn)}` : '/startside'}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#ffd44d] text-xs font-black text-[#463018]"
              aria-label="Min profil"
            >
              {initials(visningsnavn || 'Spiller')}
            </Link>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 pb-28 pt-4 md:px-6">
          <div className="space-y-4">
            {error ? (
              <section className="rounded-[20px] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.07)]">
                <p className="text-sm font-semibold text-red-600">{error}</p>
              </section>
            ) : null}

            <section className="rounded-[20px] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.07)]">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-[13px] font-bold uppercase tracking-[0.12em] text-[#2d3340]">
                  Mine kampe
                </h2>
                <span className="rounded-full bg-[#fff0f5] px-3 py-1 text-[11px] font-bold text-[#f01f78]">
                  {mineSets.length} sæt
                </span>
              </div>

              {visningsnavn && mineDatoer.length > 0 ? (
                <div className="space-y-4">
                  {mineDatoer.map((dato) => {
                    const kampe = groupedMine.get(dato)!
                    return (
                      <div key={`mine-${dato}`} className="space-y-3">
                        <h3 className="text-sm font-extrabold text-[#1f2430]">
                          {formatDanishDate(dato)}
                        </h3>
                        <div className="space-y-3">
                          {Array.from(kampe.keys()).map((kampKey) => {
                            const sets = kampe.get(kampKey)!
                            const meta = sets[0]
                            return (
                              <div
                                key={kampKey}
                                className="rounded-[18px] bg-[#fbfbfc] p-4 shadow-[0_1px_8px_rgba(0,0,0,0.04)]"
                              >
                                <div className="mb-2 flex items-center justify-between gap-3">
                                  <h4 className="text-sm font-extrabold text-[#1f2430]">
                                    Kamp #{meta.kamp_nr}
                                  </h4>
                                  <div className="text-xs text-[#838999]">
                                    🏟 {meta.bane} · ⏱ {fmt(meta.starttid)}–{fmt(meta.sluttid)}
                                  </div>
                                </div>
                                <div className="space-y-2 text-sm text-[#414754]">
                                  {sets.map((r) => (
                                    <div key={r.saet_nr} className="rounded-[12px] bg-white px-3 py-2">
                                      <div className="flex items-center justify-between gap-3">
                                        <div className="font-semibold">Sæt {r.saet_nr}</div>
                                        <div className="text-sm font-black text-[#1f2430]">
                                          {r.scoreA === 0 && r.scoreB === 0 ? '–' : `${r.scoreA}-${r.scoreB}`}
                                        </div>
                                      </div>
                                      <div className="mt-1 leading-tight">
                                        {r.holda1} & {r.holda2} <span className="opacity-60">vs</span><br />
                                        {r.holdb1} & {r.holdb2}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() => åbnScorekort(sets)}
                                    className="inline-flex items-center justify-center rounded-full border-2 border-emerald-500 bg-white px-3 py-1.5 text-sm font-semibold text-emerald-700 shadow transition hover:bg-emerald-50"
                                    title="Indtast resultater"
                                  >
                                    ✍️ Indtast resultater
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => visFuldtProgramForEvent(meta.event_id)}
                                    className="inline-flex items-center justify-center rounded-full border-2 border-pink-500 bg-white px-3 py-1.5 text-sm font-semibold text-pink-600 shadow transition hover:bg-pink-50"
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
                  })}
                </div>
              ) : (
                <div className="rounded-[18px] bg-[#fbfbfc] p-4 text-sm text-[#6d7280]">
                  Ingen kommende kampe endnu. Tjek events nedenfor, hvor programmet vises så snart et event er publiceret.
                </div>
              )}
            </section>

            <section className="rounded-[20px] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.07)]">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-[13px] font-bold uppercase tracking-[0.12em] text-[#2d3340]">
                  Kommende events
                </h2>
                <span className="rounded-full bg-[#eefaf4] px-3 py-1 text-[11px] font-bold text-[#1f7a5a]">
                  14 dage
                </span>
              </div>

              {kommendeEvents.length === 0 ? (
                <div className="rounded-[18px] bg-[#fbfbfc] p-4 text-sm text-[#6d7280]">
                  Ingen datoer at vise endnu.
                </div>
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
                    const emoji = getEmojiForEvent({ requireMembers: closedGroup, womenOnly })
                    const showProgram = status === 'published'

                    return (
                      <div
                        key={`ev-${ev.id}`}
                        className="rounded-[18px] bg-[#fbfbfc] p-4 shadow-[0_1px_8px_rgba(0,0,0,0.04)]"
                      >
                        <div className="mb-3 flex items-start gap-3">
                          <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-[14px] bg-[#f01f78] text-white">
                            <span className="text-base font-black leading-none">
                              {new Date(`${ev.date}T12:00:00`).getDate()}
                            </span>
                            <span className="text-[9px] uppercase tracking-[0.08em] text-white/75">
                              {new Intl.DateTimeFormat('da-DK', { month: 'short' }).format(new Date(`${ev.date}T12:00:00`))}
                            </span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-extrabold text-[#1f2430]">
                              {emoji} {navn}
                            </p>
                            <p className="mt-1 text-xs text-[#838999]">
                              {formatDanishDate(ev.date)}
                              {timeStr ? ` · ${timeStr}` : ''}
                              {ev.location ? ` · ${ev.location}` : ''}
                            </p>
                          </div>
                        </div>

                        <p className="text-sm text-[#5f6673]">
                          {buildRequirementsText(minElo, maxElo, closedGroup, womenOnly) || 'Åbent event'}
                        </p>

                        <div className="mt-3 flex items-center justify-between gap-3">
                          <span className="text-xs font-semibold text-[#838999]">
                            {showProgram ? 'Program publiceret' : eligible ? 'Du kan tilmelde dig' : 'Du opfylder ikke kravene'}
                          </span>

                          {showProgram ? (
                            <button
                              type="button"
                              onClick={() => visFuldtProgramForEvent(ev.id)}
                              className="inline-flex items-center justify-center rounded-full border-2 border-pink-500 bg-white px-3 py-1.5 text-sm font-semibold text-pink-600 shadow transition hover:bg-pink-50"
                              title="Se fuldt program"
                            >
                              📋 Program
                            </button>
                          ) : eligible ? (
                            <a
                              href={signupUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center rounded-full border-2 border-pink-500 bg-white px-3 py-1.5 text-sm font-semibold text-pink-600 shadow transition hover:bg-pink-50"
                              title="Åbner i nyt vindue"
                            >
                              Tilmelding ↗
                            </a>
                          ) : (
                            <span className="rounded-full border border-zinc-300 px-3 py-1 text-xs font-semibold text-[#7a808c]">
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
          </div>
        </div>

        <nav className="absolute inset-x-0 bottom-0 flex justify-around border-t border-black/5 bg-white px-2 pb-5 pt-3 md:static md:pb-4">
          {[
            { href: '/startside', icon: '🏠', label: 'Hjem' },
            { href: '/ranglister', icon: '📊', label: 'Rangliste' },
            { href: '/kommende', icon: '📅', label: 'Events' },
            { href: visningsnavn ? `/profil/${encodeURIComponent(visningsnavn)}` : '/startside', icon: '🧑‍🎾', label: 'Profil' },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={[
                'flex min-w-16 flex-col items-center gap-1',
                item.href === '/kommende' ? 'text-[#f01f78]' : 'text-[#7b8190]',
              ].join(' ')}
            >
              <span className="text-lg">{item.icon}</span>
              <span className="text-[11px] font-semibold">{item.label}</span>
            </Link>
          ))}
        </nav>

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

      {scoreOpen && (
        <div
          className="fixed inset-0 z-[70] bg-black/45 backdrop-blur-sm flex items-stretch sm:items-center justify-center p-4 sm:p-6"
          onClick={(e) => { if (e.target === e.currentTarget) lukScore() }}
        >
          <div
            className="w-full sm:max-w-xl bg-white shadow-xl border border-emerald-200 rounded-none sm:rounded-2xl flex flex-col min-h-0 h-full sm:h-auto max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Indtast resultat"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200">
              <div>
                <h3 className="text-lg font-semibold text-[#1f2430]">✍️ Indtast resultat</h3>
                {scoreRows[0] ? (
                  <p className="mt-1 text-sm text-[#6d7280]">
                    Kamp #{scoreRows[0].kamp_nr} · {formatDanishDate(scoreRows[0].event_dato)}
                  </p>
                ) : null}
              </div>
              <button
                onClick={lukScore}
                className="px-2 py-1 rounded-lg border border-zinc-200 hover:bg-zinc-50"
                aria-label="Luk"
                title="Luk"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3">
              {scoreRows.map((row) => (
                <ScoreEntryCard
                  key={row.id}
                  row={row}
                  saving={scoreBusy}
                  onSave={saveSetScore}
                />
              ))}

              {scoreError ? (
                <div className="rounded-[14px] bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                  {scoreError}
                </div>
              ) : null}
            </div>

            <div className="px-4 py-3 border-t border-zinc-200 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={addExtraSet}
                disabled={
                  scoreBusy ||
                  scoreRows.length === 0 ||
                  (scoreRows[scoreRows.length - 1]?.scoreA === 0 &&
                    scoreRows[scoreRows.length - 1]?.scoreB === 0)
                }
                className="rounded-full border-2 border-emerald-500 bg-white px-3 py-1.5 text-sm font-semibold text-emerald-700 shadow transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                + Tilføj sæt
              </button>
              <button
                onClick={lukScore}
                className="rounded-full border-2 border-pink-500 bg-white px-3 py-1.5 text-sm font-semibold text-pink-600 shadow transition hover:bg-pink-50"
              >
                Luk
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </PageShell>
  )
}

function ScoreEntryCard({
  row,
  saving,
  onSave,
}: {
  row: EventSet
  saving: boolean
  onSave: (row: EventSet, scoreA: number, scoreB: number) => Promise<void>
}) {
  const [scoreA, setScoreA] = useState(String(row.scoreA))
  const [scoreB, setScoreB] = useState(String(row.scoreB))

  useEffect(() => {
    setScoreA(String(row.scoreA))
    setScoreB(String(row.scoreB))
  }, [row.id, row.scoreA, row.scoreB])

  function sanitize(value: string) {
    const trimmed = value.replace(/\D/g, '').slice(0, 1)
    return trimmed === '' ? '0' : trimmed
  }

  return (
    <div className="rounded-[18px] bg-[#fbfbfc] p-4 shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-extrabold text-[#1f2430]">Sæt {row.saet_nr}</p>
          <p className="mt-1 text-xs text-[#838999]">
            🏟 {row.bane} · ⏱ {fmt(row.starttid)}–{fmt(row.sluttid)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={scoreA}
            onChange={(e) => setScoreA(sanitize(e.target.value))}
            inputMode="numeric"
            className="w-10 rounded-[10px] border border-zinc-200 bg-white px-2 py-1.5 text-center text-sm font-black text-[#1f2430] outline-none"
          />
          <span className="text-sm font-bold text-[#838999]">-</span>
          <input
            value={scoreB}
            onChange={(e) => setScoreB(sanitize(e.target.value))}
            inputMode="numeric"
            className="w-10 rounded-[10px] border border-zinc-200 bg-white px-2 py-1.5 text-center text-sm font-black text-[#1f2430] outline-none"
          />
        </div>
      </div>

      <div className="mt-3 text-sm leading-tight text-[#414754]">
        {row.holda1} & {row.holda2} <span className="opacity-60">vs</span><br />
        {row.holdb1} & {row.holdb2}
      </div>

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          disabled={saving}
          onClick={() => void onSave(row, Number(scoreA), Number(scoreB))}
          className="rounded-full border-2 border-emerald-500 bg-white px-3 py-1.5 text-sm font-semibold text-emerald-700 shadow transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Gem sæt
        </button>
      </div>
    </div>
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
