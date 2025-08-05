// app/api/active/route.ts
import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'

export const dynamic = 'force-dynamic'

export async function GET() {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1

  const startDato = `${year}-${month.toString().padStart(2, '0')}-01`
  const slutMonth = month === 12 ? 1 : month + 1
  const slutYear = month === 12 ? year + 1 : year
  const slutDato = `${slutYear}-${slutMonth.toString().padStart(2, '0')}-01`

  const { data: kampeData, error } = await supabase
    .from('newresults')
    .select('holdA1, holdA2, holdB1, holdB2')
    .gte('date', startDato)
    .lt('date', slutDato)
    .eq('finish', true)

  if (error) {
    console.error('Fejl ved hentning af kampe:', error)
    return NextResponse.json([], { status: 500 })
  }

  const tæller: Record<string, number> = {}

  kampeData.forEach((kamp) => {
    ;[kamp.holdA1, kamp.holdA2, kamp.holdB1, kamp.holdB2].forEach((spiller) => {
      if (spiller) {
        tæller[spiller] = (tæller[spiller] ?? 0) + 1
      }
    })
  })

  const top20 = Object.entries(tæller)
    .map(([visningsnavn, sæt]) => ({ visningsnavn, sæt }))
    .sort((a, b) => b.sæt - a.sæt)
    .slice(0, 20)

  return NextResponse.json(top20)
}

