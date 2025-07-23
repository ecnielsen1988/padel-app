import { supabase } from '../lib/supabaseClient'

type Resultat = {
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
  tiebreak: 'ingen' | 'tiebreak' | 'matchtiebreak'
}

type EloMap = Record<string, number>
type AktivMap = Record<string, boolean>

async function hentAlleResultater(batchSize = 1000): Promise<Resultat[]> {
  let samletData: Resultat[] = []
  let offset = 0
  let batch: Resultat[] = []

  do {
    const { data, error } = await supabase
      .from('results')
      .select('*')
      .order('dato', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + batchSize - 1)

    if (error) throw error

    batch = data ?? []
    samletData = samletData.concat(batch)
    offset += batchSize
  } while (batch.length === batchSize)

  return samletData
}

export async function beregnRangliste(): Promise<{ navn: string; elo: number; aktiv: boolean }[]> {
  console.log('DEBUG: beregnRangliste er kaldt')

  const { data: spillereData, error } = await supabase.from('spillere').select('*')
  console.log('DEBUG: Spillere hentet fra Supabase:', spillereData)

  if (error || !spillereData) {
    console.error('Fejl ved hentning af spillere:', error)
    return []
  }

  const eloMap: EloMap = {}
  const aktivMap: AktivMap = {}

  spillereData.forEach((s: any) => {
    eloMap[s.navn] = s.elo_rating ?? 1500
    aktivMap[s.navn] = s.aktiv ?? false
  })

  console.log('DEBUG: eloMap:', eloMap)
  console.log('DEBUG: aktivMap:', aktivMap)

  const resultaterData = await hentAlleResultater()
  console.log('DEBUG: Resultater hentet:', resultaterData.length)

  for (const kamp of resultaterData) {
    if (
      !(kamp.spiller1A in eloMap) ||
      !(kamp.spiller1B in eloMap) ||
      !(kamp.spiller2A in eloMap) ||
      !(kamp.spiller2B in eloMap)
    ) continue

    const r1a = eloMap[kamp.spiller1A]
    const r1b = eloMap[kamp.spiller1B]
    const r2a = eloMap[kamp.spiller2A]
    const r2b = eloMap[kamp.spiller2B]

    const ratingA = (r1a + r1b) / 2
    const ratingB = (r2a + r2b) / 2

    const EA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400))
    const EB = 1 - EA

    let K = 64
    if (kamp.tiebreak === 'tiebreak') K = 16
    else if (kamp.tiebreak === 'matchtiebreak') K = 32
    else {
      const maxScore = Math.max(kamp.scoreA, kamp.scoreB)
      if (!kamp.faerdigspillet) {
        if (maxScore === 6 || maxScore === 5) K = 32
        else if (maxScore === 4) K = 16
        else if (maxScore === 3) K = 8
        else if (maxScore === 2) K = 4
        else if (maxScore === 1) K = 2
      }
    }
    if (kamp.ugentligtEvent) K *= 2
    if (kamp.torsdag) K *= 2

    const scoreSum = kamp.scoreA + kamp.scoreB
    const scoreMax = Math.max(kamp.scoreA, kamp.scoreB)
    const NyK = scoreSum > 0 ? (K / scoreSum) * scoreMax : K

    let deltaA = 0
    let deltaB = 0

    if (kamp.scoreA > kamp.scoreB) {
      const delta = NyK * (1 - EA)
      deltaA = delta
      deltaB = -delta
    } else if (kamp.scoreB > kamp.scoreA) {
      const delta = NyK * (1 - EB)
      deltaA = -delta
      deltaB = delta
    } else {
      deltaA = NyK * (1 - EA) - NyK * EA
      deltaB = NyK * (1 - EB) - NyK * EB
    }

    eloMap[kamp.spiller1A] = r1a + deltaA
    eloMap[kamp.spiller1B] = r1b + deltaA
    eloMap[kamp.spiller2A] = r2a + deltaB
    eloMap[kamp.spiller2B] = r2b + deltaB
  }

  const aktiveSpillere = Object.entries(eloMap)
    .filter(([navn]) => aktivMap[navn])
    .map(([navn, elo]) => ({ navn, elo, aktiv: true }))
    .sort((a, b) => b.elo - a.elo)

  console.log('DEBUG: Aktive spillere til ranglisten:', aktiveSpillere)

  return aktiveSpillere
}
