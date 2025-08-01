// lib/beregnHeleRangliste.ts
import { supabase } from '../lib/supabaseClient'

type Resultat = {
  id: number
  dato: string
  holdA1: string
  holdA2: string
  holdB1: string
  holdB2: string
  scoreA: number
  scoreB: number
  faerdigspillet: boolean
  ugentligtEvent: boolean
  torsdag: boolean
  tiebreak: 'ingen' | 'tiebreak' | 'matchtiebreak'
}

type EloMap = Record<string, number>

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

export async function beregnHeleRanglisten(): Promise<{ navn: string; elo: number }[]> {
  const { data: spillereData, error } = await supabase.from('spillere').select('*')
  if (error || !spillereData) {
    console.error('Fejl ved hentning af spillere:', error)
    return []
  }

  const eloMap: EloMap = {}
  spillereData.forEach((s: any) => {
    eloMap[s.navn] = s.elo_rating ?? 1500
  })

  const resultaterData = await hentAlleResultater()

  for (const kamp of resultaterData) {
    const { holdA1, holdA2, holdB1, holdB2 } = kamp

    if (
      !(holdA1 in eloMap) ||
      !(holdA2 in eloMap) ||
      !(holdB1 in eloMap) ||
      !(holdB2 in eloMap)
    ) continue

    const rA1 = eloMap[holdA1]
    const rA2 = eloMap[holdA2]
    const rB1 = eloMap[holdB1]
    const rB2 = eloMap[holdB2]

    const ratingA = (rA1 + rA2) / 2
    const ratingB = (rB1 + rB2) / 2

    const EA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400))
    const EB = 1 - EA

    let K = 32
    if (kamp.tiebreak === 'tiebreak') K = 8
    else if (kamp.tiebreak === 'matchtiebreak') K = 16
    else {
      const maxScore = Math.max(kamp.scoreA, kamp.scoreB)
      if (!kamp.faerdigspillet) {
        if (maxScore === 6 || maxScore === 5) K = 16
        else if (maxScore === 4) K = 8
        else if (maxScore === 3) K = 4
        else if (maxScore === 2) K = 2
        else if (maxScore === 1) K = 1
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

    eloMap[holdA1] = rA1 + deltaA
    eloMap[holdA2] = rA2 + deltaA
    eloMap[holdB1] = rB1 + deltaB
    eloMap[holdB2] = rB2 + deltaB
  }

  const alleSpillere = Object.entries(eloMap)
    .map(([navn, elo]) => ({ navn, elo }))
    .sort((a, b) => b.elo - a.elo)

  return alleSpillere
}
