import { supabase } from './supabaseClient'
import { beregnEloForKampe, Kamp, EloMap } from './beregnElo'

interface MånedensSpiller {
  visningsnavn: string
  pluspoint: number
}

export async function beregnEloÆndringerForIndeværendeMåned(): Promise<MånedensSpiller[]> {
  const nu = new Date()
  const år = nu.getFullYear()
  const måned = nu.getMonth() + 1 // getMonth() er 0-baseret

  // Formatér til yyyy-mm-dd (med leading zero)
  const startDato = `${år}-${måned.toString().padStart(2, '0')}-01`
  // Start af næste måned
  const næsteMåned = måned === 12 ? 1 : måned + 1
  const næsteÅr = måned === 12 ? år + 1 : år
  const slutDato = `${næsteÅr}-${næsteMåned.toString().padStart(2, '0')}-01`

  // 1) Hent alle kampe/sæt i den dynamiske måned
  const { data: kampeData, error } = await supabase
    .from('newresults')
    .select('*')
    .gte('date', startDato)
    .lt('date', slutDato)
    .order('date', { ascending: true })
    .order('id', { ascending: true })

  if (error) {
    console.error('Fejl ved hentning af resultater:', error)
    return []
  }
  if (!kampeData || kampeData.length === 0) return []

  // 2) Hent spillere med startElo
  const { data: spillereData } = await supabase.from('profiles').select('visningsnavn, startElo')
  if (!spillereData) return []

  // 3) Lav initial EloMap
  const initialEloMap: EloMap = {}
  spillereData.forEach(s => {
    if (s.visningsnavn && typeof s.visningsnavn === 'string') {
      initialEloMap[s.visningsnavn.trim()] = s.startElo ?? 1500
    }
  })

  // 4) Map kampeData til det format beregnEloForKampe forventer
  const kampeTilBeregning: Kamp[] = kampeData.map((kamp: any) => ({
    ...kamp,
    spiller1A: kamp.holdA1,
    spiller1B: kamp.holdA2,
    spiller2A: kamp.holdB1,
    spiller2B: kamp.holdB2,
  }))

  // 5) Beregn Elo og få EloChanges pr. kamp
  const { eloChanges } = beregnEloForKampe(kampeTilBeregning, initialEloMap)

  // 6) Saml pluspoint pr. spiller for måneden
  const pluspointMap: Record<string, number> = {}

  Object.values(eloChanges).forEach(eloChangePrKamp => {
    Object.entries(eloChangePrKamp).forEach(([navn, elo]) => {
      pluspointMap[navn] = (pluspointMap[navn] ?? 0) + elo.diff
    })
  })

  // 7) Konverter til array og sorter efter pluspoint
  const månedensSpillere: MånedensSpiller[] = Object.entries(pluspointMap)
    .map(([visningsnavn, pluspoint]) => ({ visningsnavn, pluspoint }))
    .sort((a, b) => b.pluspoint - a.pluspoint)

  return månedensSpillere
}
