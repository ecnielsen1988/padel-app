'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'


type Profile = { id: string; visningsnavn: string; torsdagspadel: boolean; rolle?: string }
type EntryRow = { visningsnavn: string; amount_ore: number | null }
type SaldoRow = { visningsnavn: string; dkk: number }

function oreToDKK(ore: any): number {
  const n = Number(ore ?? 0)
  return Number.isFinite(n) ? n / 100 : 0
}

export default function AdminRegnskabPage() {
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [saldi, setSaldi] = useState<SaldoRow[]>([])

  useEffect(() => {
    const run = async () => {
      try {
        // 1) Auth
        const { data: auth } = await supabase.auth.getUser()
        const user = auth?.user
        if (!user) { setLoading(false); return }

        // 2) Admin-check (JWT app_metadata.rolle eller profiles.rolle)
        const jwtRole = (user.app_metadata as any)?.rolle
        let admin = jwtRole === 'admin'
        const { data: me } = await supabase
          .from('profiles')
          .select('id, rolle')
          .eq('id', user.id)
          .single()
        if (!admin && me?.rolle === 'admin') admin = true
        setIsAdmin(admin)
        if (!admin) { setLoading(false); return }

        // 3) Hent ALLE torsdagsspillere (navne)
        const { data: players, error: playersErr } = await supabase
          .from('profiles')
          .select('visningsnavn')
          .eq('torsdagspadel', true)
        if (playersErr) { console.error('Fejl ved hentning af spillere:', playersErr); setLoading(false); return }

        const names = (players ?? [])
          .map(p => p.visningsnavn)
          .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)

        if (names.length === 0) { setSaldi([]); setLoading(false); return }

        // 4) Hent alle bar_entries for disse navne (kun de 2 kolonner vi skal bruge)
        const { data: entries, error: entErr } = await supabase
          .from('bar_entries')
          .select('visningsnavn, amount_ore')
          .in('visningsnavn', names)
        if (entErr) { console.error('Fejl ved hentning af bar_entries:', entErr); setLoading(false); return }

        // 5) Summér i klienten pr. navn
        const sumMap = new Map<string, number>()
        // init 0 for alle
        names.forEach(n => sumMap.set(n, 0))
        ;(entries as EntryRow[] ?? []).forEach(r => {
          const prev = sumMap.get(r.visningsnavn) ?? 0
          sumMap.set(r.visningsnavn, prev + (Number(r.amount_ore ?? 0)))
        })

        // 6) Byg rækker + sorter efter navn (A–Å)
        const rows: SaldoRow[] = names.map(n => ({
          visningsnavn: n,
          dkk: oreToDKK(sumMap.get(n) ?? 0),
        }))
        rows.sort((a, b) => a.visningsnavn.localeCompare(b.visningsnavn, 'da-DK'))

        setSaldi(rows)
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [])

  if (loading) {
    return (
      <main className="max-w-2xl mx-auto p-8 text-gray-900 dark:text-white">
        <h1 className="text-3xl font-bold mb-6">Admin · Regnskab</h1>
        <p>Indlæser...</p>
      </main>
    )
  }

  if (!isAdmin) {
    return (
      <main className="max-w-2xl mx-auto p-8 text-gray-900 dark:text-white">
        <h1 className="text-3xl font-bold mb-6">Admin · Regnskab</h1>
        <p>Du har ikke adgang til denne side.</p>
        <div className="mt-4">
          <Link href="/torsdagspadel" className="inline-block bg-green-700 hover:bg-green-800 text-white font-semibold py-2 px-4 rounded-lg">
            ⬅ Tilbage til Torsdagspadel
          </Link>
        </div>
      </main>
    )
  }

  const totalAll = saldi.reduce((acc, r) => acc + r.dkk, 0)

  return (
    <main className="max-w-2xl mx-auto p-8 text-gray-900 dark:text-white">
      <h1 className="text-3xl font-bold mb-6">Admin · Regnskab</h1>

      {/* Samlet status for alle */}
      <div className="mb-6 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm opacity-70">Samlet status (alle torsdagsspillere)</div>
          <div className={`text-lg font-semibold ${totalAll > 0 ? 'text-green-700' : totalAll < 0 ? 'text-red-600' : 'text-zinc-700 dark:text-zinc-300'}`}>
            {totalAll > 0 ? 'Til gode' : totalAll < 0 ? 'Skyld' : 'Alt i nul'}:{' '}
            {totalAll.toLocaleString('da-DK', { style: 'currency', currency: 'DKK' })}
          </div>
        </div>
      </div>

      {/* Liste efter navn */}
      {saldi.length === 0 ? (
        <div className="text-sm text-gray-700 dark:text-gray-300">Ingen torsdagsspillere fundet.</div>
      ) : (
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-700 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
          {saldi.map((row) => (
            <li key={row.visningsnavn} className="p-3 flex items-center justify-between gap-4">
  <div className="font-medium truncate">
    <Link
      href={`/torsdagspadel/regnskab?user=${encodeURIComponent(row.visningsnavn)}`}
      className="underline hover:no-underline"
      title="Se detaljer"
    >
      {row.visningsnavn}
    </Link>
  </div>
  <div className={`shrink-0 font-semibold ${row.dkk < 0 ? 'text-red-600' : row.dkk > 0 ? 'text-green-700' : ''}`}>
    {row.dkk.toLocaleString('da-DK', { style: 'currency', currency: 'DKK' })}
  </div>
</li>

          ))}
        </ul>
      )}

      <div className="mt-6 flex gap-3">
        <Link href="/torsdagspadel" className="inline-block bg-green-700 hover:bg-green-800 text-white font-semibold py-2 px-4 rounded-lg">
          ⬅ Tilbage til Torsdagspadel
        </Link>
        <Link href="/admin" className="inline-block bg-zinc-800 hover:bg-zinc-900 text-white font-semibold py-2 px-4 rounded-lg">
          ⛳ Admin
        </Link>
      </div>
    </main>
  )
}

