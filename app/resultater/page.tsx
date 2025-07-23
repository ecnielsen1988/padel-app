"use client"

import { supabase } from '../../lib/supabaseClient'
import React, { useEffect, useState } from 'react'

type Kamp = {
  id: number
  dato: string
  spiller1A: string
  spiller1B: string
  spiller2A: string
  spiller2B: string
  scoreA: number
  scoreB: number
  faerdigspillet: boolean
  ugentligtEvent: boolean
  torsdag: boolean
  tiebreak: string
}

type EloChange = {
  før: number
  efter: number
  diff: number
}

export default function ResultaterSide() {
  const [kampe, setKampe] = useState<Kamp[]>([])
  const [eloMap, setEloMap] = useState<Record<string, number>>({})
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

      const eloMapTemp: Record<string, number> = {}
      spillereData.forEach((s: any) => {
        eloMapTemp[s.navn] = s.elo_rating ?? 1500
      })

      const resultaterData = await hentAlleResultater()
      if (!resultaterData) return

      function beregnK(
        setFærdig: boolean,
        s1: number,
        s2: number,
        ugentligt: boolean,
        torsdag: boolean,
        tiebreak: string
      ) {
        let K = 64
        if (tiebreak === 'tiebreak') {
          K = 16
        } else if (tiebreak === 'matchtiebreak') {
          K = 32
        } else if (!setFærdig) {
          const maxScore = Math.max(s1, s2)
          if (maxScore === 6 || maxScore === 5) K = 32
          else if (maxScore === 4) K = 16
          else if (maxScore === 3) K = 8
          else if (maxScore === 2) K = 4
          else if (maxScore === 1) K = 2
        }
        if (ugentligt) K *= 2
        if (torsdag) K *= 2
        return K
      }

      const eloChangesTemp: Record<number, { [key: string]: EloChange }> = {}

      for (const kamp of resultaterData) {
        const r1a = eloMapTemp[kamp.spiller1A] ?? 1500
        const r1b = eloMapTemp[kamp.spiller1B] ?? 1500
        const r2a = eloMapTemp[kamp.spiller2A] ?? 1500
        const r2b = eloMapTemp[kamp.spiller2B] ?? 1500

        const ratingA = (r1a + r1b) / 2
        const ratingB = (r2a + r2b) / 2

        const EA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400))
        const EB = 1 - EA

        const baseK = beregnK(
          kamp.faerdigspillet,
          kamp.scoreA,
          kamp.scoreB,
          kamp.ugentligtEvent,
          kamp.torsdag || false,
          kamp.tiebreak
        )

        const scoreSum = kamp.scoreA + kamp.scoreB
        const scoreMax = Math.max(kamp.scoreA, kamp.scoreB)
        const adjustedK = scoreSum > 0 ? (baseK / scoreSum) * scoreMax : baseK

        let deltaA = 0
        let deltaB = 0

        if (kamp.scoreA > kamp.scoreB) {
          const delta = adjustedK * (1 - EA)
          deltaA = delta
          deltaB = -delta
        } else if (kamp.scoreB > kamp.scoreA) {
          const delta = adjustedK * (1 - EB)
          deltaA = -delta
          deltaB = delta
        } else {
          const delta = adjustedK * (EB - EA)
          deltaA = delta
          deltaB = -delta
        }

        const nyRatingA = r1a + deltaA
        const nyRatingB = r1b + deltaA
        const nyRatingC = r2a + deltaB
        const nyRatingD = r2b + deltaB

        eloChangesTemp[kamp.id] = {
          [kamp.spiller1A]: { før: r1a, efter: nyRatingA, diff: nyRatingA - r1a },
          [kamp.spiller1B]: { før: r1b, efter: nyRatingB, diff: nyRatingB - r1b },
          [kamp.spiller2A]: { før: r2a, efter: nyRatingC, diff: nyRatingC - r2a },
          [kamp.spiller2B]: { før: r2b, efter: nyRatingD, diff: nyRatingD - r2b },
        }

        eloMapTemp[kamp.spiller1A] = nyRatingA
        eloMapTemp[kamp.spiller1B] = nyRatingB
        eloMapTemp[kamp.spiller2A] = nyRatingC
        eloMapTemp[kamp.spiller2B] = nyRatingD
      }

      setKampe(resultaterData.reverse())
      setEloMap(eloMapTemp)
      setEloChanges(eloChangesTemp)
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
