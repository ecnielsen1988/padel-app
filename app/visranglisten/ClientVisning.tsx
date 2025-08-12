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
    <div className="p-2" style={{ width: "30%" }}>
      <div className="space-y-1 flex flex-col items-start">
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
              className={`flex justify-between items-center rounded-lg px-2 py-1 shadow text-xs w-full ${
                i === 0
                  ? "bg-gradient-to-r from-pink-500 to-pink-400 text-white"
                  : "bg-black bg-opacity-5 text-black"
              }`}
            >
              {/* Brug af flex for at placere navn og Elo på én linje */}
              <div className="flex justify-between w-full">
                <span className="text-pink-500 font-semibold">#{placering}</span>
                <span className="bg-pink-200 rounded-xl px-3 py-1 text-sm">{s.visningsnavn} {emoji}</span>
                <span className="text-sm text-right">{renderInfo(s)}</span> {/* Elo til højre */}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )

  return (
    <main className="min-h-screen bg-white text-black flex flex-col">
      {/* Logo */}
      <div className="p-4 text-center">
        <img src="/padelhuset-logo.png" alt="Padelhuset logo" className="mx-auto h-12 md:h-16 lg:h-20" />
      </div>

      {/* Layout med Grid */}
      <div className="grid grid-cols-5 gap-4 w-full px-4">
        {kolonne(top20, 1, (s) => `${Math.round(s.elo)} Elo`)}
        {kolonne(rangliste.slice(startIndex, startIndex + 20), startIndex + 1, (s) => `${Math.round(s.elo)} Elo`)}
        {kolonne(rangliste.slice(startIndex + 20, startIndex + 40), startIndex + 21, (s) => `${Math.round(s.elo)} Elo`)}
        {kolonne(maanedens.slice(0, 15), 1, (s) => `${s.pluspoint > 0 ? "+" : ""}${s.pluspoint.toFixed(1)} ${emojiForPluspoint(s.pluspoint)}`)}
        {kolonne(mestAktive.slice(0, 15), 1, (s) => `${s.sæt} sæt 🏃‍♂️`)}
      </div>

      {/* QR Code i hjørnet */}
      <div className="fixed bottom-4 right-4 bg-white p-2 shadow z-50">
        <QRCode value="https://padelhuset-app.netlify.app/signup" size={128} />
      </div>
    </main>
  )
}

