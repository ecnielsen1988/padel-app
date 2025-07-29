'use client'

import { useEffect, useState } from 'react'
import { beregnHeleRanglisten } from '../../lib/beregnHeleRanglisten'

export default function HeleRanglistenSide() {
  const [rangliste, setRangliste] = useState<{ navn: string; elo: number }[]>([])

  useEffect(() => {
    async function hentRangliste() {
      try {
        const data = await beregnHeleRanglisten()
        setRangliste(data)
      } catch (e) {
        console.error('Fejl i hentHeleRangliste:', e)
      }
    }
    hentRangliste()
  }, [])

  return (
    <main>
      <h1>📋 Hele ranglisten</h1>
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
