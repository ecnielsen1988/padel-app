import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // brug service key, fordi du vil opdatere data
)

type Resultat = {
  id: number
  dato: string
  spiller1A: string
  spiller1B: string
  spiller2A: string
  spiller2B: string
}

function sammeSpillere(a: Resultat, b: Resultat): boolean {
  const spillereA = [a.spiller1A, a.spiller1B, a.spiller2A, a.spiller2B].sort().join(',')
  const spillereB = [b.spiller1A, b.spiller1B, b.spiller2A, b.spiller2B].sort().join(',')
  return spillereA === spillereB
}

async function tildelKampIdTilEksisterendeSaet() {
  const { data: saet, error } = await supabase
    .from('results')
    .select('id, dato, spiller1A, spiller1B, spiller2A, spiller2B')
    .order('dato', { ascending: true })
    .order('id', { ascending: true })

  if (error || !saet) {
    console.error('Fejl ved hentning af sæt:', error)
    return
  }

  let kampid = 1
  const updates: { id: number; kampid: number }[] = []

  for (let i = 0; i < saet.length; i++) {
    if (i > 0 && sammeSpillere(saet[i], saet[i - 1])) {
      // samme kampid
    } else {
      kampid++
    }

    updates.push({ id: saet[i].id, kampid })
  }

  console.log(`Opdaterer ${updates.length} rækker i batches...`)
  const batchSize = 500
  for (let i = 0; i < updates.length; i += batchSize) {
    const batch = updates.slice(i, i + batchSize)
    const { error: updateError } = await supabase
      .from('results')
      .upsert(batch, { onConflict: 'id' })
    if (updateError) {
      console.error('Fejl ved opdatering:', updateError)
    } else {
      console.log(`✅ Opdaterede batch ${i / batchSize + 1}`)
    }
  }

  console.log('🎉 Færdig med kampid-opdatering!')
}

tildelKampIdTilEksisterendeSaet()
