'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'

export default function ResultaterPage() {
  const [loading, setLoading] = useState(true)
  const [loggedIn, setLoggedIn] = useState(false)
  const [visningsnavn, setVisningsnavn] = useState<string>('')

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user
      if (!user) {
        if (mounted) { setLoggedIn(false); setLoading(false) }
        return
      }

      // TS-safe: cast builder til any og drop generics på maybeSingle()
      const { data: p } = await (supabase
        .from('profiles') as any)
        .select('visningsnavn')
        .eq('id', user.id)
        .maybeSingle()

      if (mounted) {
        setLoggedIn(true)
        const navn = typeof p?.visningsnavn === 'string' && p.visningsnavn
          ? p.visningsnavn
          : (user.email || 'Spiller')
        setVisningsnavn(navn)
        setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [])

  if (loading) {
    return (
      <div className="p-8 max-w-xl mx-auto text-center">
        <p className="text-lg">⏳ Indlæser...</p>
      </div>
    )
  }

  if (!loggedIn) {
    return (
      <div className="p-8 max-w-xl mx-auto text-center">
        <h1 className="text-2xl font-bold mb-4">Du er ikke logget ind</h1>
        <p className="mb-6">Log ind for at se dine og andres resultater.</p>
        <Link
          href="/login"
          className="inline-block bg-pink-600 hover:bg-pink-700 text-white font-semibold py-3 px-6 rounded-xl shadow"
        >
          Log ind
        </Link>
      </div>
    )
  }

  return (
    <main className="p-8 max-w-xl mx-auto">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">📄 Resultater</h1>
        <span className="text-sm text-gray-500">Hej, {visningsnavn}</span>
      </header>

      <div className="grid gap-4">
        <Link
          href="/mine"
          className="bg-pink-600 hover:bg-pink-700 text-white font-semibold py-3 px-5 rounded-xl text-center shadow"
        >
          🧾 Mine resultater
        </Link>

        <Link
          href="/lastgames"
          className="bg-pink-600 hover:bg-pink-700 text-white font-semibold py-3 px-5 rounded-xl text-center shadow"
        >
          🕓 Seneste resultater
        </Link>

        <Link
          href="/startside"
          className="bg-gray-800 hover:bg-gray-900 text-white font-semibold py-3 px-5 rounded-xl text-center shadow"
        >
          ⬅ Til startside
        </Link>
      </div>
    </main>
  )
}
