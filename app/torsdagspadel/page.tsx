'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function TorsdagStartside() {
  const [bruger, setBruger] = useState<{ visningsnavn: string; torsdagspadel: boolean } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const hentBruger = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data, error } = await supabase
          .from('profiles')
          .select('visningsnavn, torsdagspadel')
          .eq('id', user.id)
          .single()

        if (!error && data?.torsdagspadel) {
          setBruger(data)
        }
      }
      setLoading(false)
    }

    hentBruger()
  }, [])

  if (loading) return <p className="text-center mt-10 text-gray-700 dark:text-white">Indlæser...</p>
  if (!bruger) return <p className="text-center mt-10 text-gray-700 dark:text-white">Du har ikke adgang til denne side.</p>

  return (
    <main className="max-w-xl mx-auto p-8 text-gray-900 dark:text-white">
      <h1 className="text-3xl font-bold mb-6 text-center">
        💪 Torsdagspadel – velkommen, {bruger.visningsnavn}!
      </h1>

      <div className="grid gap-4">
        <Link
          href="/torsdagspadel/rangliste"
          className="bg-green-700 hover:bg-green-800 text-white font-semibold py-3 px-5 rounded-xl text-center shadow"
        >
          📊 Torsdagsranglisten
        </Link>
        <Link
          href="/torsdagspadel/monthly"
          className="bg-green-700 hover:bg-green-800 text-white font-semibold py-3 px-5 rounded-xl text-center shadow"
        >
          🌟 Månedens Torsdagsspiller
        </Link>
        <Link
          href="/torsdagspadel/events"
          className="bg-green-700 hover:bg-green-800 text-white font-semibold py-3 px-5 rounded-xl text-center shadow"
        >
          📅 Kommende Events
        </Link>
      </div>
    </main>
  )
}
