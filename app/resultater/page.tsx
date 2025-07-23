"use client"

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

      const { nyEloMap, eloChanges } = beregnEloForKampe(resultaterData, initialEloMap)

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
              {kamp.spiller1A} & {kamp.spiller1B} ({eloMap[kamp.spiller1A]?.toFixed(1)} & {eloMap[kamp.spiller1B]?.toFixed(1)})
              vs.{' '}
              {kamp.spiller2A} & {kamp.spiller2B} ({eloMap[kamp.spiller2A]?.toFixed(1)} & {eloMap[kamp.spiller2B]?.toFixed(1)})
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
