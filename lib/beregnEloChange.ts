// lib/beregnEloChange.ts
import { supabase } from './supabaseClient'
import { beregnEloForKampe, Kamp, EloMap } from './beregnElo'

export interface MånedensSpiller {
  visningsnavn: string
  pluspoint: number
}

// ———————————————————————————————
// Helpers til månedssnit i Europe/Copenhagen
// ———————————————————————————————
type MonthOpts = { year?: number; month?: number }

function monthStartCph(year: number, month1_12: number): string {
  const d = new Date(Date.UTC(year, month1_12 - 1, 1, 0, 0, 0))
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Copenhagen',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return fmt.format(d) // YYYY-MM-DD
}

function nextMonthStartCph(year: number, month1_12: number): string {
  const d = new Date(Date.UTC(year, month1_12 - 1, 1, 0, 0, 0))
  d.setUTCMonth(d.getUTCMonth() + 1)
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Copenhagen',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return fmt.format(d) // YYYY-MM-DD
}

function getMonthBoundsCph(opts?: MonthOpts) {
  if (opts?.year && opts?.month) {
    const start = monthStartCph(opts.year, opts.month)
    const endExclusive = nextMonthStartCph(opts.year, opts.month)
    return { start, endExclusive }
  }
  // fallback: indeværende måned
  const now = new Date()
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Copenhagen',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now)
  const y = Number(parts.find(p => p.type === 'year')!.value)
  const m = Number(parts.find(p => p.type === 'month')!.value)
  return { start: monthStartCph(y, m), endExclusive: nextMonthStartCph(y, m) }
}

// ———————————————————————————————
// Hovedfunktion: netto Elo for (valgfri) måned
// ———————————————————————————————
export async function beregnEloÆndringerForIndeværendeMåned(
  opts?: MonthOpts
): Promise<MånedensSpiller[]> {
  const { start, endExclusive } = getMonthBoundsCph(opts)

  // 1) Hent sæt FØR måneden (til at danne seed-tilstand) + sæt I måneden
  const [{ data: saetBefore, error: e1 }, { data: saetMonth, error: e2 }] = await Promise.all([
    supabase
      .from('newresults')
      .select('*')
      .lt('date', start)
      .order('date', { ascending: true })
      .order('id', { ascending: true }),
    supabase
      .from('newresults')
      .select('*')
      .gte('date', start)
      .lt('date', endExclusive)
      .order('date', { ascending: true })
      .order('id', { ascending: true }),
  ])

  if (e1) {
    console.error('Fejl ved hentning af sæt før måned:', e1)
    return []
  }
  if (e2) {
    console.error('Fejl ved hentning af sæt i måned:', e2)
    return []
  }
  if (!saetMonth || saetMonth.length === 0) return []

  // 2) Hent spillere med startElo -> initialEloMap (fallback 0)
  const { data: spillereData } = await supabase.from('profiles').select('visningsnavn, startElo')
  if (!spillereData) return []

  const initialEloMap: EloMap = {}
  if (Array.isArray(spillereData)) {
    spillereData.forEach((s: any) => {
      const navn = typeof s.visningsnavn === 'string' ? s.visningsnavn.trim() : null
      if (navn) {
        initialEloMap[navn] = typeof s.startElo === 'number' ? s.startElo : 0
      }
    })
  }

  // 3) Map rækker -> Kamp-format som din beregnEloForKampe forventer
  const mapTilKamp = (kamp: any): Kamp => ({
    ...kamp,
    spiller1A: kamp.holdA1,
    spiller1B: kamp.holdA2,
    spiller2A: kamp.holdB1,
    spiller2B: kamp.holdB2,
  })

  const førKampe: Kamp[] = (saetBefore ?? []).map(mapTilKamp)
  const månedKampe: Kamp[] = (saetMonth ?? []).map(mapTilKamp)

  // 4) Kør ELO på sæt FØR måneden -> bygg seed-tilstand ved at SUMME diffs
  const { eloChanges: eloChangesFør } = beregnEloForKampe(førKampe, initialEloMap)

  const seedVedMånedsStart: EloMap = { ...initialEloMap }
  Object.values(eloChangesFør || {}).forEach((changePrKamp: any) => {
    Object.entries(changePrKamp || {}).forEach(([navn, elo]: [string, any]) => {
      const diff = typeof elo?.diff === 'number' ? elo.diff : 0
      seedVedMånedsStart[navn] = (seedVedMånedsStart[navn] ?? 0) + diff
    })
  })

  // 5) Kør ELO på KUN månedens sæt med seed = tilstand ved månedens start
  const { eloChanges: eloChangesIMåned } = beregnEloForKampe(månedKampe, seedVedMånedsStart)

  // 6) NETTO for måneden = sum(diff) pr. spiller over månedens sæt
  const pluspointMap: Record<string, number> = {}
  Object.values(eloChangesIMåned || {}).forEach((eloChangePrKamp: any) => {
    Object.entries(eloChangePrKamp || {}).forEach(([navn, elo]: [string, any]) => {
      const diff = typeof elo?.diff === 'number' ? elo.diff : 0
      pluspointMap[navn] = (pluspointMap[navn] ?? 0) + diff
    })
  })

  // 7) Til array + sortér faldende
  const månedensSpillere: MånedensSpiller[] = Object.entries(pluspointMap)
    .map(([visningsnavn, pluspoint]) => ({
      visningsnavn,
      // 1 decimal for konsistens – ret hvis du vil
      pluspoint: Math.round(pluspoint * 10) / 10,
    }))
    .sort((a, b) => b.pluspoint - a.pluspoint)

  return månedensSpillere
}

// (valgfrit) Alias, hvis du vil kalde den med semantisk navn andre steder:
export { beregnEloÆndringerForIndeværendeMåned as beregnEloÆndringerForMåned }

