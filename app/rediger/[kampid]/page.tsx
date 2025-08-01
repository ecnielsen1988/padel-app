'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

interface Sæt {
  id: number
  scoreA: number
  scoreB: number
  holdA1: string
  holdA2: string
  holdB1: string
  holdB2: string
}

export default function RedigerKampSide() {
  const { kampid } = useParams()
  const [sæt, setSæt] = useState<Sæt[]>([])
  const [loading, setLoading] = useState(true)
  const [besked, setBesked] = useState('')

  useEffect(() => {
    const hentKamp = async () => {
      const { data, error } = await supabase
        .from('newresults')
        .select('*')
        .eq('kampid', kampid)
        .order('id')

      if (error) {
        console.error('Fejl ved hentning:', error)
      } else {
        setSæt(data as Sæt[])
      }

      setLoading(false)
    }

    hentKamp()
  }, [kampid])

  const opdaterSæt = (index: number, felt: 'scoreA' | 'scoreB', værdi: number) => {
    const opdateret = [...sæt]
    opdateret[index][felt] = værdi
    setSæt(opdateret)
  }

  const gemÆndringer = async () => {
    const updates = sæt.map((s) => ({
      id: s.id,
      scoreA: s.scoreA,
      scoreB: s.scoreB,
    }))

    const { error } = await supabase
      .from('newresults')
      .upsert(updates, { onConflict: 'id' })

    if (error) {
      setBesked('❌ Fejl ved opdatering: ' + error.message)
    } else {
      setBesked('✅ Ændringer gemt!')
    }
  }

  if (loading) return <p>Indlæser kamp #{kampid}...</p>

  return (
    <div className="p-4 max-w-xl mx-auto text-white">
      <h1 className="text-xl font-bold mb-4">✏️ Rediger kamp #{kampid}</h1>

      {sæt.length === 0 ? (
        <p>Ingen sæt fundet.</p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            gemÆndringer()
          }}
        >
          <ul className="space-y-6">
            {sæt.map((s, index) => (
              <li key={s.id} className="border p-4 rounded bg-gray-800">
                <div className="mb-2">
                  <strong>Sæt {index + 1}</strong>: {s.holdA1} & {s.holdA2} vs. {s.holdB1} & {s.holdB2}
                </div>
                <div className="flex items-center space-x-3">
                  <label className="flex items-center space-x-1">
                    <span>Score A:</span>
                    <input
                      type="number"
                      value={s.scoreA}
                      onChange={(e) => opdaterSæt(index, 'scoreA', Number(e.target.value))}
                      className="w-16 px-2 py-1 rounded bg-white text-black"
                    />
                  </label>
                  <label className="flex items-center space-x-1">
                    <span>Score B:</span>
                    <input
                      type="number"
                      value={s.scoreB}
                      onChange={(e) => opdaterSæt(index, 'scoreB', Number(e.target.value))}
                      className="w-16 px-2 py-1 rounded bg-white text-black"
                    />
                  </label>
                </div>
              </li>
            ))}
          </ul>

          <button
            type="submit"
            className="mt-6 bg-pink-600 hover:bg-pink-700 text-white font-semibold py-2 px-4 rounded-xl shadow"
          >
            💾 Gem ændringer
          </button>

          {besked && (
            <p className="mt-4 font-semibold text-sm">{besked}</p>
          )}
        </form>
      )}
    </div>
  )
}
