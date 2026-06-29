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
  const { last30, last90, lastYear } = useMemo(() => {
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
    const lastYearEntries: { date: string; elo: number }[] = []

    for (const d of daily) {
      const dt = new Date(d.date)
      if (isNaN(dt.getTime())) continue

      if (dt >= thirtyDaysAgo && dt <= now) {
        last30Entries.push(d)
      }
      if (dt >= ninetyDaysAgo && dt <= now) {
        last90Entries.push(d)
      }
      if (dt.getFullYear() >= currentYear - 1) {
        lastYearEntries.push(d)
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
      lastYear: makeStats(lastYearEntries),
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
    <div className="rounded-[20px] border border-[#ececf1] bg-white p-4 shadow-[0_6px_20px_rgba(15,23,42,0.06)]">
      <h2 className="mb-3 text-[13px] font-bold uppercase tracking-[0.12em] text-[#2d3340]">
        Elo-statistik for {visningsnavn}
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
        {/* Seneste 30 dage */}
        <div className="space-y-2 rounded-[16px] border border-[#f7a9c8] bg-[#fff0f5] p-3">
          <p className="text-xs uppercase tracking-wide text-[#c0135a]">
            Seneste 30 dage
          </p>
          <div className="flex flex-col gap-1">
            <div className="flex justify-between">
              <span className="text-[#6d7280]">Højeste Elo</span>
              <span className="text-right font-semibold text-[#8f174f]">
                {formatValWithDate(last30.max, last30.maxDate)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#6d7280]">Laveste Elo</span>
              <span className="text-right font-semibold text-[#8f174f]">
                {formatValWithDate(last30.min, last30.minDate)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#6d7280]">Gns. Elo</span>
              <span className="font-semibold text-[#8f174f]">
                {formatAvg(last30.avg)}
              </span>
            </div>
          </div>
          <p className="mt-1 text-[11px] text-[#ad5d7d]">
            Baseret på din sidste Elo-værdi for hver dag med aktivitet.
          </p>
        </div>

        {/* Seneste 90 dage */}
        <div className="space-y-2 rounded-[16px] border border-[#c8d7ff] bg-[#eef4ff] p-3">
          <p className="text-xs uppercase tracking-wide text-[#3754a5]">
            Seneste 90 dage
          </p>
          <div className="flex flex-col gap-1">
            <div className="flex justify-between">
              <span className="text-[#6d7280]">Højeste Elo</span>
              <span className="text-right font-semibold text-[#3754a5]">
                {formatValWithDate(last90.max, last90.maxDate)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#6d7280]">Laveste Elo</span>
              <span className="text-right font-semibold text-[#3754a5]">
                {formatValWithDate(last90.min, last90.minDate)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#6d7280]">Gns. Elo</span>
              <span className="font-semibold text-[#3754a5]">
                {formatAvg(last90.avg)}
              </span>
            </div>
          </div>
          <p className="mt-1 text-[11px] text-[#6781c4]">
            God til at se din “formkurve” over en lidt længere periode.
          </p>
        </div>

        {/* Seneste år */}
        <div className="space-y-2 rounded-[16px] border border-[#d8dce5] bg-[#f5f7fb] p-3">
          <p className="text-xs uppercase tracking-wide text-[#495063]">
            Seneste år
          </p>
          <div className="flex flex-col gap-1">
            <div className="flex justify-between">
              <span className="text-[#6d7280]">Højeste Elo</span>
              <span className="text-right font-semibold text-[#1f2430]">
                {formatValWithDate(lastYear.max, lastYear.maxDate)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#6d7280]">Laveste Elo</span>
              <span className="text-right font-semibold text-[#1f2430]">
                {formatValWithDate(lastYear.min, lastYear.minDate)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#6d7280]">Gns. Elo</span>
              <span className="font-semibold text-[#1f2430]">
                {formatAvg(lastYear.avg)}
              </span>
            </div>
          </div>
          <p className="mt-1 text-[11px] text-[#8a8f9c]">
            Overblik over de seneste 12 måneder med alle dage, hvor du har spillet.
          </p>
        </div>
      </div>
    </div>
  )
}
