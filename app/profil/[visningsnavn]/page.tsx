"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { supabase } from "@/lib/supabaseClient"
import {
  EloPoint,
  hentEloHistorikForSpiller,
  findCurrentEloForSpiller,
} from "@/lib/beregnEloHistorik"
import { EloChart } from "./EloChart"
import { EloStats } from "./EloStats"
import { SetStats } from "./SetStats"
import { MakkerStats } from "./MakkerStats"
import { StreakStats } from "./StreakStats"


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

  // Lokalt input-field til søgning/valg af spiller til sammenligning
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

    // Lav en lokal kopi som ren string
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

          {/* Sammenlign spiller-sektion */}
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
            {/* Graf-komponent */}
            <EloChart
              visningsnavn={visningsnavn}
              eloHistory={eloHistory}
              compareHistory={compareHistory}
              compareName={compareName}
            />

            {/* Stats-komponent: højeste/laveste/gns Elo sidste måned & i år */}
            <EloStats visningsnavn={visningsnavn} eloHistory={eloHistory} />

            <SetStats visningsnavn={visningsnavn} kampe={kampe} />

            <MakkerStats
    visningsnavn={visningsnavn}
    kampe={kampe}
    initialEloMap={initialEloMap}
  />

  <StreakStats visningsnavn={visningsnavn} kampe={kampe} />

          </section>
        )}
      </div>
    </div>
  )
}
