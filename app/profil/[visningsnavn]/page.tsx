"use client"

import { useEffect, useState, useMemo } from "react"
import { useParams } from "next/navigation"
import { supabase } from "@/lib/supabaseClient"
import {
  EloPoint,
  hentEloHistorikForSpiller,
  findCurrentEloForSpiller,
} from "@/lib/beregnEloHistorik"
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

type ProfilState = {
  loading: boolean
  error: string | null
  eloHistory: EloPoint[]
  currentElo: number | null
  kampCount: number
  profiles: { visningsnavn: string }[]
  kampe: any[]
  initialEloMap: Record<string, number>
  compareName: string | null
  compareHistory: EloPoint[]
  compareCurrentElo: number | null
}

/**
 * Henter ALLE rækker fra newresults via pagination,
 * da Supabase/PostgREST typisk har max 1000 rækker per request.
 */
async function fetchAllNewresults(): Promise<any[]> {
  const PAGE_SIZE = 1000
  let all: any[] = []
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
      console.error("Fejl ved pagineret hentning af newresults:", error)
      if (page === 0) throw error
      break
    }

    const batch = data ?? []
    all = all.concat(batch)

    if (batch.length < PAGE_SIZE) {
      // Sidste side
      break
    }

    page++
  }

  return all
}

export default function ProfilSide() {
  const params = useParams<{ visningsnavn: string }>()
  const visningsnavn = decodeURIComponent(
    (params?.visningsnavn as string | undefined) ?? ""
  )

  const [state, setState] = useState<ProfilState>({
    loading: true,
    error: null,
    eloHistory: [],
    currentElo: null,
    kampCount: 0,
    profiles: [],
    kampe: [],
    initialEloMap: {},
    compareName: null,
    compareHistory: [],
    compareCurrentElo: null,
  })

  // Lokalt input-field til søgning/valg af spiller
  const [compareInput, setCompareInput] = useState("")

  // Første load: kampe + profiler + din Elo
  useEffect(() => {
    if (!visningsnavn) return

    let cancelled = false

    async function loadData() {
      setState((s) => ({ ...s, loading: true, error: null }))

      try {
        // 1) Hent ALLE kampe (newresults) via pagination
        const kampe = await fetchAllNewresults()
        if (cancelled) return

        // 2) Hent alle profiler for at få startElo (første Elo)
        const { data: profilesData, error: profilesError } = await supabase
          .from("profiles")
          .select("visningsnavn, startElo")

        if (cancelled) return

        if (profilesError) {
          console.error("Fejl ved hentning af profiles til profil:", profilesError)
          setState((s) => ({
            ...s,
            loading: false,
            error: profilesError.message ?? "Kunne ikke hente profiler",
            kampCount: kampe.length,
          }))
          return
        }

        const profiles = (profilesData ?? []).filter(
          (p: any) => !!p.visningsnavn
        ) as { visningsnavn: string; startElo?: number }[]

        // 3) Byg initialEloMap ud fra startElo
        const initialEloMap: Record<string, number> = {}
        const DEFAULT_START_ELO = 1000 // fallback hvis nogen ikke har startElo

        for (const p of profiles) {
          const navn = p.visningsnavn
          const startElo =
            typeof p.startElo === "number" ? p.startElo : DEFAULT_START_ELO
          initialEloMap[navn] = startElo
        }

        // 4) Elo-historik for denne spiller
        const eloHistory = hentEloHistorikForSpiller(
          visningsnavn,
          kampe,
          initialEloMap
        )

        const currentElo = findCurrentEloForSpiller(
          visningsnavn,
          kampe,
          initialEloMap
        )

        setState((s) => ({
          ...s,
          loading: false,
          error: null,
          eloHistory,
          currentElo,
          kampCount: kampe.length,
          profiles: profiles.map((p) => ({ visningsnavn: p.visningsnavn })),
          kampe,
          initialEloMap,
        }))
      } catch (e: any) {
        if (cancelled) return
        console.error("Fejl i loadData på profilside:", e)
        setState((s) => ({
          ...s,
          loading: false,
          error: e?.message ?? "Ukendt fejl",
        }))
      }
    }

    loadData()

    return () => {
      cancelled = true
    }
  }, [visningsnavn])

  const {
    loading,
    error,
    eloHistory,
    currentElo,
    kampCount,
    profiles,
    kampe,
    initialEloMap,
    compareName,
    compareHistory,
    compareCurrentElo,
  } = state

    // Når man vælger en spiller i input -> beregn sammenlignings-historik
  useEffect(() => {
    if (!compareName) {
      setState((s) => ({
        ...s,
        compareHistory: [],
        compareCurrentElo: null,
      }))
      return
    }

    if (!kampe.length) return

    // Lav en lokal kopi som ren string, så TypeScript er glad
    const name = compareName

    let cancelled = false

    async function calcCompare() {
      const hist = hentEloHistorikForSpiller(name, kampe, initialEloMap)
      const cur = findCurrentEloForSpiller(name, kampe, initialEloMap)

      if (cancelled) return

      setState((s) => ({
        ...s,
        compareHistory: hist,
        compareCurrentElo: cur,
      }))
    }

    calcCompare()

    return () => {
      cancelled = true
    }
  }, [compareName, kampe, initialEloMap])


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
        byDate.set(p.date, p) // sidste vinder på dagen
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

  const availableCompareOptions = profiles
    .map((p) => p.visningsnavn)
    .filter((name) => name !== visningsnavn)
    .sort((a, b) => a.localeCompare(b, "da"))

  // Håndter input-ændring til sammenligningsspiller
  function handleCompareInputChange(v: string) {
    setCompareInput(v)

    // Se om det præcist matcher et visningsnavn
    const match = availableCompareOptions.find((name) => name === v)
    setState((s) => ({
      ...s,
      compareName: match || null,
    }))
  }

  function clearCompare() {
    setCompareInput("")
    setState((s) => ({
      ...s,
      compareName: null,
      compareHistory: [],
      compareCurrentElo: null,
    }))
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex justify-center px-4 py-8">
      <div className="w-full max-w-3xl space-y-6">
        {/* Top: Navn + nuværende Elo */}
        <header className="flex flex-col gap-3 border-b border-pink-500/40 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-2">
            <div>
              <h1 className="text-3xl font-semibold tracking-tight">
                {visningsnavn || "Profil"}
              </h1>
              <p className="text-sm text-slate-400">
                Personlig Elo-profil (beta) – bygger på alle registrerede sæt
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Indlæste kampe i alt: {kampCount}
              </p>
            </div>

            <div className="inline-flex items-center gap-2 rounded-2xl border border-pink-500/60 bg-slate-900/70 px-4 py-2">
              <span className="text-xs uppercase tracking-wide text-slate-400">
                Nuværende Elo
              </span>
              <span className="text-2xl font-bold text-pink-400">
                {currentElo !== null ? Math.round(currentElo) : "–"}
              </span>
            </div>
          </div>

          {/* Tilføj spiller-sektion */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-wide text-slate-400">
                Sammenlign med spiller
              </span>
              <div className="flex items-center gap-2">
                <input
                  list="spillerliste"
                  className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-pink-500/60 min-w-[200px]"
                  placeholder="Søg efter navn…"
                  value={compareInput}
                  onChange={(e) => handleCompareInputChange(e.target.value)}
                />
                {compareName && (
                  <button
                    type="button"
                    onClick={clearCompare}
                    className="text-xs text-slate-300 hover:text-pink-300"
                  >
                    Ryd
                  </button>
                )}
                <datalist id="spillerliste">
                  {availableCompareOptions.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </div>
            </div>

            {compareName && (
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <span className="inline-flex items-center gap-1 rounded-full bg-pink-500/10 border border-pink-500/40 px-2 py-1">
                  <span
                    className="inline-block w-2 h-2 rounded-full"
                    style={{ backgroundColor: "#f472b6" }}
                  />
                  {visningsnavn}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/10 border border-cyan-500/40 px-2 py-1">
                  <span
                    className="inline-block w-2 h-2 rounded-full"
                    style={{ backgroundColor: "#22d3ee" }}
                  />
                  {compareName}
                  {typeof compareCurrentElo === "number" && (
                    <span className="ml-1 text-[10px] text-cyan-300">
                      ({Math.round(compareCurrentElo)})
                    </span>
                  )}
                </span>
              </div>
            )}
          </div>
        </header>

        {/* Indhold */}
        {loading && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 px-4 py-6 text-sm text-slate-300">
            Indlæser Elo-historik for <strong>{visningsnavn}</strong>…
          </div>
        )}

        {error && !loading && (
          <div className="rounded-2xl border border-red-500/60 bg-red-950/40 px-4 py-6 text-sm text-red-100">
            Der opstod en fejl: {error}
          </div>
        )}

        {!loading && !error && (
          <section className="space-y-4">
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
                  Grafen viser din sidste Elo for hver dag, hvor du har spillet –
                  og eventuelt en ekstra spiller til sammenligning. Y-aksen er
                  rundet til nærmeste 100 for at fremhæve udviklingen.
                </p>
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

