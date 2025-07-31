import { supabase } from './supabaseClient'
import { beregnNyRangliste } from './beregnNyRangliste'
import dayjs from 'dayjs'

type EloÆndringRow = {
  spiller: string
  elo_ændring: number
  dato: string
}

type ResultRow = {
  spiller1: string | null
  spiller2: string | null
  spiller3: string | null
  spiller4: string | null
}

type Profil = {
  id: string
  visningsnavn: string | null
}

// Henter ranglisten som beregnes i beregnNyRangliste.ts
export async function hentRangliste() {
  return await beregnNyRangliste()
}

// Henter månedens spillere ved at summere elo-ændringer fra elo_ændringer tabellen siden månedens start
export async function hentMaanedensSpillere() {
  const startOfMonth = dayjs().startOf('month').toISOString()

  const { data, error } = await supabase
    .from<EloÆndringRow>('elo_ændringer')
    .select('spiller, elo_ændring, dato')
    .gte('dato', startOfMonth)

  if (error) throw error
  if (!data) return []

  const eloMap: Record<string, { spiller: string; sum_elo: number }> = {}

  for (const row of data) {
    if (!eloMap[row.spiller]) {
      eloMap[row.spiller] = { spiller: row.spiller, sum_elo: 0 }
    }
    eloMap[row.spiller].sum_elo += row.elo_ændring
  }

  return Object.values(eloMap)
    .sort((a, b) => b.sum_elo - a.sum_elo)
    .slice(0, 20)
}

// Henter de mest aktive spillere ved at tælle sæt spillet i denne måned
export async function hentMestAktiveSpillere() {
  const startOfMonth = dayjs().startOf('month').toISOString()

  const { data, error } = await supabase
    .from<ResultRow>('results')
    .select('spiller1, spiller2, spiller3, spiller4')
    .gte('oprettet', startOfMonth)

  if (error) throw error
  if (!data) return []

  // Find unikke spiller-IDs
  const spillerSet = new Set<string>()
  for (const sæt of data) {
    [sæt.spiller1, sæt.spiller2, sæt.spiller3, sæt.spiller4].forEach(spiller => {
      if (spiller) spillerSet.add(spiller)
    })
  }
  const spillereArray = Array.from(spillerSet)

  // Hent alle profiler i et enkelt kald
  const { data: profilerData, error: profilError } = await supabase
    .from<Profil>('profiles')
    .select('id, visningsnavn')
    .in('id', spillereArray)

  if (profilError) {
    console.error('Profil hentning fejlede:', profilError)
  }

  const profilMap = new Map<string, string>()
  profilerData?.forEach(profil => {
    profilMap.set(profil.id, profil.visningsnavn ?? 'Ukendt')
  })

  // Tæl sæt pr spiller
  const spillerTælling: Record<string, { navn: string; antalSæt: number }> = {}

  for (const sæt of data) {
    const spillere = [sæt.spiller1, sæt.spiller2, sæt.spiller3, sæt.spiller4]

    for (const spiller of spillere) {
      if (!spiller) continue

      if (!spillerTælling[spiller]) {
        spillerTælling[spiller] = {
          navn: profilMap.get(spiller) ?? 'Ukendt',
          antalSæt: 1,
        }
      } else {
        spillerTælling[spiller].antalSæt++
      }
    }
  }

  return Object.entries(spillerTælling)
    .map(([id, info]) => ({ id, ...info }))
    .sort((a, b) => b.antalSæt - a.antalSæt)
    .slice(0, 20)
}
