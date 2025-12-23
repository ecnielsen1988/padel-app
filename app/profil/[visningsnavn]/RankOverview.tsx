"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabaseClient"
import { beregnEloÆndringerForIndeværendeMåned } from "@/lib/beregnEloChange"
import { beregnEloForKampe, Kamp, EloMap } from "@/lib/beregnElo"

type Props = {
  visningsnavn: string
  kampe: any[]
}

type RanglisteRow = {
  visningsnavn: string
  elo?: number
  koen?: string | null
  position?: number
}

type MonthlyRow = {
  visningsnavn: string
  position?: number
  pluspoint?: number
  netto?: number
  diff?: number
}

type AktivSpiller = {
  visningsnavn: string
  sæt: number
  pluspoint: number
}

type OverviewItem = {
  key: string
  label: string
  emoji: string
  href: string
  position: number
  valueLabel: string
}

const MS_PER_DAY = 24 * 60 * 60 * 1000
const MS_PER_WEEK = 7 * MS_PER_DAY

function normalizeName(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
}

function formatSignedNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "–"
  const formatted = value.toLocaleString("da-DK", {
    maximumFractionDigits: 1,
  })
  if (value > 0) return `+${formatted}`
  return formatted
}

export default function RankOverview({ visningsnavn, kampe }: Props) {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState<OverviewItem[]>([])
  const normalizedTarget = normalizeName(visningsnavn)

  useEffect(() => {
    if (!visningsnavn) return
    let cancelled = false

    async function load() {
      setLoading(true)
      const results: OverviewItem[] = []

      try {
        // 1) Hent rangliste + monthly + alle profiles
        const [rangRes, monthlyRes, profilesRes] = await Promise.all([
          fetch("/api/rangliste", { cache: "no-store" }),
          fetch("/api/monthly", { cache: "no-store" }),
          supabase
            .from("profiles")
            .select("visningsnavn, koen, active, startElo"),
        ])

        /* ---------- RANGLISTEN ---------- */

        let rangDataRaw: any = []
        if (rangRes.ok) {
          rangDataRaw = await rangRes.json()
        } else {
          console.warn(
            "[RankOverview] /api/rangliste gav status",
            rangRes.status
          )
        }

        const rangliste: RanglisteRow[] = Array.isArray(rangDataRaw)
  ? rangDataRaw
  : Array.isArray(rangDataRaw?.data)
  ? rangDataRaw.data
  : []

// profiles læses her, så vi kan se hvem der er aktive
const profiles =
  !profilesRes.error && Array.isArray(profilesRes.data)
    ? profilesRes.data
    : []

// Set over aktive spillere (normaliseret navn)
const activeNameSet = new Set(
  (profiles as any[])
    .filter((p) => p.active === true)
    .map((p) =>
      normalizeName((p?.visningsnavn ?? "").toString())
    )
    .filter(Boolean)
)

// brugt mange steder
const currentEloMap = new Map<string, number>()
for (const r of rangliste) {
  const navn = (r.visningsnavn ?? "").toString().trim()
  const elo = Number(r.elo ?? 0)
  if (!navn || !Number.isFinite(elo)) continue
  currentEloMap.set(normalizeName(navn), elo)
}


        const idxMain = rangliste.findIndex(
  (row) => normalizeName(row.visningsnavn) === normalizedTarget
)
if (idxMain !== -1) {
  const entry = rangliste[idxMain]

  // Beregn placering KUN blandt aktive spillere
  let pos = 0
  for (const row of rangliste) {
    const normName = normalizeName(row.visningsnavn)
    if (!activeNameSet.has(normName)) continue // spring inaktive over
    pos++
    if (normName === normalizedTarget) break
  }

  // fallback hvis spilleren mod forventning ikke er i activeNameSet
  if (pos === 0) {
    pos =
      typeof entry.position === "number" && entry.position > 0
        ? entry.position
        : idxMain + 1
  }

  const eloValue =
    currentEloMap.get(normalizeName(entry.visningsnavn)) ?? null

  results.push({
    key: "main",
    label: "Ranglisten",
    emoji: "🥇",
    href: "/nyrangliste",
    position: pos,
    valueLabel:
      eloValue != null
        ? `Elo ${Math.round(eloValue)}`
        : "Elo –",
  })
}



        /* ---------- MONTHLY ---------- */

        let monthlyDataRaw: any = []
        if (monthlyRes.ok) {
          monthlyDataRaw = await monthlyRes.json()
        } else {
          console.warn(
            "[RankOverview] /api/monthly gav status",
            monthlyRes.status
          )
        }

        const monthlyData: MonthlyRow[] = Array.isArray(monthlyDataRaw)
          ? monthlyDataRaw
          : Array.isArray(monthlyDataRaw?.data)
          ? monthlyDataRaw.data
          : []

        const idxMonthly = monthlyData.findIndex(
          (row) => normalizeName(row.visningsnavn) === normalizedTarget
        )
        if (idxMonthly !== -1) {
          const entry = monthlyData[idxMonthly]
          const pos =
            typeof entry.position === "number" && entry.position > 0
              ? entry.position
              : idxMonthly + 1

          const metric =
            entry.netto ??
            entry.pluspoint ??
            entry.diff ??
            null

          results.push({
            key: "monthly",
            label: "Månedens Spiller",
            emoji: "🌟",
            href: "/monthly",
            position: pos,
            valueLabel: formatSignedNumber(metric),
          })
        }

        /* ---------- PROFILES (GirlPower + WinStreak initialElo) ---------- */

    
        const DEFAULT_START_ELO = 1000
        const initialEloMap: EloMap = {}
        for (const p of profiles as any[]) {
          const navn = (p?.visningsnavn ?? "").toString().trim()
          if (!navn) continue
          const se =
            typeof p.startElo === "number" ? p.startElo : DEFAULT_START_ELO
          initialEloMap[navn] = se
        }

        const womenProfiles = (profiles as any[]).filter(
          (p) => p.active === true && p.koen === "kvinde"
        )

        /* ---------- MEST AKTIVE (som /active, uden API) ---------- */

        try {
          const eloData = await beregnEloÆndringerForIndeværendeMåned()

          const now = new Date()
          const year = now.getFullYear()
          const month = now.getMonth() + 1
          const startDato = `${year}-${String(month).padStart(2, "0")}-01`
          const slutMonth = month === 12 ? 1 : month + 1
          const slutYear = month === 12 ? year + 1 : year
          const slutDato = `${slutYear}-${String(slutMonth).padStart(
            2,
            "0"
          )}-01`

          const { data: kampeData, error } = await supabase
            .from("newresults")
            .select("holdA1, holdA2, holdB1, holdB2, date, finish")
            .gte("date", startDato)
            .lt("date", slutDato)
            .eq("finish", true)

          if (error) {
            console.error(
              "[RankOverview] Fejl ved hentning af kampe til active:",
              error
            )
          } else {
            const tæller: Record<string, number> = Object.create(null)

            for (const kamp of (kampeData as any[] | null) ?? []) {
              const navne = [kamp.holdA1, kamp.holdA2, kamp.holdB1, kamp.holdB2]
              for (const n of navne) {
                const key = typeof n === "string" ? n.trim() : ""
                if (key) tæller[key] = (tæller[key] ?? 0) + 1
              }
            }

            const samlet: AktivSpiller[] = Object.entries(tæller).map(
              ([navn, sæt]) => {
                const plus =
                  (eloData as any[]).find(
                    (e) =>
                      normalizeName(e.visningsnavn) === normalizeName(navn)
                  )?.pluspoint ?? 0
                return { visningsnavn: navn, sæt, pluspoint: plus }
              }
            )

            samlet.sort((a, b) => {
              if (b.sæt !== a.sæt) return b.sæt - a.sæt
              return b.pluspoint - a.pluspoint
            })

            const top20 = samlet.slice(0, 20)

            const idxActive = top20.findIndex(
              (row) => normalizeName(row.visningsnavn) === normalizedTarget
            )

            if (idxActive !== -1) {
              const row = top20[idxActive]
              results.push({
                key: "active",
                label: "Mest aktive",
                emoji: "🏃‍♂️",
                href: "/active",
                position: idxActive + 1,
                valueLabel: `${row.sæt} sæt`,
              })
            }
          }
        } catch (e) {
          console.error("[RankOverview] Fejl i active-beregning:", e)
        }

        /* ---------- GIRLPOWER ---------- */

        const womenSet = new Set(
          (womenProfiles ?? [])
            .map((p: any) =>
              normalizeName((p?.visningsnavn ?? "").toString())
            )
            .filter(Boolean)
        )

        const girlList = rangliste
          .map((r) => ({
            visningsnavn: (r.visningsnavn ?? "").toString().trim(),
            elo: Number(r.elo ?? 0),
          }))
          .filter(
            (r) =>
              !!r.visningsnavn &&
              Number.isFinite(r.elo) &&
              womenSet.has(normalizeName(r.visningsnavn))
          )
          .sort((a, b) => b.elo - a.elo)

        const idxGirl = girlList.findIndex(
          (row) => normalizeName(row.visningsnavn) === normalizedTarget
        )
        if (idxGirl !== -1) {
          const row = girlList[idxGirl]
          results.push({
            key: "women",
            label: "GirlPower Listen",
            emoji: "👸",
            href: "/women",
            position: idxGirl + 1,
            valueLabel: `Elo ${Math.round(row.elo)}`,
          })
        }

        /* ---------- ÆGGEJAGTEN (ud fra kampe-prop) ---------- */

        if (kampe && kampe.length > 0) {
          const eggsMap = new Map<string, number>()

          const addEgg = (name?: string | null) => {
            if (!name) return
            const key = name.toString().trim()
            if (!key) return
            eggsMap.set(key, (eggsMap.get(key) ?? 0) + 1)
          }

          for (const k of kampe as any[]) {
            const finished =
              k.finish === true || k.finish === "true" || k.finish === 1
            if (!finished) continue

            const ha1: string | undefined = k.holda1 ?? k.holdA1
            const ha2: string | undefined = k.holda2 ?? k.holdA2
            const hb1: string | undefined = k.holdb1 ?? k.holdB1
            const hb2: string | undefined = k.holdb2 ?? k.holdB2

            const rawA = k.scorea ?? k.scoreA
            const rawB = k.scoreb ?? k.scoreB

            let scoreA =
              typeof rawA === "number" ? rawA : parseInt(rawA ?? "0", 10)
            let scoreB =
              typeof rawB === "number" ? rawB : parseInt(rawB ?? "0", 10)

            if (isNaN(scoreA) || isNaN(scoreB)) continue

            if (scoreA === 6 && scoreB === 0) {
              addEgg(ha1)
              addEgg(ha2)
            } else if (scoreB === 6 && scoreA === 0) {
              addEgg(hb1)
              addEgg(hb2)
            }
          }

          type EggRow = { visningsnavn: string; eggs: number; elo: number }

          const eggRows: EggRow[] = Array.from(eggsMap.entries())
            .map(([navn, eggs]) => ({
              visningsnavn: navn,
              eggs,
              elo: currentEloMap.get(normalizeName(navn)) ?? 0,
            }))
            .filter((r) => r.eggs > 0)

          eggRows.sort((a, b) => {
            if (b.eggs !== a.eggs) return b.eggs - a.eggs
            if (b.elo !== a.elo) return b.elo - a.elo
            return a.visningsnavn.localeCompare(b.visningsnavn, "da")
          })

          const idxEgg = eggRows.findIndex(
            (row) => normalizeName(row.visningsnavn) === normalizedTarget
          )

          if (idxEgg !== -1) {
            const row = eggRows[idxEgg]
            results.push({
              key: "egg",
              label: "Æggejagten",
              emoji: "🥚",
              href: "/egg",
              position: idxEgg + 1,
              valueLabel: `${row.eggs} æg`,
            })
          }
        }

        /* ---------- WIN-STREAK (ud fra kampe-prop) ---------- */

        if (kampe && kampe.length > 0) {
          const kampListe: Kamp[] = (kampe as any[]).map(
            (k: any, idx: number) => {
              const scoreA = k.scoreA ?? k.scorea ?? 0
              const scoreB = k.scoreB ?? k.scoreb ?? 0

              return {
                id: typeof k.id === "number" ? k.id : idx + 1,
                kampid:
                  typeof k.kampid === "number"
                    ? k.kampid
                    : typeof k.kampId === "number"
                    ? k.kampId
                    : typeof k.id === "number"
                    ? k.id
                    : idx + 1,
                date: k.date ?? k.dato ?? "",
                holdA1: k.holdA1 ?? k.holda1 ?? "",
                holdA2: k.holdA2 ?? k.holda2 ?? "",
                holdB1: k.holdB1 ?? k.holdb1 ?? "",
                holdB2: k.holdB2 ?? k.holdb2 ?? "",
                scoreA:
                  typeof scoreA === "number" ? scoreA : parseInt(scoreA ?? "0", 10),
                scoreB:
                  typeof scoreB === "number" ? scoreB : parseInt(scoreB ?? "0", 10),
                finish: Boolean(k.finish),
                event: Boolean(k.event),
                tiebreak: k.tiebreak ?? k.tieBreak ?? "",
                indberettet_af: k.indberettet_af,
              }
            }
          )

          const { eloChanges } = beregnEloForKampe(kampListe, initialEloMap)

          type PlayerSet = {
            date: string
            won: boolean
            eloDiff: number
          }

          const playerMap = new Map<string, PlayerSet[]>()

          const ensurePlayer = (name: string): PlayerSet[] => {
            const trimmed = name.trim()
            if (!trimmed) return []
            let arr = playerMap.get(trimmed)
            if (!arr) {
              arr = []
              playerMap.set(trimmed, arr)
            }
            return arr
          }

          for (const kamp of kampListe) {
            const changesForKamp = eloChanges[kamp.id]
            if (!changesForKamp) continue

            const finished =
              kamp.finish === true ||
              kamp.finish === (true as any) ||
              kamp.finish === (1 as any)
            if (!finished) continue

            const ha1 = kamp.holdA1
            const ha2 = kamp.holdA2
            const hb1 = kamp.holdB1
            const hb2 = kamp.holdB2

            const scoreA = kamp.scoreA
            const scoreB = kamp.scoreB

            if (!Number.isFinite(scoreA) || !Number.isFinite(scoreB)) continue
            if (scoreA === scoreB) continue

            const aWon = scoreA > scoreB
            const bWon = scoreB > scoreA

            const deltagere = [ha1, ha2, hb1, hb2].filter(Boolean) as string[]

            for (const navn of deltagere) {
              const c = changesForKamp[navn]
              const eloDiff = c?.diff ?? 0

              const isA = navn === ha1 || navn === ha2
              const isB = navn === hb1 || navn === hb2

              let won = false
              if (isA && aWon) won = true
              if (isB && bWon) won = true

              const arr = ensurePlayer(navn)
              arr.push({
                date: kamp.date,
                won,
                eloDiff,
              })
            }
          }

          type BestForPlayer = {
            visningsnavn: string
            bestStreak: number
            streakElo: number
          }

          const bestList: BestForPlayer[] = []

          for (const [navn, sets] of playerMap.entries()) {
            if (!sets.length) continue

            let bestStreak = 0
            let bestElo = 0

            let curStreak = 0
            let curElo = 0

            for (let i = 0; i < sets.length; i++) {
              const s = sets[i]
              if (s.won) {
                curStreak++
                curElo += s.eloDiff

                if (
                  curStreak > bestStreak ||
                  (curStreak === bestStreak && curElo > bestElo)
                ) {
                  bestStreak = curStreak
                  bestElo = curElo
                }
              } else {
                curStreak = 0
                curElo = 0
              }
            }

            if (bestStreak > 0) {
              bestList.push({
                visningsnavn: navn,
                bestStreak,
                streakElo: bestElo,
              })
            }
          }

          type StreakRow = {
            visningsnavn: string
            bestStreak: number
            streakElo: number
            currentElo: number | null
          }

          let streakRows: StreakRow[] = bestList.map((b) => {
            const currentElo =
              currentEloMap.get(normalizeName(b.visningsnavn)) ?? null
            return {
              visningsnavn: b.visningsnavn,
              bestStreak: b.bestStreak,
              streakElo: b.streakElo,
              currentElo,
            }
          })

          streakRows = streakRows.sort((a, b) => {
            if (b.bestStreak !== a.bestStreak) return b.bestStreak - a.bestStreak
            if (b.streakElo !== a.streakElo) return b.streakElo - a.streakElo
            const eloA = a.currentElo ?? 0
            const eloB = b.currentElo ?? 0
            if (eloB !== eloA) return eloB - eloA
            return a.visningsnavn.localeCompare(b.visningsnavn, "da")
          })

          const idxWin = streakRows.findIndex(
            (row) => normalizeName(row.visningsnavn) === normalizedTarget
          )

          if (idxWin !== -1) {
            const row = streakRows[idxWin]
            results.push({
              key: "winstreak",
              label: "Win-Streak",
              emoji: "🔥",
              href: "/winstreak",
              position: idxWin + 1,
              valueLabel: `${row.bestStreak} sæt i træk`,
            })
          }
        }

        /* ---------- 5 GAMES STREAK (PlayStreak – ud fra kampe-prop) ---------- */

        if (kampe && kampe.length > 0) {
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

          const isFinished = (k: any): boolean =>
            k.finish === true || k.finish === "true" || k.finish === 1

          for (const k of kampe as any[]) {
            if (!isFinished(k)) continue

            const dateStr: string | undefined = k.date
            if (!dateStr) continue

            const dt = new Date(dateStr)
            if (isNaN(dt.getTime())) continue

            const ha1: string | undefined = k.holda1 ?? k.holdA1
            const ha2: string | undefined = k.holda2 ?? k.holdA2
            const hb1: string | undefined = k.holdb1 ?? k.holdB1
            const hb2: string | undefined = k.holdb2 ?? k.holdB2

            const players = [ha1, ha2, hb1, hb2].filter(Boolean) as string[]
            if (!players.length) continue

            const weekday = (dt.getDay() + 6) % 7
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

          type PlayStreakRowLocal = {
            visningsnavn: string
            weeks: number
            totalSets: number
            startDate: string | null
            endDate: string | null
            currentElo: number | null
          }

          const bestRows: PlayStreakRowLocal[] = []

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

            if (diffWeeks >= 2) {
              // Streaken er ikke længere "aktuel"
              continue
            }

            const startDate = qualifying[startIdx].firstDate
            const endDate = qualifying[endIdx].lastDate

            bestRows.push({
              visningsnavn: navn,
              weeks,
              totalSets,
              startDate,
              endDate,
              currentElo:
                currentEloMap.get(normalizeName(navn)) ?? null,
            })
          }

          let playRows = bestRows.sort((a, b) => {
            if (b.weeks !== a.weeks) return b.weeks - a.weeks
            if (b.totalSets !== a.totalSets) return b.totalSets - a.totalSets
            const eloA = a.currentElo ?? 0
            const eloB = b.currentElo ?? 0
            if (eloB !== eloA) return eloB - eloA
            return a.visningsnavn.localeCompare(b.visningsnavn, "da")
          })

          const idxPlay = playRows.findIndex(
            (row) => normalizeName(row.visningsnavn) === normalizedTarget
          )

          if (idxPlay !== -1) {
            const row = playRows[idxPlay]
            results.push({
              key: "playstreak",
              label: "5 Games Streak",
              emoji: "🎯",
              href: "/playstreak",
              position: idxPlay + 1,
              valueLabel: `${row.weeks} uger`,
            })
          }
        }

        if (!cancelled) {
          setItems(results)
          setLoading(false)
        }
      } catch (e) {
        console.error("[RankOverview] Fejl i load():", e)
        if (!cancelled) {
          setItems([])
          setLoading(false)
        }
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [visningsnavn, normalizedTarget, kampe])

  if (loading) {
    return (
      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-4 text-sm text-slate-300">
        Henter dine ranglister…
      </section>
    )
  }

  if (items.length === 0) {
    return (
      <section className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-4 text-xs text-slate-400">
        Du optræder endnu ikke på nogen ranglister – bliv ved med at spille 💪
      </section>
    )
  }

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-4 shadow-sm">
      <h2 className="text-sm font-semibold mb-3 flex items-center gap-2 text-slate-100">
        ⚡ Hurtigt overblik
        <span className="text-[11px] font-normal text-slate-400">
          dine placeringer på ranglister
        </span>
      </h2>

      <div className="space-y-1 text-sm">
        {items.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            className="flex items-center justify-between rounded-xl px-3 py-2 hover:bg-slate-800 transition"
          >
            <div className="flex items-center gap-2">
              <span className="text-base">{item.emoji}</span>
              <span className="font-medium text-slate-100">
                {item.label}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-300">
                {item.valueLabel}
              </span>
              <span className="text-xs px-2 py-1 rounded-lg bg-slate-950 border border-slate-700 min-w-[3rem] text-center text-slate-100">
                #{item.position}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
