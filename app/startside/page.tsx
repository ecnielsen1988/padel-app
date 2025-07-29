'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import Link from 'next/link'

type Bruger = {
  visningsnavn: string
  rolle: string
}

export default function StartSide() {
  const [bruger, setBruger] = useState<Bruger | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const hentBruger = async () => {
      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('visningsnavn, rolle')
          .eq('id', user.id)
          .single()

        if (error) {
          console.error('Fejl ved hentning af profil:', error)
        } else {
          setBruger(profile)
        }
      }

      setLoading(false)
    }

    hentBruger()
  }, [])

  if (loading) return <p>Indlæser...</p>

  if (!bruger) return <p>Du skal være logget ind for at se denne side.</p>

  return (
    <div className="p-8 max-w-xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Velkommen, {bruger.visningsnavn} 👋</h1>

      <div className="grid gap-4">
        {(bruger.rolle === 'bruger' || bruger.rolle === 'admin') && (
          <>
            <Link href="/newscore" className="bg-pink-600 hover:bg-pink-700 text-white font-semibold py-3 px-5 rounded-xl text-center shadow">
              ➕ Indtast Resultater
            </Link>
            <Link href="/lastgames" className="bg-pink-600 hover:bg-pink-700 text-white font-semibold py-3 px-5 rounded-xl text-center shadow">
              🕓 Seneste Kampe
            </Link>
            <Link href="/nyrangliste" className="bg-pink-600 hover:bg-pink-700 text-white font-semibold py-3 px-5 rounded-xl text-center shadow">
              📊 Ranglisten
            </Link>
          </>
        )}

        {bruger.rolle === 'admin' && (
          <Link href="/admin" className="bg-gray-800 hover:bg-gray-900 text-white font-semibold py-3 px-5 rounded-xl text-center shadow">
            🛠 Adminpanel
          </Link>
        )}
      </div>
    </div>
  )
}
