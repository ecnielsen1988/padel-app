import { supabase } from './supabaseClient'
import dayjs from 'dayjs'

export async function beregnMestAktiveSpillere() {
  const startOfMonth = dayjs().startOf('month').toISOString()

  const { data, error } = await supabase
    .from('results')
    .select('spiller1, spiller2, spiller3, spiller4')
    .gte('oprettet', startOfMonth)

  if (error) throw error

  const spillerTælling: Record<string, { navn: string; antalSæt: number }> = {}

  for (const sæt of data) {
    const spillere = [sæt.spiller1, sæt.spiller2, sæt.spiller3, sæt.spiller4]

    for (const spiller of spillere) {
      if (!spiller) continue
      if (!spillerTælling[spiller]) {
        const { data: profil } = await supabase
          .from('profiles')
          .select('visningsnavn')
          .eq('id', spiller)
          .single()

        spillerTælling[spiller] = {
          navn: profil?.visningsnavn ?? 'Ukendt',
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
