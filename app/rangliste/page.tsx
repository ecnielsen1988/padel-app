'use client'

import { useEffect, useState } from 'react'
import { beregnRangliste } from '../../lib/beregnRangliste'

export default function RanglisteSide() {
  const [rangliste, setRangliste] = useState<{ navn: string; elo: number }[]>([])

  useEffect(() => {
    async function hentRangliste() {
      try {
        const data = await beregnRangliste()
        setRangliste(data)
      } catch (e) {
        console.error('Fejl i hentRangliste:', e)
      }
    }
    hentRangliste()
  }, [])

  return (
    <main>
      <h1>🏆 Rangliste</h1>
      {rangliste.length === 0 ? (
        <p>Ingen spillere i ranglisten</p>
      ) : (
        <ol>
          {rangliste.map((spiller, index) => (
            <li key={spiller.navn} style={{ marginBottom: '0.5rem' }}>
              <strong>#{index + 1}</strong> {spiller.navn} – Elo: {Math.round(spiller.elo)}
            </li>
          ))}
        </ol>
      )}
    </main>
  )
}
