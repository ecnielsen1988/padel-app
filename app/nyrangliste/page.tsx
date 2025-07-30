export const dynamic = 'force-dynamic'

import { beregnNyRangliste } from '../../lib/beregnNyRangliste'

export default async function NyRanglisteSide() {
  const rangliste = await beregnNyRangliste()

  return (
    <main style={{ padding: '2rem', maxWidth: '600px', margin: 'auto', fontFamily: 'Arial' }}>
      <h1 style={{ marginBottom: '1.5rem', textAlign: 'center' }}>📋 Ranglisten</h1>
      {rangliste.length === 0 ? (
        <p style={{ textAlign: 'center', color: '#666' }}>Ingen spillere i ranglisten</p>
      ) : (
        <ol style={{ paddingLeft: '1.2rem' }}>
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
