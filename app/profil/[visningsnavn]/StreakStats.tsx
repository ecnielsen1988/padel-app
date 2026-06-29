"use client"

import { useMemo } from "react"

type StreakStatsProps = {
  visningsnavn: string
  kampe: any[]
}

type WinStreakInfo = {
  current: number
  currentStartDate: string | null
  currentEndDate: string | null
  best: number
  bestStartDate: string | null
  bestEndDate: string | null
}

type WeekEntry = {
  weekStart: Date
  count: number
  firstDate: string
  lastDate: string
}

type WeekStreakInfo = {
  current: number
  currentStartDate: string | null
  currentEndDate: string | null
  best: number
  bestStartDate: string | null
  bestEndDate: string | null
}

const MS_PER_DAY = 24 * 60 * 60 * 1000
const MS_PER_WEEK = 7 * MS_PER_DAY
const MIN_SETS_PER_WEEK = 5 // 👈 nu 5 i stedet for 6

export function StreakStats({ visningsnavn, kampe }: StreakStatsProps) {
  const { winStreak, weekStreak } = useMemo(() => {
    // -------- Helper: check finish ----------
    const isFinished = (k: any): boolean =>
      k.finish === true || k.finish === "true" || k.finish === 1

    // -------- Helper: sejr-streak ----------
    type PlayerSet = { date: string; playerWon: boolean }

    const playerSets: PlayerSet[] = []

    // til spil-streak (uger)
    const weekMap: Record<string, WeekEntry> = {}

    const now = new Date()

    for (const k of kampe) {
      const dateStr: string | undefined = k.date
      if (!dateStr) continue

      if (!isFinished(k)) continue

      const dt = new Date(dateStr)
      if (isNaN(dt.getTime())) continue

      const ha1: string | undefined = k.holda1 ?? k.holdA1
      const ha2: string | undefined = k.holda2 ?? k.holdA2
      const hb1: string | undefined = k.holdb1 ?? k.holdB1
      const hb2: string | undefined = k.holdb2 ?? k.holdB2

      const isA = ha1 === visningsnavn || ha2 === visningsnavn
      const isB = hb1 === visningsnavn || hb2 === visningsnavn
      if (!isA && !isB) continue

      const rawA = k.scorea ?? k.scoreA
      const rawB = k.scoreb ?? k.scoreB

      let scoreA =
        typeof rawA === "number" ? rawA : parseInt(rawA ?? "0", 10)
      let scoreB =
        typeof rawB === "number" ? rawB : parseInt(rawB ?? "0", 10)

      if (isNaN(scoreA) || isNaN(scoreB)) continue
      if (scoreA === scoreB) continue // ingen uafgjorte sæt

      const playerWon =
        (isA && scoreA > scoreB) ||
        (isB && scoreB > scoreA)

      // til sejr-streak
      playerSets.push({ date: dateStr, playerWon })

      // til uge-streak (min. 5 sæt/uge)
      // Uge = mandag–søndag. Find mandag for denne dato.
      const weekday = (dt.getDay() + 6) % 7 // mandag=0
      const weekStart = new Date(dt)
      weekStart.setDate(dt.getDate() - weekday)
      weekStart.setHours(0, 0, 0, 0)

      const weekKey = weekStart.toISOString().slice(0, 10)
      const entry = weekMap[weekKey]
      if (!entry) {
        weekMap[weekKey] = {
          weekStart,
          count: 1,
          firstDate: dateStr,
          lastDate: dateStr,
        }
      } else {
        entry.count += 1
        if (dateStr < entry.firstDate) entry.firstDate = dateStr
        if (dateStr > entry.lastDate) entry.lastDate = dateStr
      }
    }

    // -------- SEJR-STREAK (per sæt) --------
    let winStreak: WinStreakInfo = {
      current: 0,
      currentStartDate: null,
      currentEndDate: null,
      best: 0,
      bestStartDate: null,
      bestEndDate: null,
    }

    if (playerSets.length > 0) {
      // sortér kronologisk
      playerSets.sort(
        (a, b) =>
          new Date(a.date).getTime() - new Date(b.date).getTime()
      )

      const n = playerSets.length

      // Aktuel streak (baglæns)
      let current = 0
      let currentStartIdx: number | null = null
      let currentEndIdx: number | null = null

      for (let i = n - 1; i >= 0; i--) {
        if (playerSets[i].playerWon) {
          current++
          currentStartIdx = i
          if (currentEndIdx === null) currentEndIdx = n - 1
        } else {
          break
        }
      }

      // Længste streak (hele historikken)
      let best = 0
      let bestStartIdx: number | null = null
      let bestEndIdx: number | null = null
      let tempLen = 0
      let tempStart = -1

      for (let i = 0; i < n; i++) {
        if (playerSets[i].playerWon) {
          if (tempLen === 0) tempStart = i
          tempLen++
          if (tempLen > best) {
            best = tempLen
            bestStartIdx = tempStart
            bestEndIdx = i
          }
        } else {
          tempLen = 0
          tempStart = -1
        }
      }

      winStreak = {
        current,
        currentStartDate:
          current > 0 && currentStartIdx !== null
            ? playerSets[currentStartIdx].date
            : null,
        currentEndDate:
          current > 0 && currentEndIdx !== null
            ? playerSets[currentEndIdx].date
            : null,
        best,
        bestStartDate:
          best > 0 && bestStartIdx !== null
            ? playerSets[bestStartIdx].date
            : null,
        bestEndDate:
          best > 0 && bestEndIdx !== null
            ? playerSets[bestEndIdx].date
            : null,
      }
    }

    // -------- SPIL-STREAK (uger med >= 5 sæt) --------
    let weekStreak: WeekStreakInfo = {
      current: 0,
      currentStartDate: null,
      currentEndDate: null,
      best: 0,
      bestStartDate: null,
      bestEndDate: null,
    }

    const weekEntries: WeekEntry[] = Object.values(weekMap)

    if (weekEntries.length > 0) {
      // Tag kun uger med mindst 5 sæt
      const qualifying = weekEntries
        .filter((w) => w.count >= MIN_SETS_PER_WEEK)
        .sort(
          (a, b) =>
            a.weekStart.getTime() - b.weekStart.getTime()
        )

      if (qualifying.length > 0) {
        // Aktuel ugestreak: baglæns fra sidste kvalificerende uge
        let current = 1
        let startIdx = qualifying.length - 1
        const endIdx = qualifying.length - 1

        for (let i = qualifying.length - 1; i > 0; i--) {
          const curr = qualifying[i]
          const prev = qualifying[i - 1]
          const diff =
            curr.weekStart.getTime() - prev.weekStart.getTime()
          if (diff === MS_PER_WEEK) {
            current++
            startIdx = i - 1
          } else {
            break
          }
        }

        // Tjek om streaken stadig er "aktuel" (samme eller forrige uge)
        const lastQual = qualifying[endIdx]

        const currentWeekStart = new Date(now)
        const weekdayNow = (currentWeekStart.getDay() + 6) % 7 // mandag=0
        currentWeekStart.setDate(currentWeekStart.getDate() - weekdayNow)
        currentWeekStart.setHours(0, 0, 0, 0)

        const diffToCurrent =
          currentWeekStart.getTime() - lastQual.weekStart.getTime()
        const diffWeeks = Math.round(diffToCurrent / MS_PER_WEEK)

        if (diffWeeks >= 2) {
          // Mindst én hel uge er gået siden sidste kvalificerende uge → streak brudt
          weekStreak.current = 0
          weekStreak.currentStartDate = null
          weekStreak.currentEndDate = null
        } else {
          // stadig aktuel
          weekStreak.current = current
          weekStreak.currentStartDate = qualifying[startIdx].firstDate
          weekStreak.currentEndDate = qualifying[endIdx].lastDate
        }

        // Længste streak igennem historikken (uafhængigt af "aktuel")
        let best = 1
        let bestStartIdx = 0
        let bestEndIdx = 0

        let tempLen = 1
        let tempStartIdx = 0

        for (let i = 1; i < qualifying.length; i++) {
          const curr = qualifying[i]
          const prev = qualifying[i - 1]
          const diff =
            curr.weekStart.getTime() - prev.weekStart.getTime()
          if (diff === MS_PER_WEEK) {
            tempLen++
          } else {
            if (tempLen > best) {
              best = tempLen
              bestStartIdx = tempStartIdx
              bestEndIdx = i - 1
            }
            tempLen = 1
            tempStartIdx = i
          }
        }

        // check sidste streak
        if (tempLen > best) {
          best = tempLen
          bestStartIdx = tempStartIdx
          bestEndIdx = qualifying.length - 1
        }

        weekStreak.best = best
        weekStreak.bestStartDate =
          qualifying[bestStartIdx].firstDate
        weekStreak.bestEndDate =
          qualifying[bestEndIdx].lastDate
      }
    }

    return { winStreak, weekStreak }
  }, [kampe, visningsnavn])

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "–"
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr
    return d.toLocaleDateString("da-DK", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })
  }

  const formatRange = (start: string | null, end: string | null) => {
    if (!start && !end) return "–"
    if (start && !end) return formatDate(start)
    if (!start && end) return formatDate(end)
    if (start === end) return formatDate(start)
    return `${formatDate(start)} – ${formatDate(end)}`
  }

  return (
    <div className="mt-2 rounded-[20px] border border-[#ececf1] bg-white p-4 shadow-[0_6px_20px_rgba(15,23,42,0.06)]">
      <h2 className="mb-3 text-[13px] font-bold uppercase tracking-[0.12em] text-[#2d3340]">
        Streaks for {visningsnavn}
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        {/* Sejr-streak */}
        <div className="space-y-2 rounded-[16px] border border-[#f7a9c8] bg-[#fff0f5] p-3">
          <p className="text-xs uppercase tracking-wide text-[#c0135a]">
            Sejr-streak (færdigspillede sæt)
          </p>
          <div className="flex flex-col gap-1">
            <div className="flex justify-between">
              <span className="text-[#6d7280]">
                Aktuel sejrstreak
              </span>
              <span className="font-semibold text-[#8f174f]">
                {winStreak.current} sæt
              </span>
            </div>
            {winStreak.current > 0 && (
              <div className="flex justify-between text-xs text-[#8a8f9c]">
                <span>Periode</span>
                <span>
                  {formatRange(
                    winStreak.currentStartDate,
                    winStreak.currentEndDate
                  )}
                </span>
              </div>
            )}
            <div className="flex justify-between mt-2">
              <span className="text-[#6d7280]">
                Længste sejrstreak
              </span>
              <span className="font-semibold text-[#8f174f]">
                {winStreak.best} sæt
              </span>
            </div>
            {winStreak.best > 0 && (
              <div className="flex justify-between text-xs text-[#8a8f9c]">
                <span>Periode</span>
                <span>
                  {formatRange(
                    winStreak.bestStartDate,
                    winStreak.bestEndDate
                  )}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Spil-streak */}
        <div className="space-y-2 rounded-[16px] border border-[#c8d7ff] bg-[#eef4ff] p-3">
          <p className="text-xs uppercase tracking-wide text-[#3754a5]">
            Spil-streak (uger med ≥ {MIN_SETS_PER_WEEK} sæt)
          </p>
          <div className="flex flex-col gap-1">
            <div className="flex justify-between">
              <span className="text-[#6d7280]">
                Aktuel spil-streak
              </span>
              <span className="font-semibold text-[#3754a5]">
                {weekStreak.current} uger
              </span>
            </div>
            {weekStreak.current > 0 && (
              <div className="flex justify-between text-xs text-[#8a8f9c]">
                <span>Periode</span>
                <span>
                  {formatRange(
                    weekStreak.currentStartDate,
                    weekStreak.currentEndDate
                  )}
                </span>
              </div>
            )}
            <div className="flex justify-between mt-2">
              <span className="text-[#6d7280]">
                Længste spil-streak
              </span>
              <span className="font-semibold text-[#3754a5]">
                {weekStreak.best} uger
              </span>
            </div>
            {weekStreak.best > 0 && (
              <div className="flex justify-between text-xs text-[#8a8f9c]">
                <span>Periode</span>
                <span>
                  {formatRange(
                    weekStreak.bestStartDate,
                    weekStreak.bestEndDate
                  )}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      <p className="mt-2 text-[11px] text-[#8a8f9c]">
        Sejr-streak er baseret på færdigspillede sæt, hvor du har vundet.
        Spil-streak tæller uger (mandag–søndag), hvor du har spillet mindst {MIN_SETS_PER_WEEK} 
        {" "}færdigspillede sæt. En spil-streak er kun aktuel, hvis den slutter i denne uge
        eller forrige uge – ellers regnes den som brudt.
      </p>
    </div>
  )
}
