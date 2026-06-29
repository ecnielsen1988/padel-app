"use client"

import { useMemo, useState } from "react"
import {
  beregnEloForKampe,
  Kamp,
  EloMap,
} from "@/lib/beregnElo"

type MakkerStatsProps = {
  visningsnavn: string
  kampe: any[]
  initialEloMap: EloMap
}

type AggStats = {
  name: string
  sets: number
  totalElo: number   // samlet Elo-ændring
}

export function MakkerStats({
  visningsnavn,
  kampe,
  initialEloMap,
}: MakkerStatsProps) {
  const {
    partners,
    opponents,
    partnerMap,
    opponentMap,
    allNames,
  } = useMemo(() => {
    if (!kampe.length) {
      return {
        partners: [] as AggStats[],
        opponents: [] as AggStats[],
        partnerMap: new Map<string, AggStats>(),
        opponentMap: new Map<string, AggStats>(),
        allNames: [] as string[],
      }
    }

    // 1) Map "rå" kampe (fra newresults) til Kamp-typen din Elo-funktion bruger
    const kampListe: Kamp[] = kampe.map((k: any, idx: number) => {
      const scoreA = k.scoreA ?? k.scorea ?? 0
      const scoreB = k.scoreB ?? k.scoreb ?? 0

      return {
        id: typeof k.id === "number" ? k.id : idx + 1,
        kampid:
          typeof k.kampid === "number"
            ? k.kampid
            : typeof k.kampId === "number"
            ? k.kampId
            : typeof k.id === "number"
            ? k.id
            : idx + 1,
        date: k.date ?? k.dato ?? "",
        holdA1: k.holdA1 ?? k.holda1 ?? "",
        holdA2: k.holdA2 ?? k.holda2 ?? "",
        holdB1: k.holdB1 ?? k.holdb1 ?? "",
        holdB2: k.holdB2 ?? k.holdb2 ?? "",
        scoreA: typeof scoreA === "number" ? scoreA : parseInt(scoreA ?? "0", 10),
        scoreB: typeof scoreB === "number" ? scoreB : parseInt(scoreB ?? "0", 10),
        finish: Boolean(k.finish),
        event: Boolean(k.event),
        tiebreak: k.tiebreak ?? k.tieBreak ?? "",
        indberettet_af: k.indberettet_af,
      }
    })

    // 2) Beregn Elo-ændringer pr. sæt
    const { eloChanges } = beregnEloForKampe(kampListe, initialEloMap)

    const partnerMap = new Map<string, AggStats>()
    const opponentMap = new Map<string, AggStats>()

    function ensure(map: Map<string, AggStats>, name: string): AggStats {
      let existing = map.get(name)
      if (!existing) {
        existing = {
          name,
          sets: 0,
          totalElo: 0,
        }
        map.set(name, existing)
      }
      return existing
    }

    // 3) Gå igennem alle kampe i kronologisk rækkefølge
    for (const kamp of kampListe) {
      const changesForKamp = eloChanges[kamp.id]
      if (!changesForKamp) continue

      const myChange = changesForKamp[visningsnavn]?.diff
      if (typeof myChange !== "number") continue

      const ha1 = kamp.holdA1
      const ha2 = kamp.holdA2
      const hb1 = kamp.holdB1
      const hb2 = kamp.holdB2

      const isA = ha1 === visningsnavn || ha2 === visningsnavn
      const isB = hb1 === visningsnavn || hb2 === visningsnavn
      if (!isA && !isB) continue

      let partnerName: string | null = null
      const opponentNames: string[] = []

      if (isA) {
        partnerName = ha1 === visningsnavn ? ha2 || null : ha1 || null
        if (hb1 && hb1 !== visningsnavn) opponentNames.push(hb1)
        if (hb2 && hb2 !== visningsnavn) opponentNames.push(hb2)
      } else if (isB) {
        partnerName = hb1 === visningsnavn ? hb2 || null : hb1 || null
        if (ha1 && ha1 !== visningsnavn) opponentNames.push(ha1)
        if (ha2 && ha2 !== visningsnavn) opponentNames.push(ha2)
      }

      // 4) Makker – får "kredit" for hele din Elo-diff i sættet
      if (partnerName && partnerName !== visningsnavn) {
        const ps = ensure(partnerMap, partnerName)
        ps.sets += 1
        ps.totalElo += myChange
      }

      // 5) Modstandere – hver modstander får også hele diff'en
      for (const opp of opponentNames) {
        if (!opp || opp === visningsnavn) continue
        const os = ensure(opponentMap, opp)
        os.sets += 1
        os.totalElo += myChange
      }
    }

    const finalize = (arr: AggStats[]): AggStats[] =>
      arr.sort(
        (a, b) =>
          b.totalElo - a.totalElo || b.sets - a.sets
      )

    const partners = finalize(Array.from(partnerMap.values()))
    const opponents = finalize(Array.from(opponentMap.values()))

    const allNames = Array.from(
      new Set<string>([
        ...partnerMap.keys(),
        ...opponentMap.keys(),
      ])
    ).sort((a, b) => a.localeCompare(b, "da"))

    return { partners, opponents, partnerMap, opponentMap, allNames }
  }, [kampe, visningsnavn, initialEloMap])

  const [matchupInput, setMatchupInput] = useState("")
  const [selectedName, setSelectedName] = useState<string | null>(null)

  const formatElo = (v: number) =>
    `${v >= 0 ? "+" : ""}${Math.round(v)}`

  const formatAvg = (totalElo: number, sets: number) => {
    if (!sets) return "–"
    const v = totalElo / sets
    return `${v >= 0 ? "+" : ""}${v.toFixed(1)}`
  }

  const TopList = ({
    title,
    items,
    emptyLabel,
    positive,
  }: {
    title: string
    items: AggStats[]
    emptyLabel: string
    positive: boolean // true = yndlings (top), false = hade (bund)
  }) => {
    let relevant: AggStats[]
    if (positive) {
      // top 3 med positiv totalElo
      relevant = items.filter((i) => i.totalElo > 0).slice(0, 3)
    } else {
      // bund 3 med negativ totalElo
      const negative = items.filter((i) => i.totalElo < 0)
      relevant = negative
        .slice()
        .sort((a, b) => a.totalElo - b.totalElo)
        .slice(0, 3)
    }

    return (
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-[#8a8f9c]">
          {title}
        </p>
        {relevant.length === 0 ? (
          <p className="text-xs text-[#8a8f9c]">{emptyLabel}</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {relevant.map((p) => (
              <li
                key={p.name}
                className="flex justify-between items-baseline rounded-[14px] border border-[#ececf1] bg-[#fbfbfc] px-2.5 py-2"
              >
                <div className="flex flex-col">
                  <span className="font-medium text-[#1f2430]">
                    {p.name}
                  </span>
                  <span className="text-[11px] text-[#8a8f9c]">
                    {p.sets} sæt · samlet {formatElo(p.totalElo)} Elo ·{" "}
                    gns. {formatAvg(p.totalElo, p.sets)} / sæt
                  </span>
                </div>
                <span className="text-xs font-semibold text-[#2d3340]">
                  {formatElo(p.totalElo)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  // Håndter skrivbar dropdown til én bestemt spiller
  function handleMatchupChange(v: string) {
    setMatchupInput(v)
    const exact = allNames.find((n) => n === v)
    setSelectedName(exact ?? null)
  }

  const selectedPartnerStats =
    selectedName ? partnerMap.get(selectedName) ?? null : null
  const selectedOpponentStats =
    selectedName ? opponentMap.get(selectedName) ?? null : null

  const hasAnySelectedStats =
    !!selectedPartnerStats || !!selectedOpponentStats

  return (
    <div className="mt-2 rounded-[20px] border border-[#ececf1] bg-white p-4 shadow-[0_6px_20px_rgba(15,23,42,0.06)]">
      <h2 className="mb-3 text-[13px] font-bold uppercase tracking-[0.12em] text-[#2d3340]">
        Bedste- og Nemesis-makkere / modstandere (Elo)
      </h2>

      {/* Skrivbar dropdown til specifik spiller */}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-[#8a8f9c]">
            Tjek Elo med / mod spiller
          </span>
          <div className="flex items-center gap-2">
            <input
              list="makker-modstander-liste"
              className="min-w-[200px] rounded-xl border border-[#e6e7eb] bg-[#fbfbfc] px-3 py-1.5 text-sm text-[#1f2430] focus:outline-none focus:ring-2 focus:ring-pink-500/30"
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
                className="text-xs text-[#6d7280] hover:text-[#f01f78]"
              >
                Ryd
              </button>
            )}
            <datalist id="makker-modstander-liste">
              {allNames.map((name) => (
                <option key={name} value={name} />
              ))}
            </datalist>
          </div>
        </div>
      </div>

      {/* Oversigt: yndlings/hade-makkere og modstandere */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
        {/* Makkere */}
        <div>
          <p className="mb-1 text-xs uppercase tracking-wide text-[#c0135a]">
            Makkere
          </p>
          <div className="space-y-3">
            <TopList
              title="🏆 Bedste makkere (flest Elo sammen)"
              items={partners}
              positive={true}
              emptyLabel="For lidt data til at beregne yndlingsmakkere endnu."
            />
            <TopList
              title="⚡ Nemesis-makkere (flest Elo tabt sammen)"
              items={partners}
              positive={false}
              emptyLabel="For lidt data til at finde hademakkere (endnu 😉)."
            />
          </div>
        </div>

        {/* Modstandere */}
        <div>
          <p className="mb-1 text-xs uppercase tracking-wide text-[#1198b0]">
            Modstandere
          </p>
          <div className="space-y-3">
            <TopList
              title="🔥 Bedste modstandere (flest Elo hentet imod)"
              items={opponents}
              positive={true}
              emptyLabel="For lidt data til at beregne yndlingsmodstandere."
            />
            <TopList
              title="❄️ Nemesis-modstandere (flest Elo tabt til)"
              items={opponents}
              positive={false}
              emptyLabel="Ingen tydelige hademodstandere endnu."
            />
          </div>
        </div>
      </div>

      {/* Detaljevisning for valgt spiller */}
      {selectedName && (
        <div className="mt-4 rounded-[16px] border border-[#ececf1] bg-[#fbfbfc] p-3 text-sm">
          <p className="mb-2 text-xs uppercase tracking-wide text-[#6d7280]">
            Detaljer for {selectedName}
          </p>

          {!hasAnySelectedStats ? (
            <p className="text-xs text-[#8a8f9c]">
              Du har ikke spillet nogen registrerede sæt med eller mod{" "}
              <strong>{selectedName}</strong> endnu.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Som makker */}
              <div className="rounded-[14px] border border-[#f7a9c8] bg-[#fff0f5] p-2.5">
                <p className="mb-1 text-xs uppercase tracking-wide text-[#c0135a]">
                  Sammen som makker
                </p>
                {selectedPartnerStats ? (
                  <div className="space-y-1 text-[13px]">
                    <div className="flex justify-between">
                      <span>Sæt spillet</span>
                      <span className="font-semibold">
                        {selectedPartnerStats.sets}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Samlet Elo</span>
                      <span className="font-semibold">
                        {formatElo(selectedPartnerStats.totalElo)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Pr. sæt i snit</span>
                      <span className="font-semibold">
                        {formatAvg(
                          selectedPartnerStats.totalElo,
                          selectedPartnerStats.sets
                        )}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-[#8a8f9c]">
                    Ingen registrerede sæt hvor I har været makkere.
                  </p>
                )}
              </div>

              {/* Som modstander */}
              <div className="rounded-[14px] border border-[#bfeaf1] bg-[#ebfbff] p-2.5">
                <p className="mb-1 text-xs uppercase tracking-wide text-[#1198b0]">
                  Mod hinanden
                </p>
                {selectedOpponentStats ? (
                  <div className="space-y-1 text-[13px]">
                    <div className="flex justify-between">
                      <span>Sæt spillet</span>
                      <span className="font-semibold">
                        {selectedOpponentStats.sets}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Samlet Elo</span>
                      <span className="font-semibold">
                        {formatElo(selectedOpponentStats.totalElo)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Pr. sæt i snit</span>
                      <span className="font-semibold">
                        {formatAvg(
                          selectedOpponentStats.totalElo,
                          selectedOpponentStats.sets
                        )}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-[#8a8f9c]">
                    Ingen registrerede sæt hvor I har stået på hver sin side.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <p className="mt-3 text-[11px] text-[#8a8f9c]">
        Baseret på Elo-ændring pr. sæt for {visningsnavn}. Alle sæt tælles med
        (både færdige og ufærdige). Makkere/modstandere får “kredit” for hele
        din Elo-ændring i de sæt, hvor I spiller sammen/imod hinanden.
      </p>
    </div>
  )
}
