// middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

export async function middleware(req: NextRequest) {
  // Lav et svar-objekt vi kan skrive cookies på
  const res = NextResponse.next({
    request: { headers: req.headers },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value
        },
        set(name: string, value: string, options?: Parameters<typeof res.cookies.set>[0] extends object ? Partial<Parameters<typeof res.cookies.set>[0]> : any) {
          // Brug objekt-syntaks for kompatibilitet med Next 15
          res.cookies.set({
            name,
            value,
            ...(options ?? {}),
          })
        },
        remove(name: string, options?: Parameters<typeof res.cookies.set>[0] extends object ? Partial<Parameters<typeof res.cookies.set>[0]> : any) {
          // "Slet" cookie ved at sætte tom værdi + maxAge: 0
          res.cookies.set({
            name,
            value: '',
            ...(options ?? {}),
            maxAge: 0,
          })
        },
      },
    }
  )

  // Tving Supabase til at læse/forny session og opdatere cookies hvis nødvendigt
  await supabase.auth.getSession()

  return res
}

// Kør på “normale” ruter; spring statiske assets over
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
