export type Kamp = {
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
    const rA1 = eloMap[kamp.holdA1] ?? 1500
    const rA2 = eloMap[kamp.holdA2] ?? 1500
    const rB1 = eloMap[kamp.holdB1] ?? 1500
    const rB2 = eloMap[kamp.holdB2] ?? 1500

    const ratingA = (rA1 + rA2) / 2
    const ratingB = (rB1 + rB2) / 2

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

    const nyRatingA1 = rA1 + deltaA
    const nyRatingA2 = rA2 + deltaA
    const nyRatingB1 = rB1 + deltaB
    const nyRatingB2 = rB2 + deltaB

    eloChanges[kamp.id] = {
      [kamp.holdA1]: { før: rA1, efter: nyRatingA1, diff: nyRatingA1 - rA1 },
      [kamp.holdA2]: { før: rA2, efter: nyRatingA2, diff: nyRatingA2 - rA2 },
      [kamp.holdB1]: { før: rB1, efter: nyRatingB1, diff: nyRatingB1 - rB1 },
      [kamp.holdB2]: { før: rB2, efter: nyRatingB2, diff: nyRatingB2 - rB2 },
    }

    eloMap[kamp.holdA1] = nyRatingA1
    eloMap[kamp.holdA2] = nyRatingA2
    eloMap[kamp.holdB1] = nyRatingB1
    eloMap[kamp.holdB2] = nyRatingB2
  }

  return { nyEloMap: eloMap, eloChanges }
}
