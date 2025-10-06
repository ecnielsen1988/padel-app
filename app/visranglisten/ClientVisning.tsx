"use client"

import { useEffect, useState } from "react"
import QRCode from "react-qr-code"

type Spiller = {
  visningsnavn: string
  elo?: number
  koen?: "mand" | "kvinde" | string
  [key: string]: any
}
type MaanedItem = { visningsnavn: string; pluspoint: number }
type AktivItem = {
  visningsnavn: string
  sæt?: number; saet?: number; set?: number; sets?: number
  pluspoint?: number
  [key: string]: any
}

/** Finder et array i typiske API-svarformer – uden at bruge console.* */
function extractArray(raw: any): any[] {
  const cands = [
    raw,
    raw?.data, raw?.items, raw?.rows, raw?.result, raw?.results, raw?.list,
    raw?.payload, raw?.response, raw?.value, raw?.records, raw?.entries, raw?.hits,
    raw?.data?.data, raw?.data?.items,
  ]
  for (const c of cands) if (Array.isArray(c)) return c
  return []
}

async function getArray(url: string) {
  try {
    const res = await fetch(url, { cache: "no-store" })
    // håndtér 204/no content etc.
    let raw: any = null
    try { raw = await res.json() } catch { return [] }
    return extractArray(raw)
  } catch {
    return []
  }
}

export default function ClientVisning() {
  const [rangliste, setRangliste] = useState<Spiller[]>([])
  const [maanedens, setMaanedens] = useState<MaanedItem[]>([])
  const [mestAktive, setMestAktive] = useState<AktivItem[]>([])
  const [startIndex, setStartIndex] = useState(20)

  useEffect(() => {
    ;(async () => {
      const [r, m, a] = await Promise.all([
        getArray("/api/rangliste"),
        getArray("/api/monthly"), // indeværende måned
        getArray("/api/active"),
      ])
      setRangliste(r as Spiller[])
      setMaanedens(m as MaanedItem[])
      setMestAktive(a as AktivItem[])
    })()
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      const len = Array.isArray(rangliste) ? rangliste.length : 0
      const max = Math.max(len - 40, 20)
      setStartIndex((prev) => (prev >= max ? 20 : prev + 20))
    }, 15000)
    return () => clearInterval(interval)
  }, [rangliste])

  const emojiForPluspoint = (p: number) => {
    if (p >= 100) return "🍾"
    if (p >= 50) return "🏆"
    if (p >= 40) return "🏅"
    if (p >= 30) return "☄️"
    if (p >= 20) return "🚀"
    if (p >= 10) return "🔥"
    if (p >= 5) return "📈"
    if (p >= 0) return "💪"
    if (p > -5) return "🎲"
    if (p > -10) return "📉"
    if (p > -20) return "🧯"
    if (p > -30) return "🪂"
    if (p > -40) return "❄️"
    if (p > -50) return "🙈"
    if (p > -100) return "🥊"
    if (p > -150) return "💩"
    return "💩💩"
  }

  const safeRangliste = Array.isArray(rangliste) ? rangliste : []
  const top20 = safeRangliste.slice(0, 20)
  const bedsteMand = top20.find((s) => s.koen === "mand")
  const bedsteKvinde = top20.find((s) => s.koen === "kvinde")

  const kolonne = (
    spillere: any[],
    startNr: number,
    renderInfo: (s: any) => string
  ) => (
    <td className="align-top p-2 w-[20%]">
      <div className="space-y-1 flex flex-col justify-start">
        {(spillere ?? []).map((s, i) => {
          const placering = startNr + i
          const emoji =
            s.visningsnavn === bedsteMand?.visningsnavn
              ? "👑"
              : s.visningsnavn === bedsteKvinde?.visningsnavn
              ? "👸"
              : ""

          return (
            <div
              key={`${s.visningsnavn}-${placering}`}
              className="flex justify-between items-center rounded-lg px-2 py-1 shadow text-xs"
              style={{ backgroundColor: i === 0 ? "#f472b6" : "#be185d", color: "white" }}
            >
              <span className="flex gap-1">
                <span style={{ fontWeight: "bold" }}>#{placering}</span>
                <span>{s.visningsnavn} {emoji}</span>
              </span>
              <span className="whitespace-nowrap">{renderInfo(s)}</span>
            </div>
          )
        })}
      </div>
    </td>
  )

  // Normalisér "mest aktive" til visning
  const mestAktiveVis = (mestAktive ?? [])
    .filter((s: any) => s && typeof s === "object" && typeof s.visningsnavn === "string")
    .map((s: any) => {
      const sets = Number(s["sæt"] ?? s["saet"] ?? s.saet ?? s.set ?? s.sets ?? 0) || 0
      const plus = Number(
        s.pluspoint ??
        (maanedens ?? []).find((m) => m?.visningsnavn === s.visningsnavn)?.pluspoint ??
        0
      )
      return { ...s, _sets: sets, _plus: plus }
    })
    .filter((s: any) => s._sets > 0)
    .sort((a: any, b: any) => (b._sets - a._sets) || (b._plus - a._plus))
    .slice(0, 15)

  return (
    <main className="min-h-screen text-white flex flex-col" style={{ backgroundColor: "#ec4899" }}>
      {/* Logo */}
      <div className="p-4 text-center">
        <img src="/padelhuset-logo.png" alt="Padelhuset logo" className="mx-auto h-12 md:h-16 lg:h-20" />
      </div>

      {/* Layout med kolonner */}
      <table className="table-fixed w-full">
        <thead>
          <tr>
            <th className="text-white text-lg font-extrabold text-center py-4 tracking-wide">Top 20</th>
            <th className="text-white text-lg font-extrabold text-center py-4 tracking-wide">
              #{startIndex + 1}–{startIndex + 20}
            </th>
            <th className="text-white text-lg font-extrabold text-center py-4 tracking-wide">
              #{startIndex + 21}–{startIndex + 40}
            </th>
            <th className="text-white text-lg font-extrabold text-center py-4 tracking-wide">Månedens spillere</th>
            <th className="text-white text-lg font-extrabold text-center py-4 tracking-wide">Mest aktive</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            {kolonne(top20, 1, (s) => `${Math.round(Number(s.elo ?? 0))} 🎾`)}
            {kolonne(safeRangliste.slice(startIndex, startIndex + 20), startIndex + 1, (s) => `${Math.round(Number(s.elo ?? 0))} 🎾`)}
            {kolonne(safeRangliste.slice(startIndex + 20, startIndex + 40), startIndex + 21, (s) => `${Math.round(Number(s.elo ?? 0))} 🎾`)}
            {kolonne((maanedens ?? []).slice(0, 15), 1, (s) => {
              const p = Number(s.pluspoint ?? 0)
              return `${p >= 0 ? "+" : ""}${p.toFixed(1)} ${emojiForPluspoint(p)}`
            })}
            {kolonne(mestAktiveVis, 1, (s: any) => `${s._sets} sæt 🏃‍♂️`)}
          </tr>
        </tbody>
      </table>

      {/* QR Code */}
      <div className="fixed bottom-4 right-4 flex items-center space-x-4 z-50">
        <div className="font-bold px-6 py-3 rounded-full shadow-lg text-lg" style={{ backgroundColor: "#f472b6", color: "white" }}>
          👉 Tilmeld dig ranglisten
        </div>
        <div className="p-2 shadow-lg rounded-xl" style={{ backgroundColor: "white" }}>
          <QRCode value="https://padelhuset-app.netlify.app/signup" size={96} />
        </div>
      </div>
    </main>
  )
}

