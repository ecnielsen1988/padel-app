'use client'

import { supabase } from '../../lib/supabaseClient'
import React, { useEffect, useState } from 'react'
import { Kamp, EloChange, EloMap, beregnEloForKampe } from '../../lib/beregnElo'

interface KampGruppe {
  kampid: number
  sæt: Kamp[]
}

export default function SenesteKampeSide() {
  const [kampGrupper, setKampGrupper] = useState<KampGruppe[]>([])
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

      const resultaterDataTilBeregning = resultaterData.map((kamp) => ({
        ...kamp,
        spiller1A: kamp.holdA1,
        spiller1B: kamp.holdA2,
        spiller2A: kamp.holdB1,
        spiller2B: kamp.holdB2,
      }))

      const { nyEloMap, eloChanges } = beregnEloForKampe(resultaterDataTilBeregning, initialEloMap)

      const grupper: Record<number, Kamp[]> = {}
      resultaterData.forEach((kamp) => {
        const key = kamp.kampid ?? 0
        if (!grupper[key]) grupper[key] = []
        grupper[key].push(kamp)
      })

      const kampGrupperArray: KampGruppe[] = Object.entries(grupper)
        .map(([kampid, sæt]) => ({
          kampid: Number(kampid),
          sæt,
        }))
        .sort((a, b) => b.kampid - a.kampid)
        .slice(0, 20)

      setKampGrupper(kampGrupperArray)
      setEloMap(nyEloMap)
      setEloChanges(eloChanges)
    }

    hentResultaterOgBeregnElo()
  }, [])

  return (
    <div
      style={{
        padding: '1rem',
        fontFamily: 'Arial, sans-serif',
        maxWidth: '700px',
        margin: 'auto',
        color: 'inherit',
        backgroundColor: 'inherit',
      }}
    >
      <h1 style={{ textAlign: 'center', marginBottom: '0.5rem' }}>🎾 Seneste Kampe med Elo-ændringer</h1>
      <p style={{ textAlign: 'center', marginBottom: '2rem', color: '#666' }}>
        Viser de seneste 20 kampe
      </p>

      {kampGrupper.map(({ kampid, sæt }) => {
        const førsteSæt = sæt[0]

        // Brug første sæt og hent ELO før første sæt
        const førsteElo = eloChanges[førsteSæt.id]
        let spillere: { navn: string; startElo: number }[] = []

        if (førsteElo) {
          spillere = [
            { navn: førsteSæt.holdA1, startElo: førsteElo[førsteSæt.holdA1]?.før ?? 1500 },
            { navn: førsteSæt.holdA2, startElo: førsteElo[førsteSæt.holdA2]?.før ?? 1500 },
            { navn: førsteSæt.holdB1, startElo: førsteElo[førsteSæt.holdB1]?.før ?? 1500 },
            { navn: førsteSæt.holdB2, startElo: førsteElo[førsteSæt.holdB2]?.før ?? 1500 },
          ].sort((a, b) => b.startElo - a.startElo)
        }

        // Saml Elo-ændringer for hele kampen
        const samletEloChanges: { [key: string]: EloChange } = {}
        sæt.forEach((kamp) => {
          const changes = eloChanges[kamp.id]
          if (changes) {
            Object.entries(changes).forEach(([navn, change]) => {
              if (!samletEloChanges[navn]) {
                samletEloChanges[navn] = { før: change.før, efter: change.efter, diff: 0 }
              }
              samletEloChanges[navn].diff += change.diff
              samletEloChanges[navn].efter = change.efter
            })
          }
        })

        // Sortér spillere til total-opsummering efter efter-ELO
        const totalEloSorted = Object.entries(samletEloChanges).sort(
          (a, b) => b[1].efter - a[1].efter
        )

        return (
          <div
            key={kampid}
            style={{
              marginBottom: '2.5rem',
              padding: '1rem 1.5rem',
              border: '2px solid #4CAF50',
              borderRadius: '8px',
              backgroundColor: 'var(--bg-card, #f0fff4)',
              color: 'var(--text-primary, #000)',
              boxShadow: '0 0 5px rgba(0,0,0,0.1), 0 0 10px rgba(0,0,0,0.05)',
            }}
          >
            {/* Dato */}
            <div
              style={{
                fontSize: '1.1rem',
                marginBottom: '0.3rem',
                fontWeight: '600',
              }}
            >
              📅 {new Date(førsteSæt.dato).toLocaleDateString('da-DK')}
            </div>

            {/* Spillere og start Elo */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-around',
                fontWeight: '600',
                marginBottom: '0.8rem',
              }}
            >
              {spillere.map(({ navn, startElo }) => (
                <div key={navn} style={{ textAlign: 'center', minWidth: '110px' }}>
                  🎾 <br />
                  {navn} <br />
                  <small style={{ color: '#555' }}>ELO før: {startElo.toFixed(1)}</small>
                </div>
              ))}
            </div>

            {/* Sæt info */}
            <div style={{ marginBottom: '1rem' }}>
              {sæt.map((kamp, index) => {
                const changes = eloChanges[kamp.id]
                let setElo = 0
                if (changes) {
                  const maxDiff = Math.max(...Object.values(changes).map((c) => c.diff))
                  setElo = maxDiff > 0 ? maxDiff : 0
                }

                return (
                  <div
                    key={kamp.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '0.3rem 0',
                      borderBottom: index === sæt.length - 1 ? 'none' : '1px solid #ddd',
                      fontSize: '0.95rem',
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      {kamp.holdA1} & {kamp.holdA2} vs. {kamp.holdB1} & {kamp.holdB2}
                    </div>
                    <div style={{ width: '70px', textAlign: 'center' }}>
                      {kamp.scoreA} - {kamp.scoreB}
                    </div>
                    <div
                      style={{
                        width: '50px',
                        textAlign: 'right',
                        fontWeight: '700',
                        color: '#2e7d32',
                      }}
                    >
                      {setElo.toFixed(1)}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Total Elo ændringer */}
            <div>
              <strong>🔥 Total Elo ændringer:</strong>
              <ul style={{ listStyle: 'none', paddingLeft: 0, marginTop: '0.3rem' }}>
                {totalEloSorted.map(([navn, elo]) => (
                  <li
                    key={navn}
                    style={{
                      marginBottom: '0.2rem',
                      color: elo.diff >= 0 ? '#2e7d32' : '#c62828',
                      fontWeight: '600',
                    }}
                  >
                    {navn}: {elo.før.toFixed(1)} → {elo.efter.toFixed(1)} ({elo.diff >= 0 ? '+' : ''}
                    {elo.diff.toFixed(1)})
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )
      })}
    </div>
  )
}
