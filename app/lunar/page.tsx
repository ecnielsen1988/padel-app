"use client"

import { useEffect, useMemo, useState } from "react"
import { supabase } from "@/lib/supabaseClient"
import {
  EloPoint,
  hentEloHistorikForSpiller,
} from "@/lib/beregnEloHistorik"

type NewResultRow = { [key: string]: any }

type ProfileRow = {
  visningsnavn: string
  startElo?: number | null
}

type HoldMatchPlayerBonusRow = {
  visningsnavn: string | null
  wins: number | null
  hold_matches:
    | {
        season: string | null
      }
    | {
        season: string | null
      }[]
    | null
}

type TeamRow = {
  id: string
  name: string
  division: string
  season: string
}

type TeamMemberRow = {
  id: string
  team_id: string
  visningsnavn: string
  member_type: "primary" | "reserve"
  sort_order: number | null
  season: string
  hold_teams?:
    | {
        id: string
        name: string
        division: string
      }
    | {
        id: string
        name: string
        division: string
      }[]
}

type MonthCell = {
  label: string
  weight: number
  avgElo: number | null
}

type LunarRow = {
  visningsnavn: string
  months: MonthCell[]
  weightedElo: number
  lunarBonus: number
  thursdayCount: number
  thursdayPoints: number
  total: number
}

const DEFAULT_START_ELO = 1000
const SPRING_2026 = "2026 forår"
const FALL_2026 = "2026 efterår"

const FALL_2026_TEAM_OPTIONS = [
  { name: "Titanes", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200" },
  { name: "Gladiadores", color: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200" },
  { name: "Espartanos", color: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200" },
  { name: "Barbaros", color: "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200" },
  { name: "Reclutas", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200" },
  { name: "Exploradores", color: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200" },
  { name: "Novatos", color: "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200" },
] as const

const TEAM_COLOR_BY_NAME = Object.fromEntries(
  FALL_2026_TEAM_OPTIONS.map((team) => [team.name, team.color])
) as Record<string, string>

const FIXED_MONTHS_2026 = [
  {
    key: "2026-02",
    label: "Feb",
    weight: 1,
    start: "2026-02-01T00:00:00",
    end: "2026-02-28T23:59:59",
  },
  {
    key: "2026-03",
    label: "Marts",
    weight: 2,
    start: "2026-03-01T00:00:00",
    end: "2026-03-31T23:59:59",
  },
  {
    key: "2026-04",
    label: "April",
    weight: 3,
    start: "2026-04-01T00:00:00",
    end: "2026-04-30T23:59:59",
  },
  {
    key: "2026-05",
    label: "Maj",
    weight: 4,
    start: "2026-05-01T00:00:00",
    end: "2026-05-31T23:59:59",
  },
  {
    key: "2026-06",
    label: "Juni",
    weight: 5,
    start: "2026-06-01T00:00:00",
    end: "2026-06-30T23:59:59",
  },
  {
    key: "now",
    label: "Nu",
    weight: 6,
    start: null,
    end: null,
  },
] as const

const HOLD_MATCH_WIN_BONUS_BY_SEASON: Record<string, number> = {
  "2025 forår": 2,
  "2025 efterår": 5,
  "2026 forår": 10,
}

const THURSDAY_PERIOD_START = new Date("2026-01-01T00:00:00")
const THURSDAY_PERIOD_END = new Date("2026-07-31T23:59:59")

async function fetchAllNewresults(): Promise<NewResultRow[]> {
  const PAGE_SIZE = 1000
  let all: NewResultRow[] = []
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

    const batch = (data ?? []) as NewResultRow[]
    all = all.concat(batch)

    if (batch.length < PAGE_SIZE) break
    page++
  }

  return all
}

async function fetchAllHoldMatchPlayerRows(): Promise<HoldMatchPlayerBonusRow[]> {
  const PAGE_SIZE = 1000
  let all: HoldMatchPlayerBonusRow[] = []
  let page = 0

  while (true) {
    const from = page * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    const { data, error } = await supabase
      .from("hold_match_players")
      .select(`
        visningsnavn,
        wins,
        hold_matches!inner (
          season
        )
      `)
      .not("visningsnavn", "is", null)
      .gt("wins", 0)
      .range(from, to)

    if (error) {
      console.error("Fejl ved pagineret hentning af hold_match_players:", error)
      if (page === 0) throw error
      break
    }

    const batch = (data ?? []) as HoldMatchPlayerBonusRow[]
    all = all.concat(batch)

    if (batch.length < PAGE_SIZE) break
    page++
  }

  return all
}

function parseDateSafe(value: string | null | undefined): Date | null {
  if (!value) return null
  const d =
    value.length <= 10 ? new Date(`${value}T00:00:00`) : new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function weekdayFromISO(dateStr: string): number {
  const d = parseDateSafe(dateStr)
  if (!d) return -1
  return d.getDay()
}

function getMatchParticipants(row: NewResultRow): string[] {
  return [row.holdA1, row.holdA2, row.holdB1, row.holdB2].filter(
    (x: unknown): x is string => typeof x === "string" && x.trim().length > 0
  )
}

function computeFixedMonths(
  history: EloPoint[],
  startElo: number
): { months: MonthCell[]; weightedElo: number } {
  const snapshots = history
    .filter((p) => p.date)
    .map((p) => ({
      date: new Date(`${p.date}T12:00:00`),
      elo: p.elo,
    }))
    .filter((p) => !Number.isNaN(p.date.getTime()))
    .sort((a, b) => a.date.getTime() - b.date.getTime())

  const currentElo =
    snapshots.length > 0 ? snapshots[snapshots.length - 1].elo : startElo

  const monthCells: MonthCell[] = FIXED_MONTHS_2026.map((month) => {
    if (month.key === "now") {
      return {
        label: month.label,
        weight: month.weight,
        avgElo: currentElo,
      }
    }

    const start = new Date(month.start!)
    const end = new Date(month.end!)

    const inMonth = snapshots.filter(
      (snap) =>
        snap.date.getTime() >= start.getTime() &&
        snap.date.getTime() <= end.getTime()
    )

    return {
      label: month.label,
      weight: month.weight,
      avgElo:
        inMonth.length > 0
          ? inMonth.reduce((sum, snap) => sum + snap.elo, 0) / inMonth.length
          : null,
    }
  })

  let sum = 0
  let sumWeights = 0

  for (const month of monthCells) {
    if (month.avgElo == null) continue
    sum += month.avgElo * month.weight
    sumWeights += month.weight
  }

  return {
    months: monthCells,
    weightedElo: sumWeights > 0 ? sum / sumWeights : startElo,
  }
}

function buildHoldMatchBonusMap(rows: HoldMatchPlayerBonusRow[]) {
  const bonusMap = new Map<string, number>()

  for (const row of rows) {
    const navn = row.visningsnavn?.trim()
    if (!navn) continue

    const joinedMatch = Array.isArray(row.hold_matches)
      ? row.hold_matches[0]
      : row.hold_matches

    const season = joinedMatch?.season ?? null
    if (!season) continue

    const seasonBonus = HOLD_MATCH_WIN_BONUS_BY_SEASON[season] ?? 0
    if (!seasonBonus) continue

    const wins = Number(row.wins ?? 0)
    if (wins <= 0) continue

    const current = bonusMap.get(navn) ?? 0
    bonusMap.set(navn, current + wins * seasonBonus)
  }

  return bonusMap
}

function computeThursdayStats(navn: string, kampe: NewResultRow[]) {
  const uniqueThursdayDates = new Set<string>()

  for (const row of kampe) {
    const dateStr = row.date
    if (!dateStr) continue
    if (weekdayFromISO(dateStr) !== 4) continue

    const d = parseDateSafe(dateStr)
    if (!d) continue
    if (d < THURSDAY_PERIOD_START || d > THURSDAY_PERIOD_END) continue

    if (getMatchParticipants(row).includes(navn)) {
      uniqueThursdayDates.add(dateStr)
    }
  }

  const thursdayCount = uniqueThursdayDates.size
  const thursdayPoints = thursdayCount * 5

  return { thursdayCount, thursdayPoints }
}

function computeLunarRowForPlayer(
  navn: string,
  kampe: NewResultRow[],
  initialEloMap: Record<string, number>,
  holdMatchBonusMap: Map<string, number>
): LunarRow | null {
  const startElo = initialEloMap[navn] ?? DEFAULT_START_ELO

  const history: EloPoint[] = hentEloHistorikForSpiller(
    navn,
    kampe,
    initialEloMap
  )

  const { months, weightedElo } = computeFixedMonths(history, startElo)
  const lunarBonus = holdMatchBonusMap.get(navn) ?? 0
  const { thursdayCount, thursdayPoints } = computeThursdayStats(navn, kampe)
  const total = weightedElo + lunarBonus + thursdayPoints

  return {
    visningsnavn: navn,
    months,
    weightedElo,
    lunarBonus,
    thursdayCount,
    thursdayPoints,
    total,
  }
}

function getTeamBadgeClass(teamName: string | null | undefined) {
  if (!teamName) {
    return "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
  }
  return (
    TEAM_COLOR_BY_NAME[teamName] ??
    "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
  )
}

export default function LunarSide() {
  const [loading, setLoading] = useState(true)
  const [savingAssignment, setSavingAssignment] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [kampe, setKampe] = useState<NewResultRow[]>([])
  const [initialEloMap, setInitialEloMap] = useState<Record<string, number>>({})
  const [profiles, setProfiles] = useState<ProfileRow[]>([])
  const [holdMatchBonusMap, setHoldMatchBonusMap] = useState<Map<string, number>>(
    new Map()
  )
  const [rows, setRows] = useState<LunarRow[]>([])
  const [inputNavn, setInputNavn] = useState("")

  const [springPrimaryTeamByPlayer, setSpringPrimaryTeamByPlayer] = useState<
    Record<string, string>
  >({})
  const [fallTeams, setFallTeams] = useState<TeamRow[]>([])
  const [fallPrimaryTeamIdByPlayer, setFallPrimaryTeamIdByPlayer] = useState<
    Record<string, string>
  >({})

  const monthsHeader = useMemo(() => FIXED_MONTHS_2026, [])

  const orderedFallTeams = useMemo(() => {
    const teamByName = new Map(fallTeams.map((team) => [team.name, team]))
    return FALL_2026_TEAM_OPTIONS.map((option) => ({
      ...option,
      team: teamByName.get(option.name) ?? null,
    }))
  }, [fallTeams])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      try {
        const [allKampe, holdMatchBonusRows] = await Promise.all([
          fetchAllNewresults(),
          fetchAllHoldMatchPlayerRows(),
        ])

        if (cancelled) return

        const [
          profilesRes,
          lunarResp,
          springPrimaryRes,
          fallTeamsRes,
          fallPrimaryRes,
        ] = await Promise.all([
          supabase.from("profiles").select("visningsnavn, startElo"),
          supabase.from("lunar").select("visningsnavn"),
          supabase
            .from("hold_team_members")
            .select(`
              visningsnavn,
              hold_teams!inner (
                id,
                name,
                division
              )
            `)
            .eq("season", SPRING_2026)
            .eq("member_type", "primary"),
          supabase
            .from("hold_teams")
            .select("id, name, division, season")
            .eq("season", FALL_2026),
          supabase
            .from("hold_team_members")
            .select("visningsnavn, team_id")
            .eq("season", FALL_2026)
            .eq("member_type", "primary"),
        ])

        if (cancelled) return

        if (profilesRes.error) {
          setError(profilesRes.error.message ?? "Kunne ikke hente profiler")
          setLoading(false)
          return
        }

        const rawProfiles = (profilesRes.data ?? []).filter(
          (p: any) => !!p.visningsnavn
        ) as ProfileRow[]

        const eloMap: Record<string, number> = {}
        for (const p of rawProfiles) {
          const navn = p.visningsnavn
          const start =
            typeof p.startElo === "number" ? p.startElo : DEFAULT_START_ELO
          eloMap[navn] = start
        }

        const nextHoldMatchBonusMap = buildHoldMatchBonusMap(holdMatchBonusRows)

        const lunarPlayers: string[] = (lunarResp.data ?? [])
          .map((r: any) => r.visningsnavn)
          .filter((v: any) => !!v)

        const initialRows: LunarRow[] = []
        for (const navn of lunarPlayers) {
          const row = computeLunarRowForPlayer(
            navn,
            allKampe,
            eloMap,
            nextHoldMatchBonusMap
          )
          if (row) initialRows.push(row)
        }

        initialRows.sort((a, b) => b.total - a.total)

        const nextSpringPrimaryTeamByPlayer: Record<string, string> = {}
        for (const row of (springPrimaryRes.data ?? []) as TeamMemberRow[]) {
          const relation = Array.isArray(row.hold_teams)
            ? row.hold_teams[0]
            : row.hold_teams

          if (row.visningsnavn && relation?.name) {
            nextSpringPrimaryTeamByPlayer[row.visningsnavn] = relation.name
          }
        }

        const nextFallPrimaryTeamIdByPlayer: Record<string, string> = {}
        for (const row of (fallPrimaryRes.data ?? []) as Array<{
          visningsnavn: string
          team_id: string
        }>) {
          if (row.visningsnavn && row.team_id) {
            nextFallPrimaryTeamIdByPlayer[row.visningsnavn] = row.team_id
          }
        }

        if (!cancelled) {
          setKampe(allKampe)
          setProfiles(rawProfiles)
          setInitialEloMap(eloMap)
          setHoldMatchBonusMap(nextHoldMatchBonusMap)
          setRows(initialRows)
          setSpringPrimaryTeamByPlayer(nextSpringPrimaryTeamByPlayer)
          setFallTeams((fallTeamsRes.data ?? []) as TeamRow[])
          setFallPrimaryTeamIdByPlayer(nextFallPrimaryTeamIdByPlayer)
          setError(null)
        }
      } catch (e: any) {
        console.error("Fejl i Lunar load:", e)
        if (!cancelled) setError(e?.message ?? "Ukendt fejl")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [])

  function normalizeNavn(visningsnavn: string): string | null {
    if (initialEloMap[visningsnavn] !== undefined) return visningsnavn
    const lower = visningsnavn.toLowerCase()
    const found = Object.keys(initialEloMap).find(
      (k) => k.toLowerCase() === lower
    )
    return found ?? null
  }

  async function addPlayer() {
    let navn = inputNavn.trim()
    if (!navn) return

    if (!kampe.length || !Object.keys(initialEloMap).length) {
      alert("Data ikke helt indlæst endnu – prøv igen om et øjeblik.")
      return
    }

    const canonical = normalizeNavn(navn)
    if (!canonical) {
      alert(`Kunne ikke finde spiller med visningsnavn: ${navn}`)
      return
    }

    navn = canonical

    if (rows.some((r) => r.visningsnavn === navn)) {
      setInputNavn("")
      return
    }

    const row = computeLunarRowForPlayer(
      navn,
      kampe,
      initialEloMap,
      holdMatchBonusMap
    )

    if (!row) {
      alert("Kunne ikke beregne Lunar-data for spilleren.")
      return
    }

    const { error: upErr } = await supabase
      .from("lunar")
      .upsert({ visningsnavn: navn }, { onConflict: "visningsnavn" })

    if (upErr) {
      alert("Kunne ikke gemme spilleren i Lunar-tabellen.")
      return
    }

    setRows((prev) => [...prev, row].sort((a, b) => b.total - a.total))
    setInputNavn("")
  }

  async function removePlayer(navn: string) {
    const { error: delErr } = await supabase
      .from("lunar")
      .delete()
      .eq("visningsnavn", navn)

    if (delErr) {
      alert("Kunne ikke fjerne spilleren fra Lunar-tabellen.")
      return
    }

    setRows((prev) => prev.filter((r) => r.visningsnavn !== navn))
  }

  async function setFallPrimaryTeam(visningsnavn: string, nextTeamId: string) {
    setSavingAssignment(visningsnavn)

    const { error: deleteError } = await supabase
      .from("hold_team_members")
      .delete()
      .eq("season", FALL_2026)
      .eq("member_type", "primary")
      .eq("visningsnavn", visningsnavn)

    if (deleteError) {
      alert("Kunne ikke opdatere primærhold.")
      setSavingAssignment(null)
      return
    }

    if (!nextTeamId) {
      setFallPrimaryTeamIdByPlayer((prev) => {
        const next = { ...prev }
        delete next[visningsnavn]
        return next
      })
      setSavingAssignment(null)
      return
    }

    const sortOrder =
      rows.findIndex((row) => row.visningsnavn === visningsnavn) + 1 || null

    const { error: insertError } = await supabase.from("hold_team_members").insert({
      team_id: nextTeamId,
      visningsnavn,
      member_type: "primary",
      sort_order: sortOrder,
      season: FALL_2026,
    })

    if (insertError) {
      alert("Kunne ikke gemme primærhold.")
      setSavingAssignment(null)
      return
    }

    setFallPrimaryTeamIdByPlayer((prev) => ({
      ...prev,
      [visningsnavn]: nextTeamId,
    }))
    setSavingAssignment(null)
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-7xl p-6 text-gray-900 dark:text-white">
        <h1 className="mb-4 text-3xl font-bold">🌙 Lunar – kommende hold</h1>
        <p>Indlæser data…</p>
      </main>
    )
  }

  if (error) {
    return (
      <main className="mx-auto max-w-7xl p-6 text-gray-900 dark:text-white">
        <h1 className="mb-4 text-3xl font-bold">🌙 Lunar – kommende hold</h1>
        <p className="whitespace-pre-wrap text-red-600">{error}</p>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-7xl p-6 text-gray-900 dark:text-white">
      <h1 className="mb-4 text-3xl font-bold">🌙 Lunar – kommende hold</h1>

      <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-300">
        Vægt 6 tæller altid som nuværende Elo. Vægte 1-5 tæller kun med, hvis
        der er spillet i den måned.
      </p>

      <div className="mb-6 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
        <div className="w-full flex-1">
          <input
            type="text"
            list="lunar-spillerliste"
            value={inputNavn}
            onChange={(e) => setInputNavn(e.target.value)}
            placeholder="Skriv eller vælg visningsnavn..."
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
          <datalist id="lunar-spillerliste">
            {profiles.map((p) =>
              p.visningsnavn ? (
                <option key={p.visningsnavn} value={p.visningsnavn} />
              ) : null
            )}
          </datalist>
        </div>

        <button
          onClick={addPlayer}
          disabled={!inputNavn.trim()}
          className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-400"
        >
          ➕ Tilføj spiller
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Der er endnu ingen spillere tilføjet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
          <table className="min-w-full text-xs sm:text-sm">
            <thead className="bg-zinc-100 dark:bg-zinc-800">
              <tr>
                <th className="px-2 py-2 text-left">#</th>
                <th className="px-2 py-2 text-left">Spiller</th>
                {monthsHeader.map((m) => (
                  <th key={m.key} className="px-2 py-2 text-right">
                    {m.label}
                    <div className="text-[10px] text-zinc-500">vægt {m.weight}</div>
                  </th>
                ))}
                <th className="px-2 py-2 text-right">Vægtet Elo</th>
                <th className="px-2 py-2 text-right">Lunar +</th>
                <th className="px-2 py-2 text-right">Torsdage</th>
                <th className="px-2 py-2 text-left">Forår 26</th>
                <th className="px-2 py-2 text-left">Efterår 26 primær</th>
                <th className="px-2 py-2 text-right">Sum</th>
                <th className="px-2 py-2 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => {
                let badge = ""
                if (idx === 0) badge = "👑"
                else if (idx === 1) badge = "🥈"
                else if (idx === 2) badge = "🥉"

                const springTeam = springPrimaryTeamByPlayer[r.visningsnavn]
                const fallTeamId = fallPrimaryTeamIdByPlayer[r.visningsnavn]
                const fallTeam = fallTeams.find((team) => team.id === fallTeamId)

                return (
                  <tr
                    key={r.visningsnavn}
                    className={
                      idx % 2 === 0
                        ? "bg-white dark:bg-zinc-900"
                        : "bg-zinc-50 dark:bg-zinc-950"
                    }
                  >
                    <td className="px-2 py-2">{idx + 1}</td>
                    <td className="whitespace-nowrap px-2 py-2">
                      {badge && <span className="mr-1">{badge}</span>}
                      {r.visningsnavn}
                    </td>

                    {r.months.map((m) => (
                      <td key={`${r.visningsnavn}-${m.label}`} className="px-2 py-2 text-right">
                        {m.avgElo != null ? m.avgElo.toFixed(0) : "–"}
                      </td>
                    ))}

                    <td className="px-2 py-2 text-right font-semibold">
                      {r.weightedElo.toFixed(1)}
                    </td>
                    <td className="px-2 py-2 text-right font-semibold">
                      {r.lunarBonus.toFixed(0)}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {r.thursdayCount > 0
                        ? `${r.thursdayCount}× (+${r.thursdayPoints.toFixed(0)})`
                        : "–"}
                    </td>
                    <td className="px-2 py-2">
                      {springTeam ? (
                        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${getTeamBadgeClass(springTeam)}`}>
                          {springTeam}
                        </span>
                      ) : (
                        "–"
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <select
                        value={fallTeamId ?? ""}
                        onChange={(e) =>
                          setFallPrimaryTeam(r.visningsnavn, e.target.value)
                        }
                        disabled={savingAssignment === r.visningsnavn}
                        className={`min-w-[190px] rounded border px-2 py-1 dark:bg-zinc-900 ${
                          fallTeam?.name
                            ? getTeamBadgeClass(fallTeam.name)
                            : "border-zinc-300 bg-white text-zinc-900 dark:border-zinc-700 dark:text-white"
                        }`}
                      >
                        <option value="">Ingen</option>
                        {orderedFallTeams.map((option) =>
                          option.team ? (
                            <option key={option.team.id} value={option.team.id}>
                              {option.team.name}
                            </option>
                          ) : null
                        )}
                      </select>
                    </td>
                    <td className="px-2 py-2 text-right font-bold">
                      {r.total.toFixed(1)}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <button
                        onClick={() => removePlayer(r.visningsnavn)}
                        className="text-red-500 hover:text-red-700"
                        title="Fjern spiller fra Lunar"
                      >
                        🗑
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
