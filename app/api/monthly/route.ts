// app/api/monthly/route.ts
import { NextResponse } from 'next/server'
import { beregnEloÆndringerForIndeværendeMåned } from '@/lib/beregnEloChange'

export async function GET() {
  const data = await beregnEloÆndringerForIndeværendeMåned()
  return NextResponse.json(data)
}
