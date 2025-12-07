"use client"

import { useMemo, useState } from "react"

type SetStatsProps = {
  visningsnavn: string
  kampe: any[]
}

type CountStats = {
  played: number
  won: number
  lost: number
  winPct: number | null
}

type EggStats = {
  eggsFor: number
  eggsAgainst: number
}

type MatchupStats = {
  sets: number
  won: number
  lost: number
  eggsFor: number
  eggsAgainst: number
}

export function SetStats({ visningsnavn, kampe }: SetStatsProps) {
  const {
    last30,
    last90,
    thisYear,
    eggs30,
    eggs90,
    eggsYear,
    with30,
    with90,
    withYear,
    against30,
    against90,
    againstYear,
    allNames,
  } = useMemo(() => {
    const now = new Date()
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(now.getDate() - 30)

    const ninetyDaysAgo = new Date()
    ninetyDaysAgo.setDate(now.getDate() - 90)

    const currentYear = now.getFullYear()

    const baseStats: CountStats = {
      played: 0,
      won: 0,
      lost: 0,
      winPct: null,
    }

    const baseEggs: EggStats = {
      eggsFor: 0,
      eggsAgainst: 0,
    }

    const stats30: CountStats = { ...baseStats }
    const stats90: CountStats = { ...baseStats }
    const statsYear: CountStats = { ...baseStats }

    const eggs30: EggStats = { ...baseEggs }
    const eggs90: EggStats = { ...baseEggs }
    const eggsYear: EggStats = { ...baseEggs }

    // Matchup-maps pr. periode
    const with30 = new Map<string, MatchupStats>()
    const with90 = new Map<string, MatchupStats>()
    const withYear = new Map<string, MatchupStats>()

    const against30 = new Map<string, MatchupStats>()
    const against90 = new Map<string, MatchupStats>()
    const againstYear = new Map<string, MatchupStats>()

    function addToStats(target: CountStats, isWin: boolean) {
      target.played += 1
      if (isWin) target.won += 1
      else target.lost += 1
    }

    function addEggs(target: EggStats, isFor: boolean) {
      if (isFor) target.eggsFor += 1
      else target.eggsAgainst += 1
    }

    function ensureMatchup(
      map: Map<string, MatchupStats>,
      name: string
    ): MatchupStats {
      let existing = map.get(name)
      if (!existing) {
        existing = {
          sets: 0,
          won: 0,
          lost: 0,
          eggsFor: 0,
          eggsAgainst: 0,
        }
        map.set(name, existing)
      }
      return existing
    }

    for (const k of kampe) {
      const dateStr: string | undefined = k.date
      if (!dateStr) continue

      // Kun færdigspillede sæt
      const finished =
        k.finish === true ||
        k.finish === "true" ||
        k.finish === 1

      if (!finished) continue

      const dt = new Date(dateStr)
      if (isNaN(dt.getTime())) continue

      const inLast30 = dt >= thirtyDaysAgo && dt <= now
      const inLast90 = dt >= ninetyDaysAgo && dt <= now
      const inThisYear = dt.getFullYear() === currentYear

      // Find spillerens hold
      const ha1: string | undefined = k.holda1 ?? k.holdA1
      const ha2: string | undefined = k.holda2 ?? k.holdA2
      const hb1: string | undefined = k.holdb1 ?? k.holdB1
      const hb2: string | undefined = k.holdb2 ?? k.holdB2

      const isA = ha1 === visningsnavn || ha2 === visningsnavn
      const isB = hb1 === visningsnavn || hb2 === visningsnavn

      if (!isA && !isB) continue // spilleren er ikke med i dette sæt

      const rawA = k.scorea ?? k.scoreA
      const rawB = k.scoreb ?? k.scoreB

      let scoreA = typeof rawA === "number" ? rawA : parseInt(rawA ?? "0", 10)
      let scoreB = typeof rawB === "number" ? rawB : parseInt(rawB ?? "0", 10)

      if (isNaN(scoreA) || isNaN(scoreB)) continue
      if (scoreA === scoreB) continue // ingen uafgjorte sæt

      const playerWon =
        (isA && scoreA > scoreB) ||
        (isB && scoreB > scoreA)

      // Æg-logik: 6-0 eller 0-6
      let gaveEgg = false
      let gotEgg = false

      if (isA) {
        if (scoreA === 6 && scoreB === 0) gaveEgg = true
        if (scoreA === 0 && scoreB === 6) gotEgg = true
      } else if (isB) {
        if (scoreB === 6 && scoreA === 0) gaveEgg = true
        if (scoreB === 0 && scoreA === 6) gotEgg = true
      }

      // Overordnede stats pr. periode
      if (inLast30) {
        addToStats(stats30, playerWon)
        if (gaveEgg) addEggs(eggs30, true)
        if (gotEgg) addEggs(eggs30, false)
      }

      if (inLast90) {
        addToStats(stats90, playerWon)
        if (gaveEgg) addEggs(eggs90, true)
        if (gotEgg) addEggs(eggs90, false)
      }

      if (inThisYear) {
        addToStats(statsYear, playerWon)
        if (gaveEgg) addEggs(eggsYear, true)
        if (gotEgg) addEggs(eggsYear, false)
      }

      // —— Matchup-statistik (med og mod bestemte spillere) ——

      // Find makker + modstandere
      let partnerName: string | null = null
      const opponentNames: string[] = []

      if (isA) {
        partnerName = ha1 === visningsnavn ? ha2 ?? null : ha1 ?? null
        if (hb1 && hb1 !== visningsnavn) opponentNames.push(hb1)
        if (hb2 && hb2 !== visningsnavn) opponentNames.push(hb2)
      } else if (isB) {
        partnerName = hb1 === visningsnavn ? hb2 ?? null : hb1 ?? null
        if (ha1 && ha1 !== visningsnavn) opponentNames.push(ha1)
        if (ha2 && ha2 !== visningsnavn) opponentNames.push(ha2)
      }

      // Helper til at opdatere stats i relevante maps
      function updateMatchupForPeriod(
        maps: {
          with: Map<string, MatchupStats>
          against: Map<string, MatchupStats>
        }
      ) {
        const { with: wMap, against: aMap } = maps

        // Sammen som makker
        if (partnerName && partnerName !== visningsnavn) {
          const ms = ensureMatchup(wMap, partnerName)
          ms.sets += 1
          if (playerWon) ms.won += 1
          else ms.lost += 1
          if (gaveEgg) ms.eggsFor += 1
          if (gotEgg) ms.eggsAgainst += 1
        }

        // Mod modstandere
        for (const opp of opponentNames) {
          if (!opp || opp === visningsnavn) continue
          const ms = ensureMatchup(aMap, opp)
          ms.sets += 1
          if (playerWon) ms.won += 1
          else ms.lost += 1
          if (gaveEgg) ms.eggsFor += 1
          if (gotEgg) ms.eggsAgainst += 1
        }
      }

      if (inLast30) {
        updateMatchupForPeriod({ with: with30, against: against30 })
      }
      if (inLast90) {
        updateMatchupForPeriod({ with: with90, against: against90 })
      }
      if (inThisYear) {
        updateMatchupForPeriod({ with: withYear, against: againstYear })
      }
    }

    function finalize(s: CountStats): CountStats {
      if (s.played === 0) return s
      return {
        ...s,
        winPct: (s.won / s.played) * 100,
      }
    }

    const allNames = Array.from(
      new Set<string>([
        ...with30.keys(),
        ...with90.keys(),
        ...withYear.keys(),
        ...against30.keys(),
        ...against90.keys(),
        ...againstYear.keys(),
      ])
    ).sort((a, b) => a.localeCompare(b, "da"))

    return {
      last30: finalize(stats30),
      last90: finalize(stats90),
      thisYear: finalize(statsYear),
      eggs30,
      eggs90,
      eggsYear,
      with30,
      with90,
      withYear,
      against30,
      against90,
      againstYear,
      allNames,
    }
  }, [kampe, visningsnavn])

  const [matchupInput, setMatchupInput] = useState("")
  const [selectedName, setSelectedName] = useState<string | null>(null)

  const formatPct = (v: number | null) =>
    v === null ? "–" : `${Math.round(v)} %`

  const formatPctFrom = (won: number, sets: number) =>
    sets === 0 ? "–" : `${Math.round((won / sets) * 100)} %`

  const SetBlock = ({
    title,
    stats,
    eggs,
    accentClass,
  }: {
    title: string
    stats: CountStats
    eggs: EggStats
    accentClass: string
  }) => (
    <div className={`rounded-xl border p-3 space-y-2 ${accentClass}`}>
      <p className="text-xs uppercase tracking-wide">
        {title}
      </p>
      <div className="flex flex-col gap-1 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-300">Færdigspillede sæt</span>
          <span className="font-semibold">{stats.played}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-300">Vundne sæt</span>
          <span className="font-semibold">{stats.won}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-300">Tabte sæt</span>
          <span className="font-semibold">{stats.lost}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-300">Vinder%</span>
          <span className="font-semibold">
            {stats.played === 0 ? "–" : formatPct(stats.winPct)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-300">🥚 Vundet æg (6–0)</span>
          <span className="font-semibold">{eggs.eggsFor}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-300">🥚 Tabte æg (0–6)</span>
          <span className="font-semibold">{eggs.eggsAgainst}</span>
        </div>
      </div>
    </div>
  )

  // skrivbar dropdown
  function handleMatchupChange(v: string) {
    setMatchupInput(v)
    const exact = allNames.find((n) => n === v)
    setSelectedName(exact ?? null)
  }

  // Udtræk stats for valgt navn pr. periode
  const selectedWith30 = selectedName ? with30.get(selectedName) ?? null : null
  const selectedWith90 = selectedName ? with90.get(selectedName) ?? null : null
  const selectedWithYear = selectedName ? withYear.get(selectedName) ?? null : null

  const selectedAgainst30 = selectedName ? against30.get(selectedName) ?? null : null
  const selectedAgainst90 = selectedName ? against90.get(selectedName) ?? null : null
  const selectedAgainstYear = selectedName ? againstYear.get(selectedName) ?? null : null

  const hasAnySelected =
    !!selectedWith30 ||
    !!selectedWith90 ||
    !!selectedWithYear ||
    !!selectedAgainst30 ||
    !!selectedAgainst90 ||
    !!selectedAgainstYear

  const PeriodMatchupBlock = ({
    label,
    stats,
  }: {
    label: string
    stats: MatchupStats | null
  }) => (
    <div className="rounded-lg bg-slate-950/40 border border-slate-700/60 p-2">
      <p className="text-[11px] uppercase tracking-wide text-slate-400 mb-1">
        {label}
      </p>
      {!stats || stats.sets === 0 ? (
        <p className="text-[11px] text-slate-500">Ingen data.</p>
      ) : (
        <div className="space-y-0.5 text-[12px]">
          <div className="flex justify-between">
            <span>Sæt spillet</span>
            <span className="font-semibold">{stats.sets}</span>
          </div>
          <div className="flex justify-between">
            <span>Vundne sæt</span>
            <span className="font-semibold">{stats.won}</span>
          </div>
          <div className="flex justify-between">
            <span>Tabte sæt</span>
            <span className="font-semibold">{stats.lost}</span>
          </div>
          <div className="flex justify-between">
            <span>Vinder%</span>
            <span className="font-semibold">
              {formatPctFrom(stats.won, stats.sets)}
            </span>
          </div>
          <div className="flex justify-between">
            <span>🥚 Vundet æg</span>
            <span className="font-semibold">{stats.eggsFor}</span>
          </div>
          <div className="flex justify-between">
            <span>🥚 Tabte æg</span>
            <span className="font-semibold">{stats.eggsAgainst}</span>
          </div>
        </div>
      )}
    </div>
  )

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 mt-2">
      <h2 className="text-lg font-semibold mb-3">
        Sæt-statistik for {visningsnavn}
      </h2>

      {/* skrivbar dropdown til specifik spiller */}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-slate-400">
            Tjek sæt med / mod spiller
          </span>
          <div className="flex items-center gap-2">
            <input
              list="setstats-makker-modstander"
              className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-pink-500/60 min-w-[200px]"
              placeholder="Skriv et navn…"
              value={matchupInput}
              onChange={(e) => handleMatchupChange(e.target.value)}
            />
            {selectedName && (
              <button
                type="button"
                onClick={() => {
                  setMatchupInput("")
                  setSelectedName(null)
                }}
                className="text-xs text-slate-300 hover:text-pink-300"
              >
                Ryd
              </button>
            )}
            <datalist id="setstats-makker-modstander">
              {allNames.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </div>
        </div>
      </div>

      {/* Række 1: generelle sæts-tal + æg */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm mb-4">
        <SetBlock
          title="Seneste 30 dage"
          stats={last30}
          eggs={eggs30}
          accentClass="border-pink-500/40 bg-pink-500/5 text-pink-100"
        />
        <SetBlock
          title="Seneste 90 dage"
          stats={last90}
          eggs={eggs90}
          accentClass="border-indigo-500/40 bg-indigo-500/5 text-indigo-100"
        />
        <SetBlock
          title="Dette år"
          stats={thisYear}
          eggs={eggsYear}
          accentClass="border-slate-600/60 bg-slate-800/60 text-slate-100"
        />
      </div>

      {/* Detaljer for valgt spiller – nu i 2 rækker:
          1) alt som makker, 2) alt som modstander */}
      {selectedName && (
        <div className="mt-2 rounded-xl border border-slate-700 bg-slate-900/80 p-3 text-sm">
          <p className="text-xs uppercase tracking-wide text-slate-300 mb-2">
            Sæt med / mod {selectedName}
          </p>

          {!hasAnySelected ? (
            <p className="text-xs text-slate-500">
              Du har ikke spillet nogen registrerede færdigspillede sæt med eller
              mod <strong>{selectedName}</strong> i de valgte perioder.
            </p>
          ) : (
            <div className="space-y-4">
              {/* Række 1: alt som makker */}
              <div>
                <p className="text-[11px] uppercase tracking-wide text-pink-300 mb-1">
                  Makkerstats
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <PeriodMatchupBlock
                    label="30 dage"
                    stats={selectedWith30}
                  />
                  <PeriodMatchupBlock
                    label="90 dage"
                    stats={selectedWith90}
                  />
                  <PeriodMatchupBlock
                    label="Dette år"
                    stats={selectedWithYear}
                  />
                </div>
              </div>

              {/* Række 2: alt som modstander */}
              <div>
                <p className="text-[11px] uppercase tracking-wide text-cyan-300 mb-1">
                  Modstander Stats
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <PeriodMatchupBlock
                    label="30 dage"
                    stats={selectedAgainst30}
                  />
                  <PeriodMatchupBlock
                    label="90 dage"
                    stats={selectedAgainst90}
                  />
                  <PeriodMatchupBlock
                    label="Dette år"
                    stats={selectedAgainstYear}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <p className="text-[11px] text-slate-400 mt-2">
        Kun færdigspillede sæt tælles (finish = true). “Æg” er sæt der ender 6–0
        eller 0–6. Matchup-statistikken er opdelt i seneste 30 dage, 90 dage og
        indeværende år – først som makker, derefter som modstander.
      </p>
    </div>
  )
}

