'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

type Bruger = { id: string; visningsnavn: string; torsdagspadel: boolean; rolle?: string }
type BarEntry = Record<string, any>
type Player = { visningsnavn: string }

function formatDKDate(isoOrDate: string | Date | null | undefined) {
  if (!isoOrDate) return ''
  const d =
    typeof isoOrDate === 'string'
      ? new Date(isoOrDate.includes('T') ? isoOrDate : `${isoOrDate}T00:00:00`)
      : isoOrDate
  return d.toLocaleDateString('da-DK', {
    timeZone: 'Europe/Copenhagen',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

function extractAmountDKK(row: BarEntry): number {
  const ore = Number(row?.amount_ore ?? 0)
  return Number.isFinite(ore) ? ore / 100 : 0
}

function extractDate(row: BarEntry) {
  return row.event_date ?? row.date ?? row.created_at ?? null
}

// ⭐ Understøtter Toast, Lunarkamp, T-shirt, Shorts + ensretter chips til 🍟
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
  if (p.includes('bøde') || p.includes('boede')) return add('💰', true)   // behold note
  if (p.includes('indbetaling'))             return add('💸', true)      // behold note
  if (p.includes('sodavand'))                return add('🥤')
  if (p.includes('chips'))                   return add('🍟')
  if (p.includes('toast'))                   return add('🥪 Toast')
  if (p.includes('lunarkamp'))               return add('🏸 Lunarkamp')
  if (p.includes('tshirt') || p.includes('t-shirt') || p.includes('t-shirt')) return add('👕 T-shirt')
  if (p.includes('shorts'))                  return add('🩳 Shorts')
  if (p.includes('øl') || p.includes('oel')) return add('🍺')
  if (p.includes('rabat'))                   return add('🤑', true)      // behold note

  // fallback
  return product ? product + (n ? ` — ${n}` : '') : (n || '(ingen tekst)')
}

export default function RegnskabPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const paramUser = searchParams.get('user') // kan være null

  const [loading, setLoading] = useState(true)
  const [me, setMe] = useState<Bruger | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)

  const [entries, setEntries] = useState<BarEntry[] | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [selectedName, setSelectedName] = useState<string | null>(null)

  useEffect(() => {
    const run = async () => {
      try {
        // Auth
        const { data: auth } = await supabase.auth.getUser()
        const user = auth?.user
        if (!user) { setLoading(false); return }

        // Hent egen profil + rolle (cast 'from' til any for at undgå TS-generic bøvl)
       const profResp = await (supabase
  .from('profiles') as any)
  .select('id, visningsnavn, torsdagspadel, rolle')
  .eq('id', user.id)
  .maybeSingle();

if (profResp.error) { setLoading(false); return }

const profile = (profResp.data ?? null) as Bruger | null

        // Admin-check (JWT eller profiles)
        const jwtRole = (user.app_metadata as any)?.rolle
const admin = jwtRole === 'admin' || profile?.rolle === 'admin'
setIsAdmin(!!admin)
setMe(profile)


        // Hent alle torsdagsspillere til dropdown (kun admin)
        if (admin) {
          const { data: pls } = await (supabase
            .from('profiles') as any)
            .select('visningsnavn')
            .eq('torsdagspadel', true)

          const cleanPlayers: Player[] = ((pls as Array<{ visningsnavn: string | null }> | null) ?? [])
            .map(p => ({ visningsnavn: (p?.visningsnavn ?? '').toString().trim() }))
            .filter(p => p.visningsnavn.length > 0)
            .sort((a,b) => a.visningsnavn.localeCompare(b.visningsnavn, 'da-DK'))

          setPlayers(cleanPlayers)
        }

        // Bestem hvilket navn vi kigger på
        const target =
          (admin && paramUser && paramUser.trim().length > 0)
            ? paramUser
            : (profile?.visningsnavn ?? null)
        setSelectedName(target)

        // Hent entries for target
        if (target) {
          const { data, error } = await (supabase
            .from('bar_entries') as any)
            .select('*')
            .eq('visningsnavn', target)
            .order('event_date', { ascending: false })

          if (!error) setEntries((data as BarEntry[] | null) ?? [])
          else setEntries([])
        } else {
          setEntries([])
        }
      } finally {
        setLoading(false)
      }
    }
    run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramUser]) // ændrer når ?user= skifter

  // Total
  const totalDKK = (entries ?? []).reduce((sum, row) => sum + extractAmountDKK(row), 0)
  const totalLabel = totalDKK > 0 ? 'Du har til gode' : totalDKK < 0 ? 'Du skylder' : 'Alt i nul'
  const totalClass = totalDKK > 0 ? 'text-green-700' : totalDKK < 0 ? 'text-red-600' : 'text-zinc-700 dark:text-zinc-300'

  if (loading) {
    return (
      <main className="max-w-xl mx-auto p-8 text-gray-900 dark:text-white">
        <p>Indlæser dit regnskab…</p>
      </main>
    )
  }

  // Adgang: alm. bruger må kun se sin egen (vi ignorerer ?user= hvis ikke admin)
  if (!me) {
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

  // Hjælper: skift bruger via dropdown (admin)
  const onPick = (name: string) => {
    setSelectedName(name)
    const sp = new URLSearchParams(Array.from(searchParams.entries()))
    if (name) sp.set('user', name); else sp.delete('user')
    router.replace(`/torsdagspadel/regnskab?${sp.toString()}`)
  }

  return (
    <main className="max-w-xl mx-auto p-8 text-gray-900 dark:text-white">
      <h1 className="text-3xl font-bold mb-6 text-center">
        💸 {isAdmin && selectedName && selectedName !== me.visningsnavn ? `Regnskab – ${selectedName}` : 'Dit regnskab'}
      </h1>

      {/* Admin: vælg spiller */}
      {isAdmin && (
        <div className="mb-4 flex items-center gap-2">
          <label className="text-sm opacity-70">Vælg spiller:</label>
          <select
            className="px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
            value={selectedName ?? ''}
            onChange={(e) => onPick(e.target.value)}
          >
            <option value="" disabled>— vælg —</option>
            {players.map(p => (
              <option key={p.visningsnavn} value={p.visningsnavn}>{p.visningsnavn}</option>
            ))}
          </select>
        </div>
      )}

      {/* Samlet skyld/tilgode */}
      <div className="mb-6 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm opacity-70">Samlet status</div>
          <div className={`text-lg font-semibold ${totalClass}`}>
            {totalLabel}:{' '}
            {totalDKK.toLocaleString('da-DK', { style: 'currency', currency: 'DKK' })}
          </div>
        </div>
        <div className="mt-2 text-md text-zinc-600 dark:text-zinc-400 italic">
          Indbetalinger kan ske til MobilePay Box 1637CJ
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
              <li
                key={`${row.event_date ?? row.created_at ?? 'row'}-${row.Product ?? row.product ?? 'p'}-${idx}`}
                className="p-4 flex items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <div className="text-xs opacity-70">{formatDKDate(dateVal)}</div>
                  <div className="font-medium truncate">{label}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className={`font-semibold ${amount < 0 ? 'text-red-600' : amount > 0 ? 'text-green-700' : ''}`}>
                    {amount.toLocaleString('da-DK', { style: 'currency', currency: 'DKK' })}
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

