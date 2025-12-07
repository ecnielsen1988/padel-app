"use client"

import { useMemo } from "react"
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts"
import { EloPoint } from "@/lib/beregnEloHistorik"

type EloChartProps = {
  visningsnavn: string
  eloHistory: EloPoint[]
  compareHistory: EloPoint[]
  compareName: string | null
}

export function EloChart({
  visningsnavn,
  eloHistory,
  compareHistory,
  compareName,
}: EloChartProps) {
  // ====== GRAF-DATA (to spillere) ======
  const { chartData, domainY, domainX } = useMemo(() => {
    if (!eloHistory.length) {
      return {
        chartData: [] as any[],
        domainY: [0, 0] as [number, number],
        domainX: [0, 0] as [number, number],
      }
    }

    // Helper: lav "sidste Elo pr. dag" for en historik
    const toDaily = (hist: EloPoint[]) => {
      const withDates = hist.filter((p) => p.date)
      const byDate = new Map<string, EloPoint>()
      for (const p of withDates) {
        if (!p.date) continue
        byDate.set(p.date, p) // sidste værdi på dagen
      }
      return Array.from(byDate.entries()).map(([date, p]) => {
        const t = Date.parse(date)
        return {
          x: isNaN(t) ? Date.now() : t,
          elo: Math.round(p.elo),
          dateLabel: date,
        }
      })
    }

    const mainDaily = toDaily(eloHistory)
    if (!mainDaily.length) {
      return {
        chartData: [] as any[],
        domainY: [0, 0] as [number, number],
        domainX: [0, 0] as [number, number],
      }
    }

    const compareDaily = compareHistory.length ? toDaily(compareHistory) : []

    // Merge de to datasæt på x (dato)
    const mapByX = new Map<
      number,
      { x: number; mainElo?: number; compareElo?: number; dateLabel?: string }
    >()

    for (const p of mainDaily) {
      mapByX.set(p.x, {
        x: p.x,
        mainElo: p.elo,
        dateLabel: p.dateLabel,
      })
    }

    for (const p of compareDaily) {
      const existing = mapByX.get(p.x)
      if (existing) {
        existing.compareElo = p.elo
      } else {
        mapByX.set(p.x, {
          x: p.x,
          compareElo: p.elo,
          dateLabel: p.dateLabel,
        })
      }
    }

    const merged = Array.from(mapByX.values()).sort((a, b) => a.x - b.x)

    // Y-axis domain: baseret på begge spillere
    const eloValues: number[] = []
    for (const p of merged) {
      if (typeof p.mainElo === "number") eloValues.push(p.mainElo)
      if (typeof p.compareElo === "number") eloValues.push(p.compareElo)
    }

    if (!eloValues.length) {
      return {
        chartData: [] as any[],
        domainY: [0, 0] as [number, number],
        domainX: [0, 0] as [number, number],
      }
    }

    const minElo = Math.min(...eloValues)
    const maxElo = Math.max(...eloValues)

    const minY = Math.floor(minElo / 100) * 100
    const maxY = Math.ceil(maxElo / 100) * 100

    const first = merged[0].x
    const last = merged[merged.length - 1].x

    return {
      chartData: merged,
      domainY: [minY, maxY] as [number, number],
      domainX: [first, last] as [number, number],
    }
  }, [eloHistory, compareHistory])

  const hasChart = chartData.length > 1 && domainX[0] !== domainX[1]

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <h2 className="text-lg font-semibold mb-2">Elo over tid</h2>

      {!hasChart ? (
        <p className="text-sm text-slate-400">
          Der er endnu ikke registreret nok data til at vise en graf for{" "}
          <strong>{visningsnavn}</strong>.
        </p>
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis
                dataKey="x"
                type="number"
                domain={domainX}
                tickFormatter={(value) =>
                  new Date(value).toLocaleDateString("da-DK", {
                    day: "2-digit",
                    month: "2-digit",
                  })
                }
                tick={{ fontSize: 11, fill: "#cbd5f5" }}
              />
              <YAxis
                domain={domainY}
                tick={{ fontSize: 11, fill: "#cbd5f5" }}
                width={50}
              />
              <Tooltip
                formatter={(value: any, name) => {
                  if (name === "mainElo") return [`${value}`, visningsnavn]
                  if (name === "compareElo")
                    return [
                      `${value}`,
                      compareName ?? "Anden spiller",
                    ]
                  return [`${value}`, name]
                }}
                labelFormatter={(label: any) =>
                  new Date(label).toLocaleDateString("da-DK", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  })
                }
                contentStyle={{
                  background: "#020617",
                  border: "1px solid #f472b6",
                  borderRadius: "0.75rem",
                  fontSize: "0.75rem",
                }}
              />
              <Legend
                wrapperStyle={{
                  fontSize: "0.75rem",
                  paddingTop: 8,
                }}
                formatter={(value) => {
                  if (value === "mainElo") return visningsnavn
                  if (value === "compareElo")
                    return compareName ?? "Anden spiller"
                  return value
                }}
              />
              <Line
                type="monotone"
                dataKey="mainElo"
                stroke="#f472b6"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
                connectNulls={true}
              />
              {compareName && (
                <Line
                  type="monotone"
                  dataKey="compareElo"
                  stroke="#22d3ee"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                  connectNulls={true}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {hasChart && (
        <p className="mt-3 text-xs text-slate-500">
          Grafen viser din sidste Elo for hver dag, hvor du har spillet – og
          eventuelt en ekstra spiller til sammenligning. Y-aksen er rundet til
          nærmeste 100 for at fremhæve udviklingen.
        </p>
      )}
    </div>
  )
}
