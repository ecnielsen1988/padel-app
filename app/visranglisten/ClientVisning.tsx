"use client"

import { useEffect, useState } from "react"
import QRCode from "react-qr-code"
import { supabase } from "@/lib/supabaseClient"

type Spiller = {
  visningsnavn: string
  elo?: number
  koen?: "mand" | "kvinde" | string
  [key: string]: any
}
type MaanedItem = { visningsnavn: string; pluspoint: number }
type AktivItem = {
  visningsnavn: string
  sæt?: number; saet?: number; set?: number; sets?: number
  pluspoint?: number
  [key: string]: any
}

type EggRow = { visningsnavn: string; eggs: number }
type WinRow = { visningsnavn: string; bestStreak: number }
type PlayRow = { visningsnavn: string; weeks: number; totalSets: number }

type KampRow = {
  id?: number
  date?: string
  dato?: string
  holdA1?: string | null
  holdA2?: string | null
  holdB1?: string | null
  holdB2?: string | null
  holda1?: string | null
  holda2?: string | null
  holdb1?: string | null
  holdb2?: string | null
  scoreA?: number | string | null
  scoreB?: number | string | null
  scorea?: number | string | null
  scoreb?: number | string | null
  finish?: boolean | string | number | null
}

/** Finder et array i typiske API-svarformer */
function extractArray(raw: any): any[] {
  const cands = [
    raw,
    raw?.data, raw?.items, raw?.rows, raw?.result, raw?.results, raw?.list,
    raw?.payload, raw?.response, raw?.value, raw?.records, raw?.entries, raw?.hits,
    raw?.data?.data, raw?.data?.items,
  ]
  for (const c of cands) if (Array.isArray(c)) return c
  return []
}

async function getArray(url: string) {
  try {
    const res = await fetch(url, { cache: "no-store" })
    let raw: any = null
    try { raw = await res.json() } catch { return [] }
    return extractArray(raw)
  } catch {
    return []
  }
}

/** Henter ALLE rækker fra newresults via pagination */
async function fetchAllNewresults(): Promise<KampRow[]> {
  const PAGE_SIZE = 1000
  let all: KampRow[] = []
  let page = 0

  while (true) {
    const from = page * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    const { data, error } = await supabase
      .from("newresults")
      .select("*")
      .order("date", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to)

    if (error) {
      console.error("Fejl ved pagineret hentning af newresults (/visrangliste):", error)
      if (page === 0) throw error
      break
    }

    const batch = (data ?? []) as KampRow[]
    all = all.concat(batch)

    if (batch.length < PAGE_SIZE) break
    page++
  }

  return all
}

const MS_PER_DAY = 24 * 60 * 60 * 1000
const MS_PER_WEEK = 7 * MS_PER_DAY

const norm = (s?: string | null) => (s ?? "").trim().toLowerCase()

const emojiForPluspoint = (p: number) => {
  if (p >= 100) return "🍾"
  if (p >= 50) return "🏆"
  if (p >= 40) return "🏅"
  if (p >= 30) return "☄️"
  if (p >= 20) return "🚀"
  if (p >= 10) return "🔥"
  if (p >= 5) return "📈"
  if (p >= 0) return "💪"
  if (p > -5) return "🎲"
  if (p > -10) return "📉"
  if (p > -20) return "🧯"
  if (p > -30) return "🪂"
  if (p > -40) return "❄️"
  if (p > -50) return "🙈"
  if (p > -100) return "🥊"
  if (p > -150) return "💩"
  return "💩💩"
}

export default function ClientVisning() {
  const [rangliste, setRangliste] = useState<Spiller[]>([])
  const [maanedens, setMaanedens] = useState<MaanedItem[]>([])
  const [mestAktive, setMestAktive] = useState<AktivItem[]>([])
  const [girlpower, setGirlpower] = useState<Spiller[]>([])
  const [eggList, setEggList] = useState<EggRow[]>([])
  const [winStreak, setWinStreak] = useState<WinRow[]>([])
  const [playStreak, setPlayStreak] = useState<PlayRow[]>([])

  // index til Elo-kolonner (21–40, 41–60, …)
  const [segmentIndex, setSegmentIndex] = useState(0)
  // index til sidepaneler (monthly/active/women/egg/winstreak/playstreak)
  const [panelIndex, setPanelIndex] = useState(0)

  useEffect(() => {
    ;(async () => {
      // 1) Hent rangliste, monthly, active parallelt
      const [r, m, a] = await Promise.all([
        getArray("/api/rangliste"),
        getArray("/api/monthly"), // indeværende måned
        getArray("/api/active"),
      ])

      // 2) Hent aktive profiler
      const { data: activeProfiles, error: activeErr } = await (supabase
  .from("profiles") as any)
  .select("visningsnavn, koen")
  .eq("active", true)  // 👈 KUN aktive profiler


      const activeSet = (!activeErr && Array.isArray(activeProfiles))
        ? new Set(
            activeProfiles
              .map((p: any) => (p?.visningsnavn ?? "").toString().trim().toLowerCase())
              .filter(Boolean)
          )
        : null

      const koenMap = new Map<string, string | null>()
      if (!activeErr && Array.isArray(activeProfiles)) {
        for (const p of activeProfiles as any[]) {
          const navn = (p?.visningsnavn ?? "").toString().trim()
          if (navn) koenMap.set(navn.toLowerCase(), p.koen ?? null)
        }
      }

      const filterByActive = <T extends { visningsnavn?: string }>(arr: T[]): T[] => {
        if (!activeSet) return arr
        return (arr ?? []).filter((row) =>
          typeof row?.visningsnavn === "string" &&
          activeSet.has(row.visningsnavn.toString().trim().toLowerCase())
        )
      }

      // 3) Normaliser rangliste
      const rFiltered = filterByActive(r as Spiller[]).map((s) => ({
        ...s,
        elo: Number(s.elo ?? 0),
        koen: s.koen ?? koenMap.get(norm(s.visningsnavn)) ?? undefined,
      }))
      rFiltered.sort((a, b) => Number(b.elo ?? 0) - Number(a.elo ?? 0))
      setRangliste(rFiltered)

      // 4) Monthly & active (filtreret)
      const mFiltered = filterByActive(m as MaanedItem[])
      const aFiltered = filterByActive(a as AktivItem[])
      setMaanedens(mFiltered)
      setMestAktive(aFiltered)

      // 5) GirlPower = kvinder fra ranglisten
      const girl = rFiltered
        .filter((s) => s.koen === "kvinde")
        .slice(0, 50)
      setGirlpower(girl)

      // 6) Hent alle kampe og lav Egg, WinStreak, PlayStreak
      try {
        const allSets = await fetchAllNewresults()

        // Helper: filtrer til aktive navne
        const isActiveName = (name?: string | null) => {
          if (!name) return false
          if (!activeSet) return true
          return activeSet.has(name.toString().trim().toLowerCase())
        }

        /* ===== ÆGGEJAGTEN ===== */
        const eggsMap = new Map<string, number>()
        const addEgg = (name?: string | null) => {
          if (!isActiveName(name)) return
          const key = name!.toString().trim()
          if (!key) return
          eggsMap.set(key, (eggsMap.get(key) ?? 0) + 1)
        }

        for (const k of allSets) {
          const finished =
            k.finish === true || k.finish === "true" || k.finish === 1
          if (!finished) continue

          const ha1 = k.holda1 ?? k.holdA1
          const ha2 = k.holda2 ?? k.holdA2
          const hb1 = k.holdb1 ?? k.holdB1
          const hb2 = k.holdb2 ?? k.holdB2

          const rawA = k.scorea ?? k.scoreA
          const rawB = k.scoreb ?? k.scoreB

          const scoreA = typeof rawA === "number" ? rawA : parseInt(rawA ?? "0", 10)
          const scoreB = typeof rawB === "number" ? rawB : parseInt(rawB ?? "0", 10)
          if (!Number.isFinite(scoreA) || !Number.isFinite(scoreB)) continue

          if (scoreA === 6 && scoreB === 0) {
            addEgg(ha1); addEgg(ha2)
          } else if (scoreB === 6 && scoreA === 0) {
            addEgg(hb1); addEgg(hb2)
          }
        }

        const eggRows: EggRow[] = Array.from(eggsMap.entries())
          .map(([visningsnavn, eggs]) => ({ visningsnavn, eggs }))
          .sort((a, b) => b.eggs - a.eggs)
          .slice(0, 30)
        setEggList(eggRows)

        /* ===== WIN-STREAK (kun længste sejrsstreak i sæt) ===== */
        const playerBestStreak = new Map<string, number>()

        const isFinished = (k: KampRow) =>
          k.finish === true || k.finish === "true" || k.finish === 1

        let playerCurrent: Map<string, number> = new Map()

        for (const k of allSets) {
          if (!isFinished(k)) continue

          const ha1 = k.holda1 ?? k.holdA1
          const ha2 = k.holda2 ?? k.holdA2
          const hb1 = k.holdb1 ?? k.holdB1
          const hb2 = k.holdb2 ?? k.holdB2

          const rawA = k.scorea ?? k.scoreA
          const rawB = k.scoreb ?? k.scoreB

          const scoreA = typeof rawA === "number" ? rawA : parseInt(rawA ?? "0", 10)
          const scoreB = typeof rawB === "number" ? rawB : parseInt(rawB ?? "0", 10)
          if (!Number.isFinite(scoreA) || !Number.isFinite(scoreB)) continue
          if (scoreA === scoreB) continue

          const aWon = scoreA > scoreB
          const bWon = scoreB > scoreA

          const players = [ha1, ha2, hb1, hb2].filter(isActiveName) as string[]

          // opdater streak for hver spiller
          for (const navn of players) {
            const isA = navn === ha1 || navn === ha2
            const isB = navn === hb1 || navn === hb2
            const won = (isA && aWon) || (isB && bWon)

            const cur = playerCurrent.get(navn) ?? 0
            const newCur = won ? cur + 1 : 0
            playerCurrent.set(navn, newCur)

            const best = playerBestStreak.get(navn) ?? 0
            if (newCur > best) playerBestStreak.set(navn, newCur)
          }
        }

        const winRows: WinRow[] = Array.from(playerBestStreak.entries())
          .map(([visningsnavn, bestStreak]) => ({ visningsnavn, bestStreak }))
          .filter((r) => r.bestStreak > 0)
          .sort((a, b) => b.bestStreak - a.bestStreak || a.visningsnavn.localeCompare(b.visningsnavn, "da"))
          .slice(0, 30)
        setWinStreak(winRows)

        /* ===== 5 GAMES STREAK (uger med ≥5 sæt i træk) ===== */

        type WeekEntry = {
          weekStart: Date
          count: number
          firstDate: string
          lastDate: string
        }

        const playerWeeks = new Map<string, Map<string, WeekEntry>>()

        const ensurePlayerWeek = (
          name: string,
          weekKey: string,
          weekStart: Date,
          dateStr: string
        ): WeekEntry => {
          const trimmed = name.trim()
          if (!trimmed) {
            return {
              weekStart,
              count: 0,
              firstDate: dateStr,
              lastDate: dateStr,
            }
          }

          let weekMap = playerWeeks.get(trimmed)
          if (!weekMap) {
            weekMap = new Map<string, WeekEntry>()
            playerWeeks.set(trimmed, weekMap)
          }

          let entry = weekMap.get(weekKey)
          if (!entry) {
            entry = {
              weekStart,
              count: 0,
              firstDate: dateStr,
              lastDate: dateStr,
            }
            weekMap.set(weekKey, entry)
          }

          entry.count += 1
          if (dateStr < entry.firstDate) entry.firstDate = dateStr
          if (dateStr > entry.lastDate) entry.lastDate = dateStr

          return entry
        }

        for (const k of allSets) {
          if (!isFinished(k)) continue

          const dateStr = k.date ?? k.dato
          if (!dateStr) continue

          const dt = new Date(dateStr)
          if (isNaN(dt.getTime())) continue

          const ha1 = k.holda1 ?? k.holdA1
          const ha2 = k.holda2 ?? k.holdA2
          const hb1 = k.holdb1 ?? k.holdB1
          const hb2 = k.holdb2 ?? k.holdB2

          const players = [ha1, ha2, hb1, hb2].filter(isActiveName) as string[]
          if (!players.length) continue

          const weekday = (dt.getDay() + 6) % 7 // mandag=0
          const weekStart = new Date(dt)
          weekStart.setDate(dt.getDate() - weekday)
          weekStart.setHours(0, 0, 0, 0)

          const weekKey = weekStart.toISOString().slice(0, 10)

          for (const p of players) {
            ensurePlayerWeek(p, weekKey, weekStart, dateStr)
          }
        }

        const now = new Date()
        const currentWeekStart = new Date(now)
        const currWeekday = (currentWeekStart.getDay() + 6) % 7
        currentWeekStart.setDate(currentWeekStart.getDate() - currWeekday)
        currentWeekStart.setHours(0, 0, 0, 0)

        const streakRows: PlayRow[] = []

        for (const [navn, weekMap] of playerWeeks.entries()) {
          const entries = Array.from(weekMap.values())
          if (!entries.length) continue

          entries.sort(
            (a, b) => a.weekStart.getTime() - b.weekStart.getTime()
          )

          const qualifying = entries.filter((w) => w.count >= 5)
          if (!qualifying.length) continue

          let weeks = 1
          let totalSets = qualifying[qualifying.length - 1].count
          let startIdx = qualifying.length - 1
          const endIdx = qualifying.length - 1

          for (let i = qualifying.length - 1; i > 0; i--) {
            const curr = qualifying[i]
            const prev = qualifying[i - 1]
            const diff = curr.weekStart.getTime() - prev.weekStart.getTime()
            if (diff === MS_PER_WEEK) {
              weeks++
              totalSets += prev.count
              startIdx = i - 1
            } else {
              break
            }
          }

          const lastQual = qualifying[endIdx]
          const diffToCurrent =
            currentWeekStart.getTime() - lastQual.weekStart.getTime()
          const diffWeeks = Math.round(diffToCurrent / MS_PER_WEEK)

          if (diffWeeks >= 2) continue // ikke aktuel streak

          const startDate = qualifying[startIdx].firstDate
          const endDate = qualifying[endIdx].lastDate

          streakRows.push({
            visningsnavn: navn,
            weeks,
            totalSets,
          })
        }

        streakRows.sort((a, b) => {
          if (b.weeks !== a.weeks) return b.weeks - a.weeks
          if (b.totalSets !== a.totalSets) return b.totalSets - a.totalSets
          return a.visningsnavn.localeCompare(b.visningsnavn, "da")
        })

        setPlayStreak(streakRows.slice(0, 30))
      } catch (e) {
        console.error("Fejl i newresults-beregninger til TV-visning:", e)
      }
    })()
  }, [])

  // Dynamisk rotation af Elo-segmenter og sidepaneler
  useEffect(() => {
    const interval = setInterval(() => {
      setSegmentIndex((prev) => prev + 1)
      setPanelIndex((prev) => prev + 1)
    }, 15000)

    return () => clearInterval(interval)
  }, [])

  const safeRangliste = Array.isArray(rangliste) ? rangliste : []
  const top20 = safeRangliste.slice(0, 20)
  const ekstra = safeRangliste.slice(20)
  const chunkSize = 20
  const extraLen = ekstra.length
  const chunkCount = extraLen > 0 ? Math.ceil(extraLen / chunkSize) : 1
  const currentChunk = ((segmentIndex % chunkCount) + chunkCount) % chunkCount
  const nextChunk = ((currentChunk + 1) % chunkCount + chunkCount) % chunkCount

  const getChunk = (chunkIdx: number) => {
    const start = chunkIdx * chunkSize
    const end = start + chunkSize
    return ekstra.slice(start, end)
  }

  const col2 = getChunk(currentChunk)
  const col3 = getChunk(nextChunk)

  const bedsteMand = top20.find((s) => s.koen === "mand")
  const bedsteKvinde = top20.find((s) => s.koen === "kvinde")

  const rangKolonne = (
    spillere: Spiller[],
    startNr: number
  ) => (
    <td className="align-top p-2 w-[20%]">
      <div className="space-y-1 flex flex-col justify-start">
        {(spillere ?? []).map((s, i) => {
          const placering = startNr + i
          const emoji =
            s.visningsnavn === bedsteMand?.visningsnavn
              ? "👑"
              : s.visningsnavn === bedsteKvinde?.visningsnavn
              ? "👸"
              : ""

          return (
            <div
              key={`${s.visningsnavn}-${placering}`}
              className="flex justify-between items-center rounded-xl px-3 py-1.5 text-xs shadow-lg bg-gradient-to-r from-pink-500/90 to-pink-600/90"
            >
              <span className="flex gap-1 items-center">
                <span className="font-bold tabular-nums">#{placering}</span>
                <span className="truncate max-w-[7rem] md:max-w-[9rem]">
                  {s.visningsnavn} {emoji}
                </span>
              </span>
              <span className="whitespace-nowrap font-semibold tabular-nums">
                {Math.round(Number(s.elo ?? 0))} 🎾
              </span>
            </div>
          )
        })}
      </div>
    </td>
  )

  // Normalisér mest aktive til visning
  const mestAktiveVis = (mestAktive ?? [])
    .filter((s: any) => s && typeof s === "object" && typeof s.visningsnavn === "string")
    .map((s: any) => {
      const sets = Number(s["sæt"] ?? s["saet"] ?? s.saet ?? s.set ?? s.sets ?? 0) || 0
      const plus = Number(
        s.pluspoint ??
        (maanedens ?? []).find((m) => m?.visningsnavn === s.visningsnavn)?.pluspoint ??
        0
      )
      return { ...s, _sets: sets, _plus: plus }
    })
    .filter((s: any) => s._sets > 0)
    .sort((a: any, b: any) => (b._sets - a._sets) || (b._plus - a._plus))
    .slice(0, 15)

  const monthlyTop = (maanedens ?? []).slice(0, 15)
  const girlTop = (girlpower ?? []).slice(0, 15)
  const eggTop = (eggList ?? []).slice(0, 15)
  const winTop = (winStreak ?? []).slice(0, 15)
  const playTop = (playStreak ?? []).slice(0, 15)

  const sidePanels = [
    {
      key: "monthly",
      title: "Månedens spillere",
      render: (s: MaanedItem) => {
        const p = Number(s.pluspoint ?? 0)
        return `${p >= 0 ? "+" : ""}${p.toFixed(1)} ${emojiForPluspoint(p)}`
      },
      rows: monthlyTop,
    },
    {
      key: "active",
      title: "Mest aktive",
      render: (s: any) => `${s._sets} sæt 🏃‍♂️`,
      rows: mestAktiveVis,
    },
    {
      key: "women",
      title: "GirlPower Listen",
      render: (s: Spiller) => `Elo ${Math.round(Number(s.elo ?? 0))} 👸`,
      rows: girlTop,
    },
    {
      key: "egg",
      title: "Æggejagten",
      render: (s: EggRow) => `${s.eggs} æg 🥚`,
      rows: eggTop,
    },
    {
      key: "winstreak",
      title: "Win-Streak",
      render: (s: WinRow) => `${s.bestStreak} sæt 🔥`,
      rows: winTop,
    },
    {
      key: "playstreak",
      title: "5 Games Streak",
      render: (s: PlayRow) => `${s.weeks} uger 🎯`,
      rows: playTop,
    },
  ]

  const panelCount = sidePanels.length
  const currentPanelIdx = ((panelIndex % panelCount) + panelCount) % panelCount
  const nextPanelIdx = ((currentPanelIdx + 1) % panelCount + panelCount) % panelCount

  const renderSidePanel = (panelIdx: number) => {
  const panel = sidePanels[panelIdx]
  const rows = panel.rows ?? []

  return (
    <td className="align-top p-2 w-[20%]">
      <div className="space-y-1 flex flex-col justify-start">
        {rows.length === 0 ? (
          <div className="rounded-xl px-3 py-2 text-[11px] text-center bg-pink-500/40 text-pink-50">
            Ingen data endnu
          </div>
        ) : (
          rows.map((s: any, i: number) => (
            <div
              key={`${panel.key}-${s.visningsnavn}-${i}`}
              className="flex justify-between items-center rounded-xl px-3 py-1.5 text-xs shadow-lg bg-pink-500/80"
            >
              {/* Venstre side: #placering + navn */}
              <span className="flex items-center gap-1 min-w-0">
                <span className="font-bold tabular-nums">#{i + 1}</span>
                <span className="truncate max-w-[7rem] md:max-w-[9rem]">
                  {s.visningsnavn}
                </span>
              </span>

              {/* Højre side: panel-specifik info (pluspoint, sæt, æg osv.) */}
              <span className="whitespace-nowrap font-semibold">
                {panel.render(s)}
              </span>
            </div>
          ))
        )}
      </div>
    </td>
  )
}


  return (
    <main className="min-h-screen text-white flex flex-col bg-gradient-to-br from-pink-700 via-pink-500 to-rose-500">
      {/* Top-bar / logo */}
      <div className="p-4 text-center">
        <img
          src="/padelhuset-logo.png"
          alt="Padelhuset logo"
          className="mx-auto h-12 md:h-16 lg:h-20 drop-shadow-[0_0_25px_rgba(255,255,255,0.45)]"
        />
        <div className="mt-2 text-xs tracking-[0.25em] uppercase text-pink-100">
          Live Rangliste • Padelhuset
        </div>
      </div>

      {/* Kolonner */}
      <table className="table-fixed w-full px-2">
        <thead>
          <tr className="text-[11px] md:text-xs">
            <th className="text-pink-50 font-extrabold text-center py-3 tracking-wide w-[20%]">
              Top 20
            </th>
            <th className="text-pink-50 font-extrabold text-center py-3 tracking-wide w-[20%]">
              {/* #21–40, #41–60 osv. */}
              {extraLen <= 0
                ? "#21–40"
                : `#${20 + currentChunk * chunkSize + 1}–${Math.min(
                    20 + (currentChunk + 1) * chunkSize,
                    safeRangliste.length
                  )}`}
            </th>
            <th className="text-pink-50 font-extrabold text-center py-3 tracking-wide w-[20%]">
              {extraLen <= 0
                ? "#41–60"
                : `#${20 + nextChunk * chunkSize + 1}–${Math.min(
                    20 + (nextChunk + 1) * chunkSize,
                    safeRangliste.length
                  )}`}
            </th>
            <th className="text-pink-50 font-extrabold text-center py-3 tracking-wide w-[20%]">
              {sidePanels[currentPanelIdx].title}
            </th>
            <th className="text-pink-50 font-extrabold text-center py-3 tracking-wide w-[20%]">
              {sidePanels[nextPanelIdx].title}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            {rangKolonne(top20, 1)}
            {rangKolonne(col2, 21 + currentChunk * chunkSize)}
            {rangKolonne(col3, 21 + nextChunk * chunkSize)}
            {renderSidePanel(currentPanelIdx)}
            {renderSidePanel(nextPanelIdx)}
          </tr>
        </tbody>
      </table>

      {/* QR Code nederst til højre */}
      <div className="fixed bottom-4 right-4 flex items-center space-x-4 z-50">
        <div className="font-bold px-6 py-3 rounded-full shadow-xl text-sm md:text-lg bg-pink-700/90 backdrop-blur border border-pink-200/40">
          👉 Tilmeld dig ranglisten
        </div>
        <div className="p-2 shadow-xl rounded-2xl bg-white">
          <QRCode value="https://padelhuset-app.netlify.app/signup" size={96} />
        </div>
      </div>
    </main>
  )
}

