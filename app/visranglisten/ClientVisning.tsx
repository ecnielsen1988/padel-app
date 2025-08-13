"use client"

import { useEffect, useState } from "react"
import QRCode from "react-qr-code"

export default function ClientVisning() {
  const [rangliste, setRangliste] = useState<any[]>([])
  const [maanedens, setMaanedens] = useState<any[]>([])
  const [mestAktive, setMestAktive] = useState<any[]>([])
  const [startIndex, setStartIndex] = useState(20)

  useEffect(() => {
    const fetchData = async () => {
      const [r, m, a] = await Promise.all([
        fetch("/api/rangliste").then((res) => res.json()),
        fetch("/api/monthly").then((res) => res.json()),
        fetch("/api/active").then((res) => res.json()),
      ])
      setRangliste(r)
      setMaanedens(m)
      setMestAktive(a)
    }

    fetchData()
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      const max = Math.max(rangliste.length - 40, 20)
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
    if (p > -50) return "💩"
    if (p > -100) return "🥊"
    return "🙈"
  }

  const top20 = rangliste.slice(0, 20)
  const bedsteMand = top20.find((s) => s.koen === "mand")
  const bedsteKvinde = top20.find((s) => s.koen === "kvinde")

  const kolonne = (
    spillere: any[],
    startNr: number,
    renderInfo: (s: any) => string
  ) => (
    <td className="align-top p-2 w-[20%]">
      <div className="space-y-1 flex flex-col justify-start">
        {spillere.map((s, i) => {
          const placering = startNr + i
          const emoji =
            s.visningsnavn === bedsteMand?.visningsnavn
              ? "👑"
              : s.visningsnavn === bedsteKvinde?.visningsnavn
              ? "👸"
              : ""

          return (
            <div
              key={s.visningsnavn}
              className="flex justify-between items-center rounded-lg px-2 py-1 shadow text-xs"
              style={{
                backgroundColor: i === 0 ? "#f472b6" : "#be185d", // pink-400 vs pink-800
                color: "white",
              }}
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

  return (
    <main
      className="min-h-screen text-white flex flex-col"
      style={{ backgroundColor: "#ec4899" }} // pink-500
    >
      {/* Logo */}
      <div className="p-4 text-center">
        <img src="/padelhuset-logo.png" alt="Padelhuset logo" className="mx-auto h-12 md:h-16 lg:h-20" />
      </div>

      {/* Layout med kolonner */}
      <table className="table-fixed w-full">
        <thead>
          <tr>
            <th className="text-white text-lg font-extrabold text-center py-4 tracking-wide">
  Top 20
</th>
<th className="text-white text-lg font-extrabold text-center py-4 tracking-wide">
  #{startIndex + 1}–{startIndex + 20}
</th>
<th className="text-white text-lg font-extrabold text-center py-4 tracking-wide">
  #{startIndex + 21}–{startIndex + 40}
</th>
<th className="text-white text-lg font-extrabold text-center py-4 tracking-wide">
  Månedens spillere
</th>
<th className="text-white text-lg font-extrabold text-center py-4 tracking-wide">
  Mest aktive
</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            {kolonne(top20, 1, (s) => `${Math.round(s.elo)} 🎾`)}
            {kolonne(rangliste.slice(startIndex, startIndex + 20), startIndex + 1, (s) => `${Math.round(s.elo)} 🎾`)}
            {kolonne(rangliste.slice(startIndex + 20, startIndex + 40), startIndex + 21, (s) => `${Math.round(s.elo)} 🎾`)}
            {kolonne(maanedens.slice(0, 15), 1, (s) => `${s.pluspoint > 0 ? "+" : ""}${s.pluspoint.toFixed(1)} ${emojiForPluspoint(s.pluspoint)}`)}
            {kolonne(
  [...mestAktive]
    .map((spiller) => {
      const match = maanedens.find((m) => m.visningsnavn === spiller.visningsnavn)
      return {
        ...spiller,
        pluspoint: match?.pluspoint || 0,
      }
    })
    .sort((a, b) => {
      if (b["sæt"] !== a["sæt"]) return b["sæt"] - a["sæt"]
      return b.pluspoint - a.pluspoint
    })
    .slice(0, 15),
  1,
  (s) => `${s.sæt} sæt 🏃‍♂️`
)}

          </tr>
        </tbody>
      </table>

      {/* QR Code */}
      <div className="fixed bottom-4 right-4 flex items-center space-x-4 z-50">
  <div
    className="font-bold px-6 py-3 rounded-full shadow-lg text-lg"
    style={{
      backgroundColor: "#f472b6", // svarer til pink-400
      color: "white",
    }}
  >
    👉 Tilmeld dig ranglisten
  </div>
  <div
    className="p-2 shadow-lg rounded-xl"
    style={{ backgroundColor: "white" }}
  >
    <QRCode value="https://padelhuset-app.netlify.app/signup" size={96} />
  </div>
</div>

    </main>
  )
}

