'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

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
        if (!user) {
          setLoading(false)
          return
        }

        let admin = (user as any)?.app_metadata?.rolle === 'admin'
        if (!admin) {
          const { data: me } = await (supabase.from('profiles') as any)
            .select('rolle')
            .eq('id', user.id)
            .maybeSingle()
          admin = (me as any)?.rolle === 'admin'
        }
        setIsAdmin(admin)
        if (!admin) {
          setLoading(false)
          return
        }

        // --- Hent torsdags-spillere (navne) ---
        const { data: players, error: playersErr } = await (supabase.from('profiles') as any)
          .select('visningsnavn')
          .eq('torsdagspadel', true)

        if (playersErr) {
          console.error(playersErr)
          setRows([])
          setLoading(false)
          return
        }

        // Brug præcis de samme navne som i profiles (ingen trim),
        // så det matcher detaljesiden 1:1
        const names = Array.from(
          new Set(
            ((players ?? []) as Array<{ visningsnavn: string | null }>)
              .map(p => p.visningsnavn)
              .filter((n): n is string => !!n)
          )
        )

        if (names.length === 0) {
          setRows([])
          setLoading(false)
          return
        }

        // --- Beregn saldo for hver spiller på samme måde som detaljesiden ---
        const saldoRows: SaldoRow[] = []

        for (const name of names) {
          // samme type query som på /torsdagspadel/regnskab
          const { data, error } = await (supabase.from('bar_entries') as any)
            .select('amount_ore')
            .eq('visningsnavn', name)
            .limit(20000)

          if (error) {
            console.error('Fejl ved hentning af bar_entries for', name, error)
            saldoRows.push({ visningsnavn: name, ore: 0 })
            continue
          }

          const entries = (data ?? []) as Array<{ amount_ore: number | null }>
          let oreTotal = 0

          for (const row of entries) {
            const ore = Number(row.amount_ore ?? 0)
            if (Number.isFinite(ore)) {
              oreTotal += ore
            }
          }

          saldoRows.push({ visningsnavn: name, ore: oreTotal })
        }

        // Sorter alfabetisk
        saldoRows.sort((a, b) => a.visningsnavn.localeCompare(b.visningsnavn, 'da'))

        setRows(saldoRows)
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
          <Link
            href="/admin/torsdagspadel"
            className="inline-block bg-green-700 hover:bg-green-800 text-white font-semibold py-2 px-4 rounded-lg"
          >
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
          <div
            className={`text-lg font-semibold ${
              totalAllOre > 0 ? 'text-green-700' : totalAllOre < 0 ? 'text-red-600' : ''
            }`}
          >
            {totalAllOre > 0 ? 'Til gode' : totalAllOre < 0 ? 'Skyld' : 'Alt i nul'}:{' '}
            {fmtDKK(totalAllOre)}
          </div>
        </div>
      </div>

      {/* Liste pr. spiller */}
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
              <div
                className={`shrink-0 font-semibold ${
                  r.ore < 0 ? 'text-red-600' : r.ore > 0 ? 'text-green-700' : ''
                }`}
              >
                {fmtDKK(r.ore)}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6">
        <Link
          href="/admin/torsdagspadel"
          className="inline-block bg-green-700 hover:bg-green-800 text-white font-semibold py-2 px-4 rounded-lg"
        >
          ⬅ Tilbage til Torsdagspadel
        </Link>
      </div>
    </main>
  )
}

