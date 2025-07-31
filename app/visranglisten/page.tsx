'use client'

import { useEffect, useState } from 'react'
import { hentRangliste } from '@/lib/tvData'
import { beregnEloÆndringerForIndeværendeMåned } from '@/lib/beregnEloChange'
import { supabase } from '@/lib/supabaseClient'
import QRCode from 'react-qr-code'

interface Spiller {
  id: string
  visningsnavn: string
  elo: number
}

interface MånedensSpiller {
  visningsnavn: string
  pluspoint: number
}

interface MestAktivSpiller {
  visningsnavn: string
  sæt: number
}

export default function VisRanglistenSide() {
  const [rangliste, setRangliste] = useState<Spiller[]>([])
  const [maanedens, setMaanedens] = useState<MånedensSpiller[]>([])
  const [mestAktive, setMestAktive] = useState<MestAktivSpiller[]>([])
  const [offset, setOffset] = useState(20)

  useEffect(() => {
    let ranglisteData: Spiller[] = []

    const hentMestAktiveSpillereForIndeværendeMaaned = async () => {
      const now = new Date()
      const year = now.getFullYear()
      const month = now.getMonth() + 1

      const startDato = `${year}-${month.toString().padStart(2, '0')}-01`
      const slutMonth = month === 12 ? 1 : month + 1
      const slutYear = month === 12 ? year + 1 : year
      const slutDato = `${slutYear}-${slutMonth.toString().padStart(2, '0')}-01`

      const { data: kampeData, error } = await supabase
        .from('newresults')
        .select('holdA1, holdA2, holdB1, holdB2')
        .gte('date', startDato)
        .lt('date', slutDato)
        .eq('finish', true)

      if (error) {
        console.error('Fejl ved hentning af kampe til mest aktive:', error)
        return []
      }
      if (!kampeData) return []

      const tæller: Record<string, number> = {}

      kampeData.forEach(kamp => {
        ;[kamp.holdA1, kamp.holdA2, kamp.holdB1, kamp.holdB2].forEach(spiller => {
          if (spiller) {
            tæller[spiller] = (tæller[spiller] ?? 0) + 1
          }
        })
      })

      return Object.entries(tæller)
        .map(([visningsnavn, sæt]) => ({ visningsnavn, sæt }))
        .sort((a, b) => b.sæt - a.sæt)
        .slice(0, 20)
    }

    const fetchData = async () => {
      try {
        const r = await hentRangliste()
        const mappedR = r.map((spiller: any, index: number) => {
          const id = spiller.id ?? `fallback-id-${index}`
          return {
            ...spiller,
            id,
            visningsnavn: spiller.navn,
          }
        })
        setRangliste(mappedR)
        ranglisteData = mappedR

        const månedensSpillere = await beregnEloÆndringerForIndeværendeMåned()
        setMaanedens(månedensSpillere)

        const aktive = await hentMestAktiveSpillereForIndeværendeMaaned()
        setMestAktive(aktive)
      } catch (error) {
        console.error('Fejl ved hentning eller beregning:', error)
      }
    }

    fetchData()

    const interval = setInterval(() => {
      setOffset(prev => (prev + 40 >= ranglisteData.length ? 20 : prev + 40))
    }, 15000)

    return () => clearInterval(interval)
  }, [])

  const visRange = rangliste.slice(offset, offset + 20)

  return (
    <main className="min-h-screen p-4 font-sans text-white bg-[#ff69b4] grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
      {/* Logo i toppen */}
      <div className="col-span-full flex justify-center mb-4">
        <img
          src="/padelhuset-logo.png"
          alt="Padelhuset Logo"
          className="h-12 w-auto object-contain"
        />
      </div>

      {/* Top 1–20 */}
      <section className="bg-pink-600 bg-opacity-90 rounded-[24px] p-4 shadow-lg hover:shadow-xl transition-shadow duration-300">
        <h2 className="text-xl font-bold mb-4 border-b-2 border-pink-800 pb-1 text-center">
          Top 20
        </h2>
        <ol className="list-decimal list-inside space-y-0,9">
          {rangliste.slice(0, 20).map((s, i) => (
            <li
              key={s.id ?? s.visningsnavn ?? i}
              className="flex justify-between items-center p-1 rounded-2xl cursor-pointer hover:bg-pink-700 hover:scale-[1.02] transform transition duration-300"
            >
              <span className="font-semibold text-base w-7 text-left">#{i + 1}</span>
              <span className="flex-1 px-2 truncate text-sm">{s.visningsnavn}</span>
              <span className="font-mono text-base w-14 text-right">{Math.round(s.elo)}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* 21 – 40 / 41 – 60 ... */}
      <section className="bg-pink-600 bg-opacity-80 rounded-[24px] p-4 shadow-md hover:shadow-lg transition-shadow duration-300">
        <h2 className="text-xl font-bold mb-4 border-b-2 border-pink-700 pb-1 text-center">
          #{offset + 1}–#{offset + 20}
        </h2>
        <ol className="list-decimal list-inside space-y-0,9">
          {visRange.map((s, i) => (
            <li
              key={s.id ?? s.visningsnavn ?? i}
              className="flex justify-between items-center p-1 rounded-2xl cursor-pointer hover:bg-pink-700 hover:scale-[1.02] transform transition duration-300"
            >
              <span className="font-semibold text-base w-7 text-left">#{offset + i + 1}</span>
              <span className="flex-1 px-2 truncate text-sm">{s.visningsnavn}</span>
              <span className="font-mono text-base w-14 text-right">{Math.round(s.elo)}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* 41 – 60 / 61 – 80 ... */}
      <section className="bg-pink-600 bg-opacity-80 rounded-[24px] p-4 shadow-md hover:shadow-lg transition-shadow duration-300">
        <h2 className="text-xl font-bold mb-4 border-b-2 border-pink-700 pb-1 text-center">
          #{offset + 21}–#{offset + 40}
        </h2>
        <ol className="list-decimal list-inside space-y-0,9">
          {rangliste.slice(offset + 20, offset + 40).map((s, i) => (
            <li
              key={s.id ?? s.visningsnavn ?? i}
              className="flex justify-between items-center p-1 rounded-2xl cursor-pointer hover:bg-pink-700 hover:scale-[1.02] transform transition duration-300"
            >
              <span className="font-semibold text-base w-7 text-left">#{offset + 20 + i + 1}</span>
              <span className="flex-1 px-2 truncate text-sm">{s.visningsnavn}</span>
              <span className="font-mono text-base w-14 text-right">{Math.round(s.elo)}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* Månedens spillere */}
      <section className="bg-pink-700 bg-opacity-90 rounded-[24px] p-4 shadow-lg hover:shadow-xl transition-shadow duration-300 flex flex-col justify-between">
  <div>
    <h2 className="text-xl font-bold mb-4 border-b-2 border-pink-900 pb-1 text-center">
      📈 Månedens spillere
    </h2>
    <ol className="list-decimal list-inside space-y-0.5">
      {maanedens.length === 0 && <li>Indlæser...</li>}
      {maanedens.map((s, i) => (
        <li
          key={s.visningsnavn ?? i}
          className="flex justify-between items-center p-1 rounded-2xl cursor-pointer
                     hover:bg-pink-800 hover:scale-[1.02] transform transition duration-300"
        >
          <span className="font-semibold text-base w-7 text-left">#{i + 1}</span>
          <span className="flex-1 px-2 truncate text-sm">{s.visningsnavn}</span>
        <span className="font-mono text-base w-14 text-right">
  {(s.pluspoint ?? 0) > 0
    ? `+${(s.pluspoint ?? 0).toFixed(1)}`
    : (s.pluspoint ?? 0).toFixed(1)}
</span>


        </li>
      ))}
    </ol>
  </div>
  <p className="text-xl text-white font-semibold text-center mb-8">
    Tilmeld dig ranglisten →
  </p>
</section>

      {/* Mest aktive + QR kode */}
      <section className="bg-pink-700 bg-opacity-80 rounded-[24px] p-4 shadow-md hover:shadow-lg transition-shadow duration-300 flex flex-col justify-between">
        <div>
          <h2 className="text-xl font-bold mb-4 border-b-2 border-pink-800 pb-1 text-center">
            🏃‍♂️ Mest aktive
          </h2>
          <ol className="list-decimal list-inside space-y-0,9">
            {mestAktive.length === 0 && <li>Indlæser...</li>}
            {mestAktive.map((s, i) => (
              <li
                key={s.visningsnavn ?? i}
                className="flex justify-between items-center p-1 rounded-2xl cursor-pointer hover:bg-pink-800 hover:scale-[1.02] transform transition duration-300"
              >
                <span className="font-semibold text-base w-7 text-left">#{i + 1}</span>
                <span className="flex-1 px-2 truncate text-sm">{s.visningsnavn}</span>
                <span className="font-mono text-base w-14 text-right">{s.sæt}</span>
              </li>
            ))}
          </ol>
        </div>
        {/* QR Kode nederst */}
        <div className="flex justify-center mt-6">
          <QRCode value="https://padelhuset-app.netlify.app/signup" size={100} bgColor="#ffffff" fgColor="#ff69b4" />
        </div>
      </section>
    </main>
  )
}
