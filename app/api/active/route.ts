// app/api/active/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

type ResultRow = {
  holdA1: string | null
  holdA2: string | null
  holdB1: string | null
  holdB2: string | null
}

export async function GET() {
  try {
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1

    const startDato = `${year}-${String(month).padStart(2, '0')}-01`
    const nextMonth = month === 12 ? 1 : month + 1
    const nextYear = month === 12 ? year + 1 : year
    const slutDato = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`

    const { data, error } = await (supabase.from('newresults') as any)
      .select('holdA1, holdA2, holdB1, holdB2')
      .gte('date', startDato)
      .lt('date', slutDato)
      .eq('finish', true)

    if (error) {
      console.error('Fejl ved hentning af kampe:', error)
      return NextResponse.json([], { status: 500 })
    }

    const kampe = (data ?? []) as ResultRow[]

    const tæller = new Map<string, number>()
    for (const k of kampe) {
      for (const spiller of [k.holdA1, k.holdA2, k.holdB1, k.holdB2]) {
        if (spiller && spiller.trim()) {
          tæller.set(spiller, (tæller.get(spiller) ?? 0) + 1)
        }
      }
    }

    const top20 = Array.from(tæller.entries())
      .map(([visningsnavn, sæt]) => ({ visningsnavn, sæt }))
      .sort((a, b) => (b.sæt - a.sæt) || a.visningsnavn.localeCompare(b.visningsnavn, 'da-DK'))
      .slice(0, 20)

    return NextResponse.json(top20, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    console.error(e)
    return NextResponse.json([], { status: 500 })
  }
}

