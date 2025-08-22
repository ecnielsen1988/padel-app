'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

type Bruger = { visningsnavn: string; torsdagspadel: boolean }
type BarEntry = Record<string, any>

function formatDKDate(isoOrDate: string | Date | null | undefined) {
  if (!isoOrDate) return ''
  const d = typeof isoOrDate === 'string'
    ? new Date(isoOrDate.includes('T') ? isoOrDate : `${isoOrDate}T00:00:00`)
    : isoOrDate
  return d.toLocaleDateString('da-DK', {
    timeZone: 'Europe/Copenhagen',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

function extractAmountDKK(row: BarEntry): number | null {
  if (row.amount_ore === null || row.amount_ore === undefined) return null
  const ore = Number(row.amount_ore)
  return Number.isFinite(ore) ? ore / 100 : null
}

function extractDate(row: BarEntry) {
  return row.event_date ?? row.date ?? row.created_at ?? null
}

function productToEmojiText(productRaw?: string | null, note?: string | null, qty?: number | null) {
  const product = (productRaw ?? '').trim()
  const p = product.toLowerCase()
  const n = (note ?? '').trim()
  const qtyStr = qty && qty > 1 ? ` x${qty}` : '' // fjern x1

  const add = (base: string, keepNote = false) =>
    base + qtyStr + (keepNote && n ? ` — ${n}` : '')

  // ===== PRÆMIER =====
  if (p.includes('praemie_aften_1')) return add('🥇 Aftenens spiller')
  if (p.includes('praemie_aften_2')) return add('🥈 Aftenens nr. 2')
  if (p.includes('praemie_aften_3')) return add('🥉 Aftenens nr. 3')

  if (p.includes('praemie_maaned_mest_aktive') || p.includes('præmie_måned_mest_aktive'))
    return add('🏆 Månedens mest aktive')

  if (p.includes('praemie_maaned_1') || p.includes('præmie_måned_1'))
    return add('🏆 Månedens spiller')
  if (p.includes('praemie_maaned_2') || p.includes('præmie_måned_2'))
    return add('🥈 Månedens nr. 2')
  if (p.includes('praemie_maaned_3') || p.includes('præmie_måned_3'))
    return add('🥉 Månedens nr. 3')

  // ===== Øvrige varer/handlinger =====
  if (p.includes('bøde') || p.includes('boede')) return add('💰', true)         // behold note
 if (p.includes('indbetaling'))             return add('💸', true)  // behold note
  if (p.includes('sodavand'))                return add('🥤')
  if (p.includes('chips'))                   return add('🍿')
  if (p.includes('øl') || p.includes('oel')) return add('🍺')
  if (p.includes('rabat'))                   return add('🤑', true)            // money eyes + evt. note

  // fallback
  return product ? product + (n ? ` — ${n}` : '') : (n || '(ingen tekst)')
}

export default function RegnskabPage() {
  const [loading, setLoading] = useState(true)
  const [bruger, setBruger] = useState<Bruger | null>(null)
  const [entries, setEntries] = useState<BarEntry[] | null>(null)

  useEffect(() => {
    const run = async () => {
      try {
        const { data: auth } = await supabase.auth.getUser()
        const user = auth?.user
        if (!user) { setLoading(false); return }

        const { data: profile, error: pErr } = await supabase
          .from('profiles')
          .select('visningsnavn, torsdagspadel')
          .eq('id', user.id)
          .single()

        if (pErr || !profile?.torsdagspadel) { setLoading(false); return }
        setBruger(profile as Bruger)

        const { data, error } = await supabase
          .from('bar_entries')
          .select('*')
          .eq('visningsnavn', profile.visningsnavn)
          .order('event_date', { ascending: false })

        if (error) { console.error('Fejl ved hentning af bar_entries:', error); setEntries([]); return }
        setEntries((data as BarEntry[]) ?? [])
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [])

  const totalDKK = useMemo(() => {
    return (entries ?? []).reduce((sum, row) => sum + (extractAmountDKK(row) ?? 0), 0)
  }, [entries])

  if (loading) {
    return (
      <main className="max-w-xl mx-auto p-8 text-gray-900 dark:text-white">
        <p>Indlæser dit regnskab…</p>
      </main>
    )
  }

  if (!bruger) {
    return (
      <main className="max-w-xl mx-auto p-8 text-gray-900 dark:text-white">
        <p>Du har ikke adgang til denne side.</p>
        <div className="mt-4">
          <Link href="/torsdagspadel" className="inline-block bg-green-700 hover:bg-green-800 text-white font-semibold py-2 px-4 rounded-lg">
            ⬅ Tilbage til Torsdagspadel
          </Link>
        </div>
      </main>
    )
  }

  const totalLabel = totalDKK > 0 ? 'Du har til gode' : totalDKK < 0 ? 'Du skylder' : 'Alt i nul'
  const totalClass = totalDKK > 0 ? 'text-green-700' : totalDKK < 0 ? 'text-red-600' : 'text-zinc-700 dark:text-zinc-300'

  return (
    <main className="max-w-xl mx-auto p-8 text-gray-900 dark:text-white">
      <h1 className="text-3xl font-bold mb-6 text-center">💸 Dit regnskab</h1>

      {/* Samlet skyld/tilgode */}
      <div className="mb-6 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
  <div className="flex items-center justify-between">
    <div className="text-sm opacity-70">Samlet status</div>
    <div className={`text-lg font-semibold ${totalClass}`}>
      {totalLabel}:{' '}
      {totalDKK.toLocaleString('da-DK', { style: 'currency', currency: 'DKK' })}
    </div>
  </div>


  {/* 👇 NY linje */}
  <div className="mt-2 text-md text-zinc-600 dark:text-zinc-400 italic">
    Indbetalinger kan ske til MobilePay Box 2033WT
  </div>
</div>

      {/* Liste */}
      {(!entries || entries.length === 0) ? (
        <div className="text-sm text-gray-700 dark:text-gray-300">
          <p>Ingen transaktioner fundet.</p>
        </div>
      ) : (
        <ul className="divide-y divide-zinc-200 dark:divide-zinc-700 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900">
          {entries.map((row, idx) => {
            const dateVal = extractDate(row)
            const label = productToEmojiText(row.Product ?? row.product, row.note, row.qty)
            const amount = extractAmountDKK(row)
            return (
              <li key={`${row.event_date ?? 'row'}-${row.Product ?? 'p'}-${idx}`} className="p-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-xs opacity-70">{formatDKDate(dateVal)}</div>
                  <div className="font-medium truncate">{label}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className={`font-semibold ${amount !== null ? (amount < 0 ? 'text-red-600' : 'text-green-700') : ''}`}>
                    {amount !== null ? amount.toLocaleString('da-DK', { style: 'currency', currency: 'DKK' }) : '—'}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <div className="mt-6">
        <Link href="/torsdagspadel" className="inline-block bg-green-700 hover:bg-green-800 text-white font-semibold py-2 px-4 rounded-lg">
          ⬅ Tilbage til Torsdagspadel
        </Link>
      </div>
    </main>
  )
}

