import { beregnNyRangliste } from './beregnNyRangliste'

// Henter ranglisten som beregnes i beregnNyRangliste.ts
export async function hentRangliste() {
  try {
    const rangliste = await beregnNyRangliste()
    return rangliste
  } catch (error) {
    console.error('Fejl i hentRangliste:', error)
    return []
  }
}

