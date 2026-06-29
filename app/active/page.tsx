'use client'

export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { PageShell } from '../components/ui'
import { supabase } from '@/lib/supabaseClient'
import { beregnEloÆndringerForIndeværendeMåned } from '@/lib/beregnEloMonthly'

type AktivSpiller = {
  visningsnavn: string
  sæt: number
  pluspoint: number
}

type KampRow = {
  holdA1?: string | null
  holdA2?: string | null
  holdB1?: string | null
  holdB2?: string | null
}

function emojiForPlacering(index: number) {
  if (index === 0) return '🏆'
  if (index === 1) return '🥈'
  if (index === 2) return '🥉'
  return '🏃‍♂️'
}

export default function MestAktiveSide() {
  const [mestAktive, setMestAktive] = useState<AktivSpiller[]>([])
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    const hentData = async () => {
      setLoading(true)
      try {
        const eloData = await beregnEloÆndringerForIndeværendeMåned()

        const now = new Date()
        const year = now.getFullYear()
        const month = now.getMonth() + 1
        const startDato = `${year}-${String(month).padStart(2, '0')}-01`
        const slutMonth = month === 12 ? 1 : month + 1
        const slutYear = month === 12 ? year + 1 : year
        const slutDato = `${slutYear}-${String(slutMonth).padStart(2, '0')}-01`

        const { data: kampeData, error } = await supabase
          .from('newresults')
          .select('holdA1, holdA2, holdB1, holdB2')
          .gte('date', startDato)
          .lt('date', slutDato)
          .eq('finish', true)

        if (error) {
          console.error('Fejl ved hentning af kampe:', error)
          setMestAktive([])
          return
        }

        const tæller: Record<string, number> = Object.create(null)

        for (const kamp of (kampeData as KampRow[] | null) ?? []) {
          const navne = [kamp.holdA1, kamp.holdA2, kamp.holdB1, kamp.holdB2]
          for (const navn of navne) {
            const key = typeof navn === 'string' ? navn.trim() : ''
            if (key) tæller[key] = (tæller[key] ?? 0) + 1
          }
        }

        const samlet: AktivSpiller[] = Object.entries(tæller).map(([visningsnavn, sæt]) => {
          const plus = eloData.find((entry) => entry.visningsnavn === visningsnavn)?.pluspoint ?? 0
          return { visningsnavn, sæt, pluspoint: plus }
        })

        samlet.sort((a, b) => {
          if (b.sæt !== a.sæt) return b.sæt - a.sæt
          return b.pluspoint - a.pluspoint
        })

        setMestAktive(samlet.slice(0, 20))
      } finally {
        setLoading(false)
      }
    }

    hentData()
  }, [])

  useEffect(() => {
    let mounted = true

    ;(async () => {
      const { data: auth } = await supabase.auth.getUser()
      const user = auth?.user
      if (!mounted || !user) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('rolle')
        .eq('id', user.id)
        .maybeSingle()

      if (!mounted) return
      setIsAdmin((profile?.rolle ?? '') === 'admin')
    })()

    return () => {
      mounted = false
    }
  }, [])

  const currentTime = new Intl.DateTimeFormat('da-DK', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date())

  const topPlayer = mestAktive[0] ?? null

  return (
    <PageShell className="bg-[#1a1a2e] px-0 py-0 md:px-6 md:py-6">
      <div className="mx-auto flex min-h-screen w-full max-w-[820px] flex-col overflow-hidden bg-[#f4f5f7] md:min-h-[min(100vh,980px)] md:rounded-[34px] md:border md:border-white/10 md:shadow-[0_28px_80px_rgba(0,0,0,0.35)]">
        <header className="bg-gradient-to-br from-[#f01f78] to-[#c0135a] px-4 pb-5 pt-4 text-white md:px-6">
          <div className="mb-4 flex items-center justify-between text-[11px] font-semibold opacity-90">
            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined') {
                  if (window.history.length > 1) window.history.back()
                  else window.location.href = '/'
                }
              }}
              className="inline-flex items-center rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-white/25"
            >
              ← Tilbage
            </button>
            <span>{currentTime}</span>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/75">
                Ranglister
              </p>
              <h1 className="mt-1 text-2xl font-black tracking-tight">
                Mest aktive
              </h1>
            </div>

            <Link
              href="/active/arkiv"
              className="inline-flex rounded-full bg-[#ffd44d] px-3 py-2 text-[11px] font-black text-[#463018]"
            >
              Arkiv
            </Link>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded-[18px] bg-white/14 px-3 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">
                Spillere
              </p>
              <p className="mt-1 text-xl font-black">{mestAktive.length}</p>
            </div>
            <div className="rounded-[18px] bg-white/14 px-3 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">
                Først
              </p>
              <p className="mt-1 truncate text-sm font-black">
                {topPlayer?.visningsnavn ?? '–'}
              </p>
            </div>
            <div className="rounded-[18px] bg-white/14 px-3 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">
                Flest sæt
              </p>
              <p className="mt-1 text-xl font-black">
                {topPlayer ? topPlayer.sæt : '–'}
              </p>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 pb-28 pt-4 md:px-6">
          <div className="space-y-4">
            <section className="rounded-[20px] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.07)]">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-[13px] font-bold uppercase tracking-[0.12em] text-[#2d3340]">
                  Månedens aktivitet
                </h2>
                <span className="rounded-full bg-[#fff0f5] px-3 py-1 text-[11px] font-bold text-[#f01f78]">
                  Tie-break: point
                </span>
              </div>

              {loading ? (
                <p className="text-sm text-[#6d7280]">Indlæser…</p>
              ) : mestAktive.length === 0 ? (
                <p className="text-sm text-[#6d7280]">
                  Ingen aktive spillere registreret endnu.
                </p>
              ) : (
                <ol className="space-y-2.5">
                  {mestAktive.map((spiller, index) => (
                    <li
                      key={spiller.visningsnavn}
                      className={[
                        'rounded-[18px] px-4 py-3',
                        index === 0
                          ? 'bg-gradient-to-r from-[#f01f78] to-[#ff5b9b] text-white'
                          : 'border border-[#ececf1] bg-[#fbfbfc] text-[#1f2430]',
                      ].join(' ')}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={index === 0 ? 'text-sm font-black text-white' : 'text-sm font-black text-[#f01f78]'}>
                              #{index + 1}
                            </span>
                            <span className="truncate text-sm font-bold">
                              {spiller.visningsnavn}
                            </span>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className={index === 0 ? 'text-sm font-bold text-white' : 'text-sm font-bold text-[#1f2430]'}>
                            {spiller.sæt} sæt {emojiForPlacering(index)}
                          </div>
                          <div className={index === 0 ? 'text-xs text-white/75' : 'text-xs text-[#8a8f9c]'}>
                            {spiller.pluspoint > 0 ? '+' : ''}
                            {spiller.pluspoint.toFixed(1)} point
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            {isAdmin ? (
              <section className="rounded-[20px] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.07)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-[13px] font-bold uppercase tracking-[0.12em] text-[#2d3340]">
                      Tidligere måneder
                    </h2>
                    <p className="mt-1 text-sm text-[#6d7280]">
                      Se hvem der har været mest aktive måned for måned.
                    </p>
                  </div>

                  <Link
                    href="/active/arkiv"
                    className="rounded-full bg-[#fff0f5] px-3 py-1.5 text-[11px] font-bold text-[#f01f78]"
                  >
                    Åbn arkiv
                  </Link>
                </div>
              </section>
            ) : null}
          </div>
        </div>

        <nav className="absolute inset-x-0 bottom-0 flex justify-around border-t border-black/5 bg-white px-2 pb-5 pt-3 md:static md:pb-4">
          {[
            { href: '/startside', icon: '🏠', label: 'Hjem' },
            { href: '/ranglister', icon: '📊', label: 'Rangliste' },
            { href: '/kommende', icon: '📅', label: 'Events' },
            ...(isAdmin ? [{ href: '/active/arkiv', icon: '🗂️', label: 'Arkiv' }] : []),
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={[
                'flex min-w-16 flex-col items-center gap-1',
                item.href === '/ranglister' ? 'text-[#f01f78]' : 'text-[#7b8190]',
              ].join(' ')}
            >
              <span className="text-lg">{item.icon}</span>
              <span className="text-[11px] font-semibold">{item.label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </PageShell>
  )
}
