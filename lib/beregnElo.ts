export type Kamp = {
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
  tiebreak: string
}

export type EloMap = Record<string, number>

export type EloChange = {
  før: number
  efter: number
  diff: number
}

export type EloChanges = Record<number, { [key: string]: EloChange }>

function beregnK(
  faerdigspillet: boolean,
  scoreA: number,
  scoreB: number,
  ugentligt: boolean,
  torsdag: boolean,
  tiebreak: string
): number {
  let K = 64

  if (tiebreak === 'tiebreak') {
    K = 16
  } else if (tiebreak === 'matchtiebreak') {
    K = 32
  } else if (!faerdigspillet) {
    const maxScore = Math.max(scoreA, scoreB)
    if (maxScore === 6 || maxScore === 5) K = 32
    else if (maxScore === 4) K = 16
    else if (maxScore === 3) K = 8
    else if (maxScore === 2) K = 4
    else if (maxScore === 1) K = 2
  }

  if (ugentligt) K *= 2
  if (torsdag) K *= 2

  return K
}

export function beregnEloForKampe(
  kampe: Kamp[],
  initialEloMap: EloMap
): { nyEloMap: EloMap; eloChanges: EloChanges } {
  const eloMap: EloMap = { ...initialEloMap }
  const eloChanges: EloChanges = {}

  for (const kamp of kampe) {
    const r1a = eloMap[kamp.spiller1A] ?? 1500
    const r1b = eloMap[kamp.spiller1B] ?? 1500
    const r2a = eloMap[kamp.spiller2A] ?? 1500
    const r2b = eloMap[kamp.spiller2B] ?? 1500

    const ratingA = (r1a + r1b) / 2
    const ratingB = (r2a + r2b) / 2

    const EA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400))
    const EB = 1 - EA

    const baseK = beregnK(
      kamp.faerdigspillet,
      kamp.scoreA,
      kamp.scoreB,
      kamp.ugentligtEvent,
      kamp.torsdag,
      kamp.tiebreak
    )

    const scoreSum = kamp.scoreA + kamp.scoreB
    const scoreMax = Math.max(kamp.scoreA, kamp.scoreB)
    const adjustedK = scoreSum > 0 ? (baseK / scoreSum) * scoreMax : baseK

    let deltaA = 0
    let deltaB = 0

    if (kamp.scoreA > kamp.scoreB) {
      const delta = adjustedK * (1 - EA)
      deltaA = delta
      deltaB = -delta
    } else if (kamp.scoreB > kamp.scoreA) {
      const delta = adjustedK * (1 - EB)
      deltaA = -delta
      deltaB = delta
    } else {
      const delta = adjustedK * (EB - EA)
      deltaA = delta
      deltaB = -delta
    }

    const nyRatingA = r1a + deltaA
    const nyRatingB = r1b + deltaA
    const nyRatingC = r2a + deltaB
    const nyRatingD = r2b + deltaB

    eloChanges[kamp.id] = {
      [kamp.spiller1A]: { før: r1a, efter: nyRatingA, diff: nyRatingA - r1a },
      [kamp.spiller1B]: { før: r1b, efter: nyRatingB, diff: nyRatingB - r1b },
      [kamp.spiller2A]: { før: r2a, efter: nyRatingC, diff: nyRatingC - r2a },
      [kamp.spiller2B]: { før: r2b, efter: nyRatingD, diff: nyRatingD - r2b },
    }

    eloMap[kamp.spiller1A] = nyRatingA
    eloMap[kamp.spiller1B] = nyRatingB
    eloMap[kamp.spiller2A] = nyRatingC
    eloMap[kamp.spiller2B] = nyRatingD
  }

  return { nyEloMap: eloMap, eloChanges }
}