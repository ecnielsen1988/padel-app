'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type EntryRow = { visningsnavn: string | null; amount_ore: number | null }
type SaldoRow = { visningsnavn: string; ore: number } // gem i ØRE hele vejen

const fmtDKK = (ore: number) =>
  (ore / 100).toLocaleString('da-DK', { style: 'currency', currency: 'DKK' })

export default function AdminRegnskabPage() {
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [rows, setRows] = useState<SaldoRow[]>([])

  useEffect(() => {
    const run = async () => {
      try {
        // --- Auth + admin ---
        const { data: auth } = await supabase.auth.getUser()
        const user = auth?.user
        if (!user) { setLoading(false); return }

        let admin = (user as any)?.app_metadata?.rolle === 'admin'
        if (!admin) {
          const { data: me } = await (supabase.from('profiles') as any)
            .select('rolle')
            .eq('id', user.id)
            .maybeSingle()
          admin = (me as any)?.rolle === 'admin'
        }
        setIsAdmin(admin)
        if (!admin) { setLoading(false); return }

        // --- Hent torsdags-spillere (navne) ---
        const { data: players, error: playersErr } = await (supabase.from('profiles') as any)
          .select('visningsnavn')
          .eq('torsdagspadel', true)

        if (playersErr) { console.error(playersErr); setRows([]); setLoading(false); return }

        const namesArr: string[] = ((players ?? []) as Array<{ visningsnavn: string | null }>)
          .map(p => (p.visningsnavn ?? '').trim())
          .filter(Boolean)

        // dedup navne (hvis der er dubletter i profiles)
        const names = Array.from(new Set(namesArr))

        if (names.length === 0) { setRows([]); setLoading(false); return }

        // --- Hent bar-entries for KUN disse navne (ALLE sider) ---
        const PAGE = 1000
        let from = 0
        let all: EntryRow[] = []

        for (;;) {
          const to = from + PAGE - 1
          const { data: page, error } = await (supabase.from('bar_entries') as any)
            .select('visningsnavn, amount_ore')
            .in('visningsnavn', names)
            .range(from, to)

          if (error) {
            console.error('Fejl ved hentning af bar_entries:', error)
            break
          }

          all.push(...(((page ?? []) as EntryRow[])))

          if (!page || page.length < PAGE) break // sidste side
          from += PAGE
        }

        // --- Summér i JS (helt simpelt) ---
        const sumMap = new Map<string, number>()
        // Sørg for at alle navne findes i mappet (også dem uden rækker)
        for (const n of names) sumMap.set(n, 0)

        for (const r of all) {
          const n = (r.visningsnavn ?? '').trim()
          if (!n) continue
          if (!sumMap.has(n)) continue // skulle ikke ske, men safe
          const ore = Number(r.amount_ore ?? 0)
          if (!Number.isFinite(ore)) continue
          sumMap.set(n, (sumMap.get(n) ?? 0) + ore)
        }

        // --- Byg rækker + sorter A-Å ---
        const list: SaldoRow[] = names
          .map(n => ({ visningsnavn: n, ore: sumMap.get(n) ?? 0 }))
          .sort((a, b) => a.visningsnavn.localeCompare(b.visningsnavn, 'da'))

        setRows(list)
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [])

  if (loading) {
    return (
      <main className="max-w-2xl mx-auto p-8">
        <h1 className="text-3xl font-bold mb-6">Admin · Regnskab</h1>
        <p>Indlæser…</p>
      </main>
    )
  }

  if (!isAdmin) {
    return (
      <main className="max-w-2xl mx-auto p-8">
        <h1 className="text-3xl font-bold mb-6">Admin · Regnskab</h1>
        <p>Du har ikke adgang til denne side.</p>
        <div className="mt-4">
          <Link href="/admin/torsdagspadel" className="inline-block bg-green-700 hover:bg-green-800 text-white font-semibold py-2 px-4 rounded-lg">
            ⬅ Tilbage til Torsdagspadel
          </Link>
        </div>
      </main>
    )
  }

  const totalAllOre = rows.reduce((acc, r) => acc + r.ore, 0)

  return (
    <main className="max-w-2xl mx-auto p-8">
      <h1 className="text-3xl font-bold mb-6">Admin · Regnskab</h1>

      {/* Samlet sum */}
      <div className="mb-6 rounded-xl border p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm opacity-70">Samlet status (torsdagsspillere)</div>
          <div className={`text-lg font-semibold ${totalAllOre > 0 ? 'text-green-700' : totalAllOre < 0 ? 'text-red-600' : ''}`}>
            {totalAllOre > 0 ? 'Til gode' : totalAllOre < 0 ? 'Skyld' : 'Alt i nul'}:{' '}
            {fmtDKK(totalAllOre)}
          </div>
        </div>
      </div>

      {/* Liste */}
      {rows.length === 0 ? (
        <div className="text-sm opacity-75">Ingen data.</div>
      ) : (
        <ul className="divide-y rounded-xl border">
          {rows.map(r => (
            <li key={r.visningsnavn} className="p-3 flex items-center justify-between gap-4">
              <div className="font-medium truncate">
                <Link
                  href={`/torsdagspadel/regnskab?user=${encodeURIComponent(r.visningsnavn)}`}
                  className="underline hover:no-underline"
                >
                  {r.visningsnavn}
                </Link>
              </div>
              <div className={`shrink-0 font-semibold ${r.ore < 0 ? 'text-red-600' : r.ore > 0 ? 'text-green-700' : ''}`}>
                {fmtDKK(r.ore)}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6">
        <Link href="/admin/torsdagspadel" className="inline-block bg-green-700 hover:bg-green-800 text-white font-semibold py-2 px-4 rounded-lg">
          ⬅ Tilbage til Torsdagspadel
        </Link>
      </div>
    </main>
  )
}

