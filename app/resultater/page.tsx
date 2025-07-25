'use client'

import { supabase } from '../../lib/supabaseClient'
import React, { useEffect, useState } from 'react'
import { Kamp, EloChange, EloMap, beregnEloForKampe } from '../../lib/beregnElo'

export default function ResultaterSide() {
  const [kampe, setKampe] = useState<Kamp[]>([])
  const [eloMap, setEloMap] = useState<EloMap>({})
  const [eloChanges, setEloChanges] = useState<Record<number, { [key: string]: EloChange }>>({})

  useEffect(() => {
    async function hentAlleResultater(): Promise<Kamp[]> {
      const batchSize = 1000
      let alleResultater: Kamp[] = []
      let lastId = 0

      while (true) {
        const { data: batch, error } = await supabase
          .from('results')
          .select('*')
          .order('dato', { ascending: true })
          .order('id', { ascending: true })
          .gt('id', lastId)
          .limit(batchSize)

        if (error) {
          console.error('Fejl ved hentning af batch:', error)
          break
        }

        if (!batch || batch.length === 0) break

        alleResultater = alleResultater.concat(batch)
        lastId = batch[batch.length - 1].id

        if (batch.length < batchSize) break
      }

      return alleResultater
    }

    async function hentResultaterOgBeregnElo() {
      const { data: spillereData } = await supabase.from('spillere').select('*')
      if (!spillereData) return

      const initialEloMap: EloMap = {}
      spillereData.forEach((s: any) => {
        initialEloMap[s.navn.trim()] = s.elo_rating ?? 1500
      })

      const resultaterData = await hentAlleResultater()
      if (!resultaterData) return

      // Her laver vi et map til at oversætte nye feltnavne til gamle, hvis beregnEloForKampe forventer de gamle
      const resultaterDataTilBeregning = resultaterData.map((kamp) => ({
        ...kamp,
        spiller1A: kamp.holdA1,
        spiller1B: kamp.holdA2,
        spiller2A: kamp.holdB1,
        spiller2B: kamp.holdB2,
        // evt andre nødvendige mappings
      }))

      const { nyEloMap, eloChanges } = beregnEloForKampe(resultaterDataTilBeregning, initialEloMap)

      setKampe(resultaterData.reverse())
      setEloMap(nyEloMap)
      setEloChanges(eloChanges)
    }

    hentResultaterOgBeregnElo()
  }, [])

  return (
    <div style={{ padding: '1rem' }}>
      <h1>Alle Padelkampe med Elo-ændringer</h1>
      <ul>
        {kampe.map(kamp => (
          <li
            key={kamp.id}
            style={{ marginBottom: '1rem', borderBottom: '1px solid #ccc', paddingBottom: '0.5rem' }}
          >
            <div>
              <strong>{new Date(kamp.dato).toLocaleDateString()}</strong> (ID: {kamp.id})
            </div>
            <div>
              {kamp.holdA1} & {kamp.holdA2} ({eloMap[kamp.holdA1]?.toFixed(1)} & {eloMap[kamp.holdA2]?.toFixed(1)})
              vs.{' '}
              {kamp.holdB1} & {kamp.holdB2} ({eloMap[kamp.holdB1]?.toFixed(1)} & {eloMap[kamp.holdB2]?.toFixed(1)})
            </div>
            <div>
              Score: {kamp.scoreA} - {kamp.scoreB}
            </div>
            <div>Tiebreak-type: <strong>{kamp.tiebreak}</strong></div>
            <div>
              Elo ændringer:
              <ul>
                {eloChanges[kamp.id] &&
                  Object.entries(eloChanges[kamp.id]).map(([navn, elo]) => (
                    <li key={navn}>
                      {navn}: {elo.før.toFixed(1)} → {elo.efter.toFixed(1)} ({elo.diff >= 0 ? '+' : ''}
                      {elo.diff.toFixed(1)})
                    </li>
                  ))}
              </ul>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
