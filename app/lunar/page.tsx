"use client"

import { useEffect, useMemo, useState } from "react"
import { supabase } from "@/lib/supabaseClient"
import {
  EloPoint,
  hentEloHistorikForSpiller,
} from "@/lib/beregnEloHistorik"
import {
  EloSnapshot,
  LunarRow,
  beregnMaanedsGnsForSpiller,
  thursdayBonus,
  getLast6MonthsMeta,
} from "@/lib/beregnLunar"

// typer, så TS ikke brokker sig
type NewResultRow = { [key: string]: any }

type LunarBonusRow = {
  visningsnavn: string
  bonus_points: number
}

type ProfileRow = {
  visningsnavn: string
  startElo?: number | null
}

/**
 * Henter ALLE rækker fra newresults via pagination
 * (samme mønster som på /profil)
 */
async function fetchAllNewresults(): Promise<NewResultRow[]> {
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
      break
    }

    page++
  }

  return all
}

function weekdayFromISO(dateStr: string): number {
  // Håndter både "YYYY-MM-DD" og timestamps
  const d =
    dateStr.length <= 10
      ? new Date(dateStr + "T00:00:00")
      : new Date(dateStr)

  if (Number.isNaN(d.getTime())) return -1
  return d.getDay() // 0= søn ... 4 = torsdag
}

/**
 * Beregner hele LunarRow for én spiller
 * - Elo-historik (samme som /profil)
 * - måneds-gennemsnit + vægtet Elo
 * - torsdags-bonus (kun ud fra dato + holdA/holdB)
 * - lunar-bonus fra tabel
 */
function computeLunarRowForPlayer(
  navn: string,
  kampe: NewResultRow[],
  initialEloMap: Record<string, number>,
  lunarBonusByPlayer: Map<string, number>
): LunarRow | null {
  const DEFAULT_START_ELO = 1000
  const startElo = initialEloMap[navn] ?? DEFAULT_START_ELO

  // 1) Elo-historik for spilleren (samme som graf på /profil)
  const history: EloPoint[] = hentEloHistorikForSpiller(
    navn,
    kampe,
    initialEloMap
  )

  // 2) Konvertér EloPoint[] -> EloSnapshot[] til månedsberegningen
  const snapshots: EloSnapshot[] = history
    .filter((p) => p.date)
    .map((p) => ({
      visningsnavn: navn,
      date: p.date!, // vi filtrerede på date
      elo: p.elo,
    }))

  // 3) Beregn måneds-gennemsnit + vægtet Elo
  const { months, weightedAverage } = beregnMaanedsGnsForSpiller(
    snapshots,
    startElo
  )

  // 4) Torsdags-bonus:
  //    +5 pr. unik torsdag hvor spilleren står i holda1/2 eller holdb1/2
  const thursdayDates = new Set<string>()

  for (const row of kampe) {
    const date: string | undefined = row.date
    if (!date) continue

    // kun torsdage
    if (weekdayFromISO(date) !== 4) continue

    // deltagere er ALENE holda1/2 + holdb1/2 – ikke visningsnavn-felt
    const deltagere = [
      row.holdA1,
      row.holdA2,
      row.holdB1,
      row.holdB2,
    ].filter((x: any): x is string => !!x)

    if (!deltagere.includes(navn)) continue

    thursdayDates.add(date)
  }

  const thursdayCount = thursdayDates.size
  const thursdayPoints = thursdayBonus(thursdayCount)

  // Debug – fjern når du kan se, at det virker
  console.log("Lunar torsdage for", navn, Array.from(thursdayDates))

  // 5) Lunar-bonus
  const lunarBonus = lunarBonusByPlayer.get(navn) ?? 0

  const total = weightedAverage + lunarBonus + thursdayPoints

  const row: LunarRow = {
    visningsnavn: navn,
    months,
    weightedElo: weightedAverage,
    lunarBonus,
    thursdayCount,
    thursdayPoints,
    total,
  }

  return row
}

export default function LunarSide() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [kampe, setKampe] = useState<NewResultRow[]>([])
  const [initialEloMap, setInitialEloMap] = useState<Record<string, number>>({})
  const [profiles, setProfiles] = useState<ProfileRow[]>([])
  const [lunarBonusByPlayer, setLunarBonusByPlayer] = useState<
    Map<string, number>
  >(new Map())

  const [rows, setRows] = useState<LunarRow[]>([])
  const [inputNavn, setInputNavn] = useState("")

  const monthsMeta = useMemo(() => getLast6MonthsMeta(), [])

  // første load: kampe + profiler + lunar-bonus + spillere fra lunar-tabellen
  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)

      try {
        // 1) Hent ALLE kampe
        const allKampe = await fetchAllNewresults()
        if (cancelled) return

        // 2) Hent profiler (samme som /profil)
        const { data: profilesData, error: profilesError } = await supabase
          .from("profiles")
          .select("visningsnavn, startElo")

        if (cancelled) return

        if (profilesError) {
          console.error("Fejl ved hentning af profiles:", profilesError)
          setError(profilesError.message ?? "Kunne ikke hente profiler")
          setLoading(false)
          return
        }

        const rawProfiles = (profilesData ?? []).filter(
          (p: any) => !!p.visningsnavn
        ) as ProfileRow[]

        // 3) Byg initialEloMap ud fra startElo (ligesom /profil)
        const DEFAULT_START_ELO = 1000
        const eloMap: Record<string, number> = {}
        for (const p of rawProfiles) {
          const navn = p.visningsnavn
          const start =
            typeof p.startElo === "number" ? p.startElo : DEFAULT_START_ELO
          eloMap[navn] = start
        }

        // 4) Hent lunar_bonus
        const bonusResp = await (supabase.from("lunar_bonus") as any).select(
          "visningsnavn, bonus_points"
        )

        if (cancelled) return

        if (bonusResp.error) {
          console.error("Fejl ved hentning af lunar_bonus:", bonusResp.error)
        }

        const bonusMap = new Map<string, number>()
        for (const row of (bonusResp.data ?? []) as LunarBonusRow[]) {
          bonusMap.set(row.visningsnavn, Number(row.bonus_points) || 0)
        }

        // 5) Hent eksisterende Lunar-spillere fra tabel "lunar"
        const lunarResp = await supabase
          .from("lunar")
          .select("visningsnavn")

        if (cancelled) return

        if (lunarResp.error) {
          console.error("Fejl ved hentning af lunar:", lunarResp.error)
        }

        const lunarPlayers: string[] = (lunarResp.data ?? [])
          .map((r: any) => r.visningsnavn)
          .filter((v: any) => !!v)

        // 6) Beregn LunarRow for alle spillere i lunar-tabellen
        const initialRows: LunarRow[] = []
        for (const navn of lunarPlayers) {
          const row = computeLunarRowForPlayer(
            navn,
            allKampe,
            eloMap,
            bonusMap
          )
          if (row) initialRows.push(row)
        }
        initialRows.sort((a, b) => b.total - a.total)

        // opdater state
        if (!cancelled) {
          setKampe(allKampe)
          setProfiles(rawProfiles)
          setInitialEloMap(eloMap)
          setLunarBonusByPlayer(bonusMap)
          setRows(initialRows)
          setError(null)
        }
      } catch (e: any) {
        console.error("Fejl i Lunar load:", e)
        if (!cancelled) {
          setError(e?.message ?? "Ukendt fejl")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [])

  // brug case-insensitive match til at finde canonical navn
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

    // undgå dubletter
    if (rows.some((r) => r.visningsnavn === navn)) {
      setInputNavn("")
      return
    }

    // beregn LunarRow
    const row = computeLunarRowForPlayer(
      navn,
      kampe,
      initialEloMap,
      lunarBonusByPlayer
    )

    if (!row) {
      alert("Kunne ikke beregne Lunar-data for spilleren.")
      return
    }

    // gem i Supabase-tabel "lunar"
    const { error: upErr } = await (supabase.from("lunar") as any)
  .upsert(
    { visningsnavn: navn },
    { onConflict: "visningsnavn" }
  )

    if (upErr) {
      console.error("Fejl ved upsert til lunar:", upErr)
      alert("Kunne ikke gemme spilleren i Lunar-tabellen.")
      return
    }

    // opdater UI
    setRows((prev) => [...prev, row].sort((a, b) => b.total - a.total))
    setInputNavn("")
  }

  async function removePlayer(navn: string) {
    // slet fra Supabase-tabel "lunar"
    const { error: delErr } = await supabase
      .from("lunar")
      .delete()
      .eq("visningsnavn", navn)

    if (delErr) {
      console.error("Fejl ved sletning fra lunar:", delErr)
      alert("Kunne ikke fjerne spilleren fra Lunar-tabellen.")
      return
    }

    // opdater UI
    setRows((prev) => prev.filter((r) => r.visningsnavn !== navn))
  }

  async function handleBonusChange(navn: string, value: string) {
    const n = Number(value.replace(",", "."))
    if (!Number.isFinite(n)) return

    // opdater lokalt
    setRows((prev) => {
      const updated = prev.map((r) => {
        if (r.visningsnavn !== navn) return r
        const total = r.weightedElo + n + r.thursdayPoints
        return { ...r, lunarBonus: n, total }
      })
      return updated.sort((a, b) => b.total - a.total)
    })

    // upsert i lunar_bonus
    const { error } = await (supabase.from("lunar_bonus") as any).upsert(
      { visningsnavn: navn, bonus_points: n },
      { onConflict: "visningsnavn" }
    )

    if (error) {
      console.error("Fejl ved opdatering af lunar_bonus:", error)
    } else {
      setLunarBonusByPlayer((prev) => {
        const next = new Map(prev)
        next.set(navn, n)
        return next
      })
    }
  }

  const monthsHeader = monthsMeta

  if (loading) {
    return (
      <main className="max-w-5xl mx-auto p-6 text-gray-900 dark:text-white">
        <h1 className="text-3xl font-bold mb-4">🌙 Lunar – holdkampsrangering</h1>
        <p>Indlæser kampe og profiler…</p>
      </main>
    )
  }

  if (error) {
    return (
      <main className="max-w-5xl mx-auto p-6 text-gray-900 dark:text-white">
        <h1 className="text-3xl font-bold mb-4">🌙 Lunar – holdkampsrangering</h1>
        <p className="text-red-600 whitespace-pre-wrap">{error}</p>
      </main>
    )
  }

  return (
    <main className="max-w-5xl mx-auto p-6 text-gray-900 dark:text-white">
      <h1 className="text-3xl font-bold mb-4">🌙 Lunar – holdkampsrangering</h1>

      <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-300">
        Skriv eller vælg et <strong>visningsnavn</strong> (autocomplete). Systemet bruger
        samme Elo-historik som på profilsiden, beregner månedsgennemsnit for de sidste 6
        måneder (vægtet 1–6), lægger Lunar-tillæg og{" "}
        <strong>torsdagsbonus</strong> (+5 per torsdag, hvor spilleren har spillet) oveni
        – og sorterer automatisk efter samlet score.
      </p>

      {/* skrivbar dropdown via datalist */}
      <div className="mb-6 flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="flex-1 w-full">
          <input
            type="text"
            list="lunar-spillerliste"
            value={inputNavn}
            onChange={(e) => setInputNavn(e.target.value)}
            placeholder="Skriv eller vælg visningsnavn..."
            className="w-full border border-zinc-300 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-900"
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
          className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 disabled:cursor-not-allowed text-white font-semibold px-4 py-2 rounded-lg"
        >
          ➕ Tilføj spiller
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Der er endnu ingen spillere tilføjet. Skriv eller vælg et visningsnavn ovenfor.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-700">
          <table className="min-w-full text-xs sm:text-sm">
            <thead className="bg-zinc-100 dark:bg-zinc-800">
              <tr>
                <th className="px-2 py-2 text-left">#</th>
                <th className="px-2 py-2 text-left">Spiller</th>
                {monthsHeader.map((m) => (
                  <th key={m.label} className="px-2 py-2 text-right">
                    {m.label}
                    <div className="text-[10px] text-zinc-500">
                      vægt {m.weight}
                    </div>
                  </th>
                ))}
                <th className="px-2 py-2 text-right">Vægtet Elo</th>
                <th className="px-2 py-2 text-right">Lunar +</th>
                <th className="px-2 py-2 text-right">Torsdage</th>
                <th className="px-2 py-2 text-right">Sum</th>
                <th className="px-2 py-2 text-right"> </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => {
                let badge = ""
                if (idx === 0) badge = "👑"
                else if (idx === 1) badge = "🥈"
                else if (idx === 2) badge = "🥉"

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
                    <td className="px-2 py-2 whitespace-nowrap">
                      {badge && <span className="mr-1">{badge}</span>}
                      {r.visningsnavn}
                    </td>
                    {monthsHeader.map((m, i) => {
                      const monthRow = r.months[i]
                      const val = monthRow?.avgElo
                      return (
                        <td key={m.label} className="px-2 py-2 text-right">
                          {val != null ? val.toFixed(0) : "–"}
                        </td>
                      )
                    })}
                    <td className="px-2 py-2 text-right font-semibold">
                      {r.weightedElo.toFixed(1)}
                    </td>
                    <td className="px-2 py-2 text-right">
                      <input
                        type="number"
                        value={r.lunarBonus.toString().replace(".", ",")}
                        onChange={(e) =>
                          handleBonusChange(r.visningsnavn, e.target.value)
                        }
                        className="w-20 text-right border border-zinc-300 dark:border-zinc-700 rounded px-1 py-0.5 bg-white dark:bg-zinc-900"
                      />
                    </td>
                    <td className="px-2 py-2 text-right">
                      {r.thursdayCount > 0
                        ? `${r.thursdayCount}× (+${r.thursdayPoints.toFixed(0)})`
                        : "–"}
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

