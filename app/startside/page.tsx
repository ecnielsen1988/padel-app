'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import Link from 'next/link'

type Bruger = {
  visningsnavn: string
  rolle: string
  torsdagspadel: boolean
}

export default function StartSide() {
  const [bruger, setBruger] = useState<Bruger | null>(null)
  const [loading, setLoading] = useState(true)
  const [ulæsteAntal, setUlæsteAntal] = useState<number>(0)

  useEffect(() => {
    const hentBruger = async () => {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      const user = session?.user

      if (sessionError) {
        console.error('Fejl ved hentning af session:', sessionError)
      }

      if (user) {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('visningsnavn, rolle, torsdagspadel')
          .eq('id', user.id)
          .single()

        if (error) {
          console.error('Fejl ved hentning af profil:', error)
        } else {
          if (!profile.rolle) {
            console.warn('Brugerprofil mangler rolle')
            profile.rolle = 'ukendt'
          }

          setBruger(profile)

          // Hvis admin: hent antal ulæste beskeder
          if (profile.rolle === 'admin') {
            const { count, error: beskedFejl } = await supabase
              .from('admin_messages')
              .select('', { count: 'exact', head: true })
              .eq('læst', false)

            if (!beskedFejl && typeof count === 'number') {
              setUlæsteAntal(count)
            }
          }
        }
      } else {
        setBruger(null)
      }

      setLoading(false)
    }

    hentBruger()
  }, [])

  const logUd = async () => {
    await supabase.auth.signOut()
    setBruger(null)
  }

  if (loading) {
    return (
      <div className="p-8 max-w-xl mx-auto text-center">
        <p className="text-lg">⏳ Indlæser...</p>
      </div>
    )
  }

  if (!bruger) {
    return (
      <div className="p-8 max-w-xl mx-auto text-center">
        <h1 className="text-2xl font-bold mb-4">Du er ikke logget ind</h1>
        <p className="mb-6">Log ind for at få adgang til padelsystemet.</p>
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
    <div className="p-8 max-w-xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">
            Velkommen, {bruger.visningsnavn} 👋
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Din rolle:{' '}
            <span
              className={
                bruger.rolle === 'admin'
                  ? 'text-yellow-400 font-bold'
                  : bruger.rolle === 'bruger'
                  ? 'text-green-400 font-bold'
                  : 'text-red-400 font-bold'
              }
            >
              {bruger.rolle}
            </span>
          </p>
        </div>
        <button
          onClick={logUd}
          className="bg-gray-800 hover:bg-gray-900 text-white font-semibold py-2 px-4 rounded-xl shadow"
        >
          Log ud
        </button>
      </div>

      <div className="grid gap-4">
        {(bruger.rolle === 'bruger' || bruger.rolle === 'admin') && (
          <>
            <Link
              href="/newscore"
              className="bg-pink-600 hover:bg-pink-700 text-white font-semibold py-3 px-5 rounded-xl text-center shadow"
            >
              ➕ Indtast Resultater
            </Link>

            {/* NYT: Mine resultater */}
            <Link
              href="/mine"  // ← ret evt. til din faktiske route for “Mine Seneste Kampe”
              className="bg-pink-600 hover:bg-pink-700 text-white font-semibold py-3 px-5 rounded-xl text-center shadow"
            >
              🧾 Mine resultater
            </Link>

            <Link
              href="/lastgames"
              className="bg-pink-600 hover:bg-pink-700 text-white font-semibold py-3 px-5 rounded-xl text-center shadow"
            >
              🕓 Seneste Kampe
            </Link>

            <Link
              href="/nyrangliste"
              className="bg-pink-600 hover:bg-pink-700 text-white font-semibold py-3 px-5 rounded-xl text-center shadow"
            >
              📊 Ranglisten
            </Link>

            <Link
              href="/monthly"
              className="bg-pink-600 hover:bg-pink-700 text-white font-semibold py-3 px-5 rounded-xl text-center shadow"
            >
              🌟 Månedens Spiller
            </Link>

            <Link
              href="/active"
              className="bg-pink-600 hover:bg-pink-700 text-white font-semibold py-3 px-5 rounded-xl text-center shadow"
            >
              🏃‍♂️ Mest aktive
            </Link>

            {/* NYT: Kommende kampe */}
            <Link
              href="/kommende" // ← matcher siden vi lavede tidligere
              className="bg-pink-600 hover:bg-pink-700 text-white font-semibold py-3 px-5 rounded-xl text-center shadow"
            >
              📅 Kommende kampe
            </Link>

            {/* Grøn knap kun for torsdagspadel-brugere */}
            {bruger.torsdagspadel && (
              <Link
                href="/torsdagspadel"
                className="bg-green-700 hover:bg-green-800 text-white font-semibold py-3 px-5 rounded-xl text-center shadow"
              >
                🏋️‍♂️ Torsdagspadel 🏋️‍♂️
              </Link>
            )}
          </>
        )}

        {bruger.rolle === 'admin' && (
          <>
            <Link
              href="/admin"
              className="bg-gray-800 hover:bg-gray-900 text-white font-semibold py-3 px-5 rounded-xl text-center shadow"
            >
              🛠 Adminpanel
            </Link>

            <Link
              href="/admin/beskeder"
              className="bg-yellow-500 hover:bg-yellow-600 text-black font-semibold py-3 px-5 rounded-xl text-center shadow flex justify-between items-center"
            >
              🔔 Beskeder
              {ulæsteAntal > 0 && (
                <span className="ml-2 bg-red-600 text-white text-xs font-bold px-2 py-1 rounded-full">
                  {ulæsteAntal}
                </span>
              )}
            </Link>
          </>
        )}
      </div>
    </div>
  )
}
