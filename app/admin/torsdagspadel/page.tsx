'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

/**
 * Admin / Torsdagspadel · Forside
 * Viser tre knapper:
 *  - Regnskab      -> /admin/torsdagspadel/regnskab
 *  - Tilmelding    -> /admin/torsdagspadel/tilmelding
 *  - Fællesbesked  -> /admin/torsdagspadel/besked
 */
export default function AdminTorsdagsPage() {
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    const run = async () => {
      try {
        const { data: auth } = await supabase.auth.getUser()
        const user = auth?.user
        if (!user) { setLoading(false); return }

        // Admin-check: JWT app_metadata.rolle eller profiles.rolle
        const jwtRole = (user as any)?.app_metadata?.rolle
        let admin = jwtRole === 'admin'

        if (!admin) {
          const { data: me } = await (supabase.from('profiles') as any)
            .select('id, rolle')
            .eq('id', user.id)
            .maybeSingle()

          if ((me as any)?.rolle === 'admin') admin = true
        }

        setIsAdmin(admin)
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [])

  if (loading) {
    return (
      <main className="max-w-2xl mx-auto p-8 text-gray-900 dark:text-white">
        <h1 className="text-3xl font-bold mb-6">Admin · Torsdagspadel</h1>
        <p>Indlæser…</p>
      </main>
    )
  }

  if (!isAdmin) {
    return (
      <main className="max-w-2xl mx-auto p-8 text-gray-900 dark:text-white">
        <h1 className="text-3xl font-bold mb-6">Admin · Torsdagspadel</h1>
        <p>Du har ikke adgang til denne side.</p>
        <div className="mt-4">
          <Link
            href="/admin"
            className="inline-block bg-green-700 hover:bg-green-800 text-white font-semibold py-2 px-4 rounded-lg"
          >
            ⬅ Tilbage til Admin
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="max-w-2xl mx-auto p-8 text-gray-900 dark:text-white">
      <h1 className="text-3xl font-bold mb-8 text-center">🟢 Admin · Torsdagspadel</h1>

      <div className="grid gap-4">
        <Link
          href="/admin/torsdagspadel/regnskab"
          className="bg-emerald-700 hover:bg-emerald-800 text-white font-semibold py-3 px-5 rounded-xl text-center shadow"
        >
          📊 Regnskab
        </Link>

        <Link
          href="/admin/torsdagspadel/tilmelding"
          className="bg-blue-700 hover:bg-blue-800 text-white font-semibold py-3 px-5 rounded-xl text-center shadow"
        >
          ✅ Tilmelding
        </Link>

        <Link
          href="/admin/torsdagspadel/besked"
          className="bg-pink-600 hover:bg-pink-700 text-white font-semibold py-3 px-5 rounded-xl text-center shadow"
        >
          📨 Fællesbesked
        </Link>
      </div>
    </main>
  )
}

