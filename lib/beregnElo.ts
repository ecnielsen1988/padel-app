export type Kamp = {
  id: number
  kampid: number
  date: string
  holdA1: string
  holdA2: string
  holdB1: string
  holdB2: string
  scoreA: number
  scoreB: number
  finish: boolean
  event: boolean
  tiebreak: string
}

export type EloMap = Record<string, number>

export type EloChange = {
  before: number
  after: number
  diff: number
}

export type EloChanges = Record<number, { [key: string]: EloChange }>

function beregnK(
  finish: boolean,
  scoreA: number,
  scoreB: number,
  event: boolean,
  tiebreak: string
): number {
  let K = 32

  if (tiebreak === 'tiebreak') {
    K = 8
  } else if (tiebreak === 'matchtiebreak') {
    K = 16
  } else if (!finish) {
    const maxScore = Math.max(scoreA, scoreB)
    if (maxScore === 6 || maxScore === 5) K = 16
    else if (maxScore === 4) K = 8
    else if (maxScore === 3) K = 4
    else if (maxScore === 2) K = 2
    else if (maxScore === 1) K = 1
  }

  if (event) K *= 2

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
      kamp.finish,
      kamp.scoreA,
      kamp.scoreB,
      kamp.event,
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
      [kamp.holdA1]: { before: rA1, after: nyRatingA1, diff: nyRatingA1 - rA1 },
      [kamp.holdA2]: { before: rA2, after: nyRatingA2, diff: nyRatingA2 - rA2 },
      [kamp.holdB1]: { before: rB1, after: nyRatingB1, diff: nyRatingB1 - rB1 },
      [kamp.holdB2]: { before: rB2, after: nyRatingB2, diff: nyRatingB2 - rB2 },
    }

    eloMap[kamp.holdA1] = nyRatingA1
    eloMap[kamp.holdA2] = nyRatingA2
    eloMap[kamp.holdB1] = nyRatingB1
    eloMap[kamp.holdB2] = nyRatingB2
  }

  return { nyEloMap: eloMap, eloChanges }
}
