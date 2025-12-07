"use client"

import { useMemo } from "react"
import { EloPoint } from "@/lib/beregnEloHistorik"

type EloStatsProps = {
  visningsnavn: string
  eloHistory: EloPoint[]
}

type StatTriple = {
  max: number | null
  min: number | null
  avg: number | null
  maxDate: string | null
  minDate: string | null
}

export function EloStats({ visningsnavn, eloHistory }: EloStatsProps) {
  const { last30, last90, thisYear } = useMemo(() => {
    // Samme "sidste Elo pr. dag"-logik som grafen:
    const byDate = new Map<string, { date: string; elo: number }>()
    for (const p of eloHistory) {
      if (!p.date) continue
      byDate.set(p.date, { date: p.date, elo: p.elo })
    }

    const daily = Array.from(byDate.values()).sort((a, b) =>
      a.date.localeCompare(b.date)
    )

    const now = new Date()
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(now.getDate() - 30)

    const ninetyDaysAgo = new Date()
    ninetyDaysAgo.setDate(now.getDate() - 90)

    const currentYear = now.getFullYear()

    const last30Entries: { date: string; elo: number }[] = []
    const last90Entries: { date: string; elo: number }[] = []
    const thisYearEntries: { date: string; elo: number }[] = []

    for (const d of daily) {
      const dt = new Date(d.date)
      if (isNaN(dt.getTime())) continue

      if (dt >= thirtyDaysAgo && dt <= now) {
        last30Entries.push(d)
      }
      if (dt >= ninetyDaysAgo && dt <= now) {
        last90Entries.push(d)
      }
      if (dt.getFullYear() === currentYear) {
        thisYearEntries.push(d)
      }
    }

    const makeStats = (entries: { date: string; elo: number }[]): StatTriple => {
      if (!entries.length) {
        return {
          max: null,
          min: null,
          avg: null,
          maxDate: null,
          minDate: null,
        }
      }

      let max = -Infinity
      let min = Infinity
      let maxDate: string | null = null
      let minDate: string | null = null
      let sum = 0

      for (const e of entries) {
        const v = e.elo
        sum += v
        if (v > max) {
          max = v
          maxDate = e.date
        }
        if (v < min) {
          min = v
          minDate = e.date
        }
      }

      const avg = sum / entries.length

      return {
        max,
        min,
        avg,
        maxDate,
        minDate,
      }
    }

    return {
      last30: makeStats(last30Entries),
      last90: makeStats(last90Entries),
      thisYear: makeStats(thisYearEntries),
    }
  }, [eloHistory])

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return ""
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr
    return d.toLocaleDateString("da-DK", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })
  }

  const formatValWithDate = (value: number | null, dateStr: string | null) => {
    if (value === null) return "–"
    const rounded = Math.round(value)
    if (!dateStr) return `${rounded}`
    return `${rounded} (${formatDate(dateStr)})`
  }

  const formatAvg = (value: number | null) =>
    value === null ? "–" : Math.round(value)

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <h2 className="text-lg font-semibold mb-3">
        Elo-statistik for {visningsnavn}
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
        {/* Seneste 30 dage */}
        <div className="rounded-xl border border-pink-500/40 bg-pink-500/5 p-3 space-y-2">
          <p className="text-xs uppercase tracking-wide text-pink-300">
            Seneste 30 dage
          </p>
          <div className="flex flex-col gap-1">
            <div className="flex justify-between">
              <span className="text-slate-300">Højeste Elo</span>
              <span className="font-semibold text-pink-300 text-right">
                {formatValWithDate(last30.max, last30.maxDate)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-300">Laveste Elo</span>
              <span className="font-semibold text-pink-300 text-right">
                {formatValWithDate(last30.min, last30.minDate)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-300">Gns. Elo</span>
              <span className="font-semibold text-pink-300">
                {formatAvg(last30.avg)}
              </span>
            </div>
          </div>
          <p className="text-[11px] text-pink-200/70 mt-1">
            Baseret på din sidste Elo-værdi for hver dag med aktivitet.
          </p>
        </div>

        {/* Seneste 90 dage */}
        <div className="rounded-xl border border-indigo-500/40 bg-indigo-500/5 p-3 space-y-2">
          <p className="text-xs uppercase tracking-wide text-indigo-300">
            Seneste 90 dage
          </p>
          <div className="flex flex-col gap-1">
            <div className="flex justify-between">
              <span className="text-slate-300">Højeste Elo</span>
              <span className="font-semibold text-indigo-300 text-right">
                {formatValWithDate(last90.max, last90.maxDate)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-300">Laveste Elo</span>
              <span className="font-semibold text-indigo-300 text-right">
                {formatValWithDate(last90.min, last90.minDate)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-300">Gns. Elo</span>
              <span className="font-semibold text-indigo-300">
                {formatAvg(last90.avg)}
              </span>
            </div>
          </div>
          <p className="text-[11px] text-indigo-200/70 mt-1">
            God til at se din “formkurve” over en lidt længere periode.
          </p>
        </div>

        {/* Dette år */}
        <div className="rounded-xl border border-slate-600/60 bg-slate-800/60 p-3 space-y-2">
          <p className="text-xs uppercase tracking-wide text-slate-200">
            Dette år
          </p>
          <div className="flex flex-col gap-1">
            <div className="flex justify-between">
              <span className="text-slate-300">Højeste Elo</span>
              <span className="font-semibold text-slate-50 text-right">
                {formatValWithDate(thisYear.max, thisYear.maxDate)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-300">Laveste Elo</span>
              <span className="font-semibold text-slate-50 text-right">
                {formatValWithDate(thisYear.min, thisYear.minDate)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-300">Gns. Elo</span>
              <span className="font-semibold text-slate-50">
                {formatAvg(thisYear.avg)}
              </span>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Overblik over hele kalenderåret – alle dage med aktivitet er med.
          </p>
        </div>
      </div>
    </div>
  )
}
