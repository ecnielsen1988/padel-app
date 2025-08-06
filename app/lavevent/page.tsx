'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { beregnEloForKampe, type Kamp, type EloMap } from '@/lib/beregnElo'

type Spiller = {
  visningsnavn: string
  elo: number
  tidligste_tid: string
}

type Bane = {
  navn: string
  start: string
  slut: string
}

export default function LavEventSide() {
  const [valgtDato, setValgtDato] = useState<string>('2025-08-14')
  const [spillere, setSpillere] = useState<Spiller[]>([])
  const [alleSpillere, setAlleSpillere] = useState<Spiller[]>([])
  const [nySpiller, setNySpiller] = useState('')
  const [step, setStep] = useState<1 | 2>(1)
  const [baner, setBaner] = useState<Bane[]>([])
  const [kampe, setKampe] = useState<string[][]>([])

  // Elo-beregning
  useEffect(() => {
    const hentOgBeregnElo = async () => {
      const { data: resultater } = await supabase
        .from('newresults')
        .select('*')
        .order('date', { ascending: true })
        .order('id', { ascending: true })

      const { data: profiler } = await supabase
        .from('profiles')
        .select('visningsnavn, startElo')

      if (!resultater || !profiler) return

      const initialEloMap: EloMap = {}
      profiler.forEach((p) => {
        if (p.visningsnavn) {
          initialEloMap[p.visningsnavn] = p.startElo ?? 1500
        }
      })

      const kampe: Kamp[] = resultater.map((kamp: any) => ({
        ...kamp,
        spiller1A: kamp.holdA1,
        spiller1B: kamp.holdA2,
        spiller2A: kamp.holdB1,
        spiller2B: kamp.holdB2,
      }))

      const { nyEloMap } = beregnEloForKampe(kampe, initialEloMap)

      const alle = profiler.map((p) => ({
        visningsnavn: p.visningsnavn,
        elo: Math.round(nyEloMap[p.visningsnavn] ?? 1500),
        tidligste_tid: '00:00',
      }))

      setAlleSpillere(alle)
    }

    hentOgBeregnElo()
  }, [])

  const tilføjSpiller = () => {
    const spiller = alleSpillere.find(s => s.visningsnavn === nySpiller)
    if (!spiller || spillere.find(s => s.visningsnavn === nySpiller)) return
    setSpillere(prev => [...prev, spiller])
    setNySpiller('')
  }

  const fjernSpiller = (navn: string) => {
    setSpillere(prev => prev.filter(s => s.visningsnavn !== navn))
  }

  const opretBaner = () => {
    const antalBaner = spillere.length / 4
    const tommeBaner: Bane[] = Array.from({ length: antalBaner }, (_, i) => ({
      navn: `Bane ${i + 1}`,
      start: '',
      slut: '',
    }))
    setBaner(tommeBaner)
    setStep(2)
  }

  const opdaterBane = (index: number, field: keyof Bane, value: string) => {
    const nyeBaner = [...baner]
    nyeBaner[index][field] = value
    setBaner(nyeBaner)
  }

  const fordelKampe = () => {
    const sorteret = [...spillere].sort((a, b) => b.elo - a.elo)
    const alleKampe: string[][] = []

    let spillerIndex = 0

    for (const bane of baner) {
      const tid = bane.start
      const sæt = []

      while (spillerIndex + 3 < sorteret.length) {
        const næsteFire = sorteret.slice(spillerIndex, spillerIndex + 4)
        const alleKanSpille = næsteFire.every(s => s.tidligste_tid <= tid)

        if (!alleKanSpille) {
          spillerIndex++
          continue
        }

        const [p1, p2, p3, p4] = næsteFire

        sæt.push(`${p1.visningsnavn} + ${p2.visningsnavn} vs ${p3.visningsnavn} + ${p4.visningsnavn}`)
        sæt.push(`${p1.visningsnavn} + ${p3.visningsnavn} vs ${p2.visningsnavn} + ${p4.visningsnavn}`)
        sæt.push(`${p1.visningsnavn} + ${p4.visningsnavn} vs ${p2.visningsnavn} + ${p3.visningsnavn}`)

        spillerIndex += 4
        break
      }

      alleKampe.push(sæt)
    }

    setKampe(alleKampe)
  }

  return (
    <main className="max-w-2xl mx-auto p-6 text-gray-900 dark:text-white">
      <h1 className="text-3xl font-bold mb-6 text-center">⚙️ Opret Event</h1>

      {/* Step 1: Spillere */}
      {step === 1 && (
        <>
          <input
            type="date"
            value={valgtDato}
            onChange={(e) => setValgtDato(e.target.value)}
            className="mb-4 p-2 border rounded bg-white text-black"
          />

          <div className="mb-4">
            <label className="block mb-1">Tilføj spiller</label>
            <div className="flex gap-2">
              <input
                type="text"
                list="spillere"
                value={nySpiller}
                onChange={(e) => setNySpiller(e.target.value)}
                className="p-2 border rounded bg-white text-black flex-1"
              />
              <button
                onClick={tilføjSpiller}
                className="bg-green-600 text-white px-4 py-2 rounded font-semibold"
              >
                Tilføj
              </button>
            </div>
            <datalist id="spillere">
              {alleSpillere.map(s => (
                <option key={s.visningsnavn} value={s.visningsnavn} />
              ))}
            </datalist>
          </div>

          <ul className="mb-4 space-y-1">
            {spillere.map(s => (
              <li key={s.visningsnavn} className="flex justify-between items-center bg-white dark:bg-[#2a2a2a] px-4 py-2 rounded">
                <span>{s.visningsnavn} (Elo: {s.elo})</span>
                <button onClick={() => fjernSpiller(s.visningsnavn)} className="text-red-600 text-sm">Fjern</button>
              </li>
            ))}
          </ul>

          <button
            disabled={spillere.length % 4 !== 0 || spillere.length === 0}
            onClick={opretBaner}
            className="w-full py-3 text-lg font-bold rounded bg-green-700 text-white disabled:bg-gray-400"
          >
            {spillere.length % 4 !== 0
              ? 'Antallet skal gå op i 4'
              : '✅ Næste: Indtast baner'}
          </button>
        </>
      )}

      {/* Step 2: Baner og kampfordeling */}
      {step === 2 && (
        <>
          <h2 className="text-xl font-semibold mb-4">Baner</h2>
          {baner.map((bane, i) => (
            <div key={i} className="mb-4 border p-3 rounded bg-white dark:bg-[#2a2a2a]">
              <input
                value={bane.navn}
                onChange={(e) => opdaterBane(i, 'navn', e.target.value)}
                placeholder="Banenavn"
                className="mb-2 block w-full p-2 border rounded text-black"
              />
              <input
                type="time"
                value={bane.start}
                onChange={(e) => opdaterBane(i, 'start', e.target.value)}
                className="mb-2 block w-full p-2 border rounded text-black"
              />
              <input
                type="time"
                value={bane.slut}
                onChange={(e) => opdaterBane(i, 'slut', e.target.value)}
                className="block w-full p-2 border rounded text-black"
              />
            </div>
          ))}

          <button
            onClick={fordelKampe}
            className="w-full py-3 text-lg font-bold rounded bg-green-700 text-white mt-4"
          >
            🎾 Generér kampe
          </button>

          {kampe.length > 0 && (
            <div className="mt-6">
              <h3 className="text-lg font-bold mb-2">📋 Kampoversigt</h3>
              {kampe.map((sæt, i) => (
                <div key={i} className="mb-4">
                  <h4 className="font-semibold mb-1">{baner[i].navn}</h4>
                  <ul className="list-disc list-inside">
                    {sæt.map((linje, j) => (
                      <li key={j}>{linje}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </main>
  )
}

