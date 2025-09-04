'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { beregnEloÆndringerForIndeværendeMåned } from '@/lib/beregnEloChange'

type AktivSpiller = {
  visningsnavn: string
  sæt: number
  pluspoint: number
}

export default function MestAktiveSide() {
  const [mestAktive, setMestAktive] = useState<AktivSpiller[]>([])

  useEffect(() => {
    const hentData = async () => {
      const eloData = await beregnEloÆndringerForIndeværendeMåned()

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
        console.error('Fejl ved hentning af kampe:', error)
        return
      }

      const tæller: Record<string, number> = {}
      kampeData.forEach(kamp => {
        ;[kamp.holdA1, kamp.holdA2, kamp.holdB1, kamp.holdB2].forEach(spiller => {
          if (spiller) {
            tæller[spiller] = (tæller[spiller] ?? 0) + 1
          }
        })
      })

      const samlet: AktivSpiller[] = Object.entries(tæller).map(([visningsnavn, sæt]) => {
        const elo = eloData.find(e => e.visningsnavn === visningsnavn)?.pluspoint ?? 0
        return { visningsnavn, sæt, pluspoint: elo }
      })

      samlet.sort((a, b) => {
        if (b.sæt !== a.sæt) return b.sæt - a.sæt
        return b.pluspoint - a.pluspoint
      })

      setMestAktive(samlet.slice(0, 20))
    }

    hentData()
  }, [])

  const emojiForPlacering = (index: number) => {
    if (index === 0) return '🏆'
    if (index === 1) return '🥈'
    if (index === 2) return '🥉'
    return '🏃‍♂️'
  }

  function goBack() {
    if (typeof window !== 'undefined') {
      if (window.history.length > 1) window.history.back()
      else window.location.href = '/'
    }
  }

  return (
    <main className="min-h-screen py-10 px-4 sm:px-8 md:px-16 bg-white dark:bg-[#1e1e1e] text-gray-900 dark:text-white font-sans relative">
      {/* ← Tilbage-knap øverst til venstre */}
      <div className="fixed top-4 left-4 z-50">
        <button
          type="button"
          onClick={goBack}
          aria-label="Tilbage"
          title="Tilbage"
          className="px-3 py-1.5 rounded-full border-2 border-pink-500 text-pink-600 bg-white/90 dark:bg-[#2a2a2a]/90 shadow hover:bg-pink-50 dark:hover:bg-pink-900/20 transition"
        >
          ← Tilbage
        </button>
      </div>

      <h1 className="text-2xl sm:text-4xl font-bold text-center text-pink-600 mb-10">
        🏃‍♂️ Mest aktive spillere i måneden
      </h1>

      {mestAktive.length === 0 ? (
        <p className="text-center text-gray-500 dark:text-gray-400">
          Ingen aktive spillere registreret endnu.
        </p>
      ) : (
        <ol className="space-y-4 max-w-2xl mx-auto">
          {mestAktive.map((spiller, index) => {
            const emoji = emojiForPlacering(index)

            return (
              <li
                key={spiller.visningsnavn}
                className={`flex items-center justify-between rounded-2xl px-6 py-4 shadow transition-all ${
                  index === 0
                    ? 'bg-gradient-to-r from-pink-500 to-pink-400 text-white scale-[1.03]'
                    : index === 1
                    ? 'bg-pink-100 dark:bg-pink-900/30'
                    : index === 2
                    ? 'bg-pink-50 dark:bg-pink-800/20'
                    : 'bg-white dark:bg-[#2a2a2a]'
                }`}
              >
                <div className="flex items-center gap-2 sm:gap-3">
                  <span className="text-base sm:text-xl font-bold text-pink-600 dark:text-pink-400">
                    #{index + 1}
                  </span>
                  <span className="text-sm sm:text-lg font-medium truncate">
                    {spiller.visningsnavn}
                  </span>
                </div>
                <span className="text-sm sm:text-base font-semibold whitespace-nowrap">
                  {spiller.sæt} sæt {emoji}
                </span>
              </li>
            )
          })}
        </ol>
      )}
    </main>
  )
}

