// app/nyrangliste/page.tsx
import { beregnNyRangliste } from '../../lib/beregnNyRangliste'

export default async function NyRanglisteSide() {
  const rangliste = await beregnNyRangliste()

  return (
    <main>
      <h1>📋 Ny ranglisten</h1>
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
