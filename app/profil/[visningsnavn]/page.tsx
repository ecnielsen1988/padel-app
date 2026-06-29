"use client"

import Link from "next/link"
import { useParams } from "next/navigation"
import { useEffect, useState } from "react"
import { PageShell } from "@/app/components/ui"
import {
  EloPoint,
  findCurrentEloForSpiller,
  hentEloHistorikForSpiller,
} from "@/lib/beregnEloHistorik"
import { EloChart } from "./EloChart"
import { EloStats } from "./EloStats"
import { MakkerStats } from "./MakkerStats"
import RankOverview from "./RankOverview"
import { SetStats } from "./SetStats"
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

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
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
  const [compareInput, setCompareInput] = useState("")

  useEffect(() => {
    if (!visningsnavn) return

    let cancelled = false

    async function loadData() {
      setState((s) => ({ ...s, loading: true, error: null }))

      try {
        const res = await fetch(
          `/api/profile?visningsnavn=${encodeURIComponent(visningsnavn)}`,
          { cache: "no-store" }
        )
        if (cancelled) return
        const data = await res.json()

        if (!res.ok) {
          throw new Error(data?.error ?? "Kunne ikke hente profil-data")
        }

        setState((s) => ({
          ...s,
          loading: false,
          error: null,
          eloHistory: Array.isArray(data?.eloHistory) ? data.eloHistory : [],
          currentElo: typeof data?.currentElo === "number" ? data.currentElo : null,
          kampCount: typeof data?.kampCount === "number" ? data.kampCount : 0,
          profiles: Array.isArray(data?.profiles) ? data.profiles : [],
          kampe: Array.isArray(data?.kampe) ? data.kampe : [],
          initialEloMap:
            data?.initialEloMap && typeof data.initialEloMap === "object"
              ? data.initialEloMap
              : {},
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

    let cancelled = false

    async function calcCompare() {
      const name = compareName
      if (!name) return

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
    .map((profile) => profile.visningsnavn)
    .filter((name) => name !== visningsnavn)
    .sort((a, b) => a.localeCompare(b, "da"))

  function handleCompareInputChange(value: string) {
    setCompareInput(value)
    const match = availableCompareOptions.find((name) => name === value)
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

  const profileLink = `/profil/${encodeURIComponent(visningsnavn)}`
  const currentTime = new Intl.DateTimeFormat("da-DK", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date())

  return (
    <PageShell className="bg-[#1a1a2e] px-0 py-0 md:px-6 md:py-6">
      <div className="mx-auto flex min-h-screen w-full max-w-[820px] flex-col overflow-hidden bg-[#f7f7fa] md:min-h-[min(100vh,980px)] md:rounded-[34px] md:border md:border-white/10 md:shadow-[0_24px_60px_rgba(0,0,0,0.28)]">
        <header className="bg-gradient-to-br from-[#f01f78] to-[#c0135a] px-4 pb-5 pt-4 text-white md:px-6">
          <div className="mb-4 flex items-center justify-between text-[11px] font-semibold opacity-90">
            <button
              type="button"
              onClick={() => {
                if (typeof window !== "undefined") window.history.back()
              }}
              className="inline-flex items-center rounded-full bg-white/18 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-white/28"
            >
              ← Tilbage
            </button>
            <span>{currentTime}</span>
          </div>

          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/75">
                Spillerprofil
              </p>
              <h1 className="mt-1 text-2xl font-black tracking-tight">
                {visningsnavn || "Profil"}
              </h1>
              <p className="mt-2 text-sm text-white/80">
                Elo-udvikling, ranglisteplaceringer og statistik samlet ét sted.
              </p>
            </div>

            <Link
              href={profileLink}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#ffd44d] text-xs font-black text-[#463018]"
              aria-label="Profil"
            >
              {initials(visningsnavn || "P")}
            </Link>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-[18px] border border-white/20 bg-white/16 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">
                Nuværende Elo
              </p>
              <p className="mt-1 text-2xl font-black">
                {currentElo !== null ? Math.round(currentElo) : "–"}
              </p>
            </div>
            <div className="rounded-[18px] border border-white/20 bg-white/16 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">
                Registrerede sæt
              </p>
              <p className="mt-1 text-2xl font-black">{kampCount}</p>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 pb-28 pt-4 md:px-6">
          <div className="space-y-4">
            <section className="rounded-[20px] border border-[#ececf1] bg-white p-4 shadow-[0_6px_20px_rgba(15,23,42,0.06)]">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-[13px] font-bold uppercase tracking-[0.12em] text-[#2d3340]">
                    Sammenlign spiller
                  </h2>
                  <p className="mt-1 text-sm text-[#6d7280]">
                    Se udviklingen op mod en anden spiller.
                  </p>
                </div>
                {compareName ? (
                  <button
                    type="button"
                    onClick={clearCompare}
                    className="rounded-full bg-[#fff0f5] px-3 py-1.5 text-[11px] font-bold text-[#f01f78]"
                  >
                    Ryd
                  </button>
                ) : null}
              </div>

              <div className="space-y-3">
                <input
                  list="spillerliste"
                  className="w-full rounded-[14px] border border-[#e6e7eb] bg-[#fbfbfc] px-3 py-3 text-sm text-[#1f2430] outline-none transition focus:border-[#f01f78] focus:ring-2 focus:ring-[#f7a9c8]"
                  placeholder="Søg efter navn…"
                  value={compareInput}
                  onChange={(e) => handleCompareInputChange(e.target.value)}
                />
                <datalist id="spillerliste">
                  {availableCompareOptions.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>

                {compareName ? (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[#4c5566]">
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#fff0f5] px-3 py-1.5 font-semibold text-[#f01f78]">
                      <span className="inline-block h-2 w-2 rounded-full bg-[#f01f78]" />
                      {visningsnavn}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#ebfbff] px-3 py-1.5 font-semibold text-[#1198b0]">
                      <span className="inline-block h-2 w-2 rounded-full bg-[#22d3ee]" />
                      {compareName}
                      {typeof compareCurrentElo === "number" ? (
                        <span className="text-[10px] font-bold">
                          ({Math.round(compareCurrentElo)})
                        </span>
                      ) : null}
                    </span>
                  </div>
                ) : null}
              </div>
            </section>

            <RankOverview visningsnavn={visningsnavn} kampe={kampe} />

            {loading ? (
              <section className="rounded-[20px] border border-[#ececf1] bg-white p-4 text-sm text-[#6d7280] shadow-[0_6px_20px_rgba(15,23,42,0.06)]">
                Indlæser Elo-historik for <strong>{visningsnavn}</strong>…
              </section>
            ) : null}

            {error && !loading ? (
              <section className="rounded-[20px] border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-[0_6px_20px_rgba(15,23,42,0.05)]">
                Der opstod en fejl: {error}
              </section>
            ) : null}

            {!loading && !error ? (
              <section className="space-y-4">
                <EloChart
                  visningsnavn={visningsnavn}
                  eloHistory={eloHistory}
                  compareHistory={compareHistory}
                  compareName={compareName}
                />

                <EloStats visningsnavn={visningsnavn} eloHistory={eloHistory} />
                <SetStats visningsnavn={visningsnavn} kampe={kampe} />
                <MakkerStats
                  visningsnavn={visningsnavn}
                  kampe={kampe}
                  initialEloMap={initialEloMap}
                />
                <StreakStats visningsnavn={visningsnavn} kampe={kampe} />
              </section>
            ) : null}
          </div>
        </div>

        <nav className="absolute inset-x-0 bottom-0 flex justify-around border-t border-black/5 bg-white px-2 pb-5 pt-3 md:static md:pb-4">
          {[
            { href: "/startside", icon: "🏠", label: "Hjem" },
            { href: "/ranglister", icon: "📊", label: "Rangliste" },
            { href: "/kommende", icon: "📅", label: "Events" },
            { href: profileLink, icon: "🧑‍🎾", label: "Profil" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "flex min-w-16 flex-col items-center gap-1",
                item.href === profileLink ? "text-[#f01f78]" : "text-[#7b8190]",
              ].join(" ")}
            >
              <span className="text-lg">{item.icon}</span>
              <span className="text-[11px] font-semibold">{item.label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </PageShell>
  )
}
