// lib/beregnLunar.ts

export type EloSnapshot = {
  visningsnavn: string
  date: string // 'YYYY-MM-DD'
  elo: number
}

export type MonthMeta = {
  year: number
  month: number // 1-12
  weight: number
  label: string // fx "Aug"
}

export type MonthAverage = {
  year: number
  month: number
  label: string
  weight: number
  avgElo: number | null
}

export type LunarRow = {
  visningsnavn: string
  months: MonthAverage[]
  weightedElo: number
  lunarBonus: number
  thursdayCount: number
  thursdayPoints: number
  total: number
}

/**
 * Lunar-sæson: August → Januar
 *
 * Hvis vi er i månederne:
 *  - Aug–Dec:  sæson = Aug (i år) → Jan (næste år)
 *  - Jan–Jul:  sæson = Aug (sidste år) → Jan (i år)
 *
 * Vægte:
 *  - Aug = 1
 *  - Sep = 2
 *  - Okt = 3
 *  - Nov = 4
 *  - Dec = 5
 *  - Jan = 6  (mest vægt)
 */
export function getLast6MonthsMeta(referenceDate = new Date()): MonthMeta[] {
  const year = referenceDate.getFullYear()
  const month = referenceDate.getMonth() + 1 // 1-12

  // hvis vi er i Aug–Dec, starter sæsonen i august samme år
  // hvis vi er i Jan–Jul, starter sæsonen i august sidste år
  const seasonStartYear = month >= 8 ? year : year - 1

  const metas: MonthMeta[] = [
    {
      year: seasonStartYear,
      month: 8,
      weight: 1,
      label: "Aug",
    },
    {
      year: seasonStartYear,
      month: 9,
      weight: 2,
      label: "Sep",
    },
    {
      year: seasonStartYear,
      month: 10,
      weight: 3,
      label: "Okt",
    },
    {
      year: seasonStartYear,
      month: 11,
      weight: 4,
      label: "Nov",
    },
    {
      year: seasonStartYear,
      month: 12,
      weight: 5,
      label: "Dec",
    },
    {
      year: seasonStartYear + 1,
      month: 1,
      weight: 6,
      label: "Jan",
    },
  ]

  return metas
}

/**
 * Beregner månedsgennemsnit + vægtet gennemsnit for ÉN spiller.
 *
 * snapshots: alle Elo-snapshots (for alle datoer)
 * eloStart: bruges KUN hvis der slet ikke findes snapshots for spilleren
 */
export function beregnMaanedsGnsForSpiller(
  snapshots: EloSnapshot[],
  eloStart: number,
  referenceDate = new Date()
): { months: MonthAverage[]; weightedAverage: number } {
  const monthsMeta = getLast6MonthsMeta(referenceDate)

  // Hvis spilleren aldrig har spillet: brug eloStart for alle måneder
  if (!snapshots || snapshots.length === 0) {
    const months: MonthAverage[] = monthsMeta.map((m) => ({
      year: m.year,
      month: m.month,
      label: m.label,
      weight: m.weight,
      avgElo: eloStart,
    }))

    return { months, weightedAverage: eloStart }
  }

  // Filtrér snapshots til kun den aktuelle Lunar-sæson (Aug–Jan)
  const filtered = snapshots.filter((s) => {
    const d = new Date(`${s.date}T00:00:00`)
    const year = d.getFullYear()
    const month = d.getMonth() + 1
    return monthsMeta.some((m) => m.year === year && m.month === month)
  })

  // Gruppér pr. måned
  const perMonth = new Map<string, number[]>()
  for (const s of filtered) {
    const d = new Date(`${s.date}T00:00:00`)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    if (!perMonth.has(key)) perMonth.set(key, [])
    perMonth.get(key)!.push(s.elo)
  }

  const months: MonthAverage[] = []
  let sumWeighted = 0
  let sumWeights = 0

  for (const m of monthsMeta) {
    const key = `${m.year}-${String(m.month).padStart(2, "0")}`
    const list = perMonth.get(key)

    if (!list || list.length === 0) {
      // Ingen kampe denne måned → ingen bidrag til vægtet gennemsnit
      months.push({
        year: m.year,
        month: m.month,
        label: m.label,
        weight: m.weight,
        avgElo: null,
      })
      continue
    }

    const avg = list.reduce((a, b) => a + b, 0) / list.length
    months.push({
      year: m.year,
      month: m.month,
      label: m.label,
      weight: m.weight,
      avgElo: avg,
    })

    sumWeighted += avg * m.weight
    sumWeights += m.weight
  }

  // Hvis spilleren har spillet i mindst én måned, men alle måneder i vinduet var "tomme"
  // (burde ikke ske, men bare i tilfælde), fallback til sidste Elo eller eloStart.
  let weightedAverage: number
  if (sumWeights > 0) {
    weightedAverage = sumWeighted / sumWeights
  } else {
    const lastSnap = snapshots[snapshots.length - 1]
    weightedAverage = lastSnap?.elo ?? eloStart
  }

  return { months, weightedAverage }
}

/** +5 point pr. torsdag pr. spiller */
export function thursdayBonus(count: number): number {
  return count * 5
}

