"use client"

import { useEffect, useState } from "react"
import QRCode from "react-qr-code"

const emojiForElo = (elo: number) => {
  if (elo >= 100) return "🍾"
  if (elo >= 50) return "🏆"
  if (elo >= 40) return "🥇"
  if (elo >= 30) return "☄️"
  if (elo >= 20) return "🎸"
  if (elo >= 10) return "🔥"
  if (elo >= 5) return "📈"
  if (elo > 0) return "💪"
  if (elo > -5) return "🎲"
  if (elo > -10) return "📉"
  if (elo > -20) return "🫯"
  if (elo > -30) return "🪢"
  if (elo > -40) return "❄️"
  if (elo > -50) return "💩"
  if (elo > -100) return "🏋"
  return "🙈"
}

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
      setStartIndex((prev) => {
        const max = Math.max(rangliste.length - 20, 20)
        return prev >= max ? 20 : prev + 20
      })
    }, 15000)
    return () => clearInterval(interval)
  }, [rangliste])

  const kolonne = (spillere: any[], title: string, type: "elo" | "antal" = "elo") => (
    <div className="flex-1 p-2">
      <h2 className="text-center font-bold text-white text-xl mb-4">{title}</h2>
      <ol className="space-y-1">
        {spillere.map((s, i) => (
          <li
            key={s.visningsnavn}
            className="bg-black bg-opacity-20 p-2 rounded text-white text-sm flex justify-between items-center"
          >
            <span>
              #{i + 1} {s.visningsnavn}
            </span>
            <span>
              {type === "elo"
                ? `${Math.round(s.elo)} Elo ${emojiForElo(s.elo)}`
                : `${s.sæt} sæt 🏃‍♂️`}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )

  return (
    <main className="min-h-screen bg-black text-white flex flex-col">
      <div className="flex flex-1 flex-row overflow-hidden">
        {kolonne(rangliste.slice(0, 20), "Top 20")}
        {kolonne(rangliste.slice(startIndex, startIndex + 20), `#${startIndex + 1}–${startIndex + 20}`)}
        {kolonne(rangliste.slice(startIndex + 20, startIndex + 40), `#${startIndex + 21}–${startIndex + 40}`)}
        {kolonne(maanedens.slice(0, 15), "Månedens spillere")}
        {kolonne(mestAktive.slice(0, 15), "Mest aktive", "antal")}
      </div>
      <div className="p-2 text-right">
        <div className="inline-block bg-white p-1">
          <QRCode value="https://padelhuset.dk/signup" size={64} />
        </div>
      </div>
    </main>
  )
}
