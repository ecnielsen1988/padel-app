// middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createMiddlewareClient({ req, res })
  // forny/vedligehold session-cookies på hver request
  await supabase.auth.getSession()
  return res
}

// kør kun hvor det giver mening (mindre overhead)
export const config = {
  matcher: ['/login', '/admin/:path*', '/auth/callback'],
}

