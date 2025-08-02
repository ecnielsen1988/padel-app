// lib/beregnNyRangliste.ts
import { supabase } from '../lib/supabaseClient'

type Resultat = {
  id: number
  date: string
  holdA1: string
  holdA2: string
  holdB1: string
  holdB2: string
  scoreA: number
  scoreB: number
  finish: boolean
  event: boolean
  tiebreak: 'ingen' | 'tiebreak' | 'matchtiebreak'
}

type Profil = {
  visningsnavn: string
  startElo: number | null
  køn: string | null
}

type EloMap = Record<string, number>

async function hentAlleResultater(batchSize = 1000): Promise<Resultat[]> {
  let samletData: Resultat[] = []
  let offset = 0
  let batch: Resultat[] = []

  do {
    const { data, error } = await supabase
      .from('newresults')
      .select('*')
      .order('date', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + batchSize - 1)

    if (error) throw error

    batch = data ?? []
    samletData = samletData.concat(batch)
    offset += batchSize
  } while (batch.length === batchSize)

  return samletData
}

export async function beregnNyRangliste(): Promise<
  { visningsnavn: string; elo: number; køn: string | null }[]
> {
  const { data, error } = await supabase
    .from('profiles')
    .select('visningsnavn, startElo, køn')

  if (error) {
    console.error('❌ Fejl ved hentning af spillere:', error)
    return []
  }

  if (!Array.isArray(data)) {
    console.error('❌ Data fra Supabase er ikke et array:', data)
    return []
  }

  const profilesData: Profil[] = data

  const eloMap: EloMap = {}
  profilesData.forEach((s) => {
    eloMap[s.visningsnavn] = s.startElo ?? 1500
  })

  const resultaterData = await hentAlleResultater()

  if (resultaterData.length === 0) {
    return profilesData
      .map(({ visningsnavn, startElo, køn }) => ({
        visningsnavn,
        elo: startElo ?? 1500,
        køn,
      }))
      .sort((a, b) => b.elo - a.elo)
  }

  for (const kamp of resultaterData) {
    const { holdA1, holdA2, holdB1, holdB2 } = kamp

    if (
      !(holdA1 in eloMap) ||
      !(holdA2 in eloMap) ||
      !(holdB1 in eloMap) ||
      !(holdB2 in eloMap)
    ) {
      console.log('Ignorerer kamp – mangler spillere:')
      if (!(holdA1 in eloMap)) console.log('Mangler:', holdA1)
      if (!(holdA2 in eloMap)) console.log('Mangler:', holdA2)
      if (!(holdB1 in eloMap)) console.log('Mangler:', holdB1)
      if (!(holdB2 in eloMap)) console.log('Mangler:', holdB2)
      continue
    }

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
      if (!kamp.finish) {
        if (maxScore === 6 || maxScore === 5) K = 16
        else if (maxScore === 4) K = 8
        else if (maxScore === 3) K = 4
        else if (maxScore === 2) K = 2
        else if (maxScore === 1) K = 1
      }
    }

    if (kamp.event) K *= 2

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

  return Object.entries(eloMap)
    .map(([visningsnavn, elo]) => {
      const profil = profilesData.find((p) => p.visningsnavn === visningsnavn)
      return {
        visningsnavn,
        elo,
        køn: profil?.køn ?? null,
      }
    })
    .sort((a, b) => b.elo - a.elo)
}

