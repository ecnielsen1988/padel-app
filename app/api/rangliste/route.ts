// app/api/rangliste/route.ts
import { NextResponse } from 'next/server'
import { beregnNyRangliste } from '@/lib/beregnNyRangliste'

export async function GET() {
  try {
    const data = await beregnNyRangliste()
    return NextResponse.json(data)
  } catch (error) {
    console.error('Fejl i /api/rangliste:', error)
    return NextResponse.json([], { status: 500 })
  }
}

