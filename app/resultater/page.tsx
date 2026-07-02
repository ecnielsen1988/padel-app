'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { LoadingState, LoggedOutState, PageShell } from '../components/ui'
import { ResultMatchCard } from '@/lib/resultsFeed'

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

function formatDate(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString('da-DK', {
    day: '2-digit',
    month: 'short',
  })
}

function getEmojiForEloDiff(diff: number): string {
  if (diff >= 100) return '🍾'
  if (diff >= 50) return '🏆'
  if (diff >= 40) return '🏅'
  if (diff >= 30) return '☄️'
  if (diff >= 20) return '🚀'
  if (diff >= 10) return '🔥'
  if (diff >= 5) return '📈'
  if (diff >= 0) return '💪'
  if (diff > -5) return '🎲'
  if (diff > -10) return '📉'
  if (diff > -20) return '🧯'
  if (diff > -30) return '🪂'
  if (diff > -40) return '❄️'
  if (diff > -50) return '🙈'
  if (diff > -100) return '🥊'
  if (diff > -150) return '💩'
  return '💩💩'
}

function issueText(count: number | undefined) {
  return count && count > 1
    ? `Indrapporteret for fejl (${count})`
    : 'Indrapporteret for fejl'
}

export default function ResultaterPage() {
  const [loading, setLoading] = useState(true)
  const [loggedIn, setLoggedIn] = useState(false)
  const [visningsnavn, setVisningsnavn] = useState<string>('')
  const [myLatest, setMyLatest] = useState<ResultMatchCard | null>(null)
  const [latestOverall, setLatestOverall] = useState<ResultMatchCard | null>(null)

  useEffect(() => {
    let mounted = true

    ;(async () => {
      const res = await fetch('/api/results-feed?view=overview', { cache: 'no-store' })
      const data = await res.json()

      if (!mounted) return

      setLoggedIn(Boolean(data?.loggedIn))
      setVisningsnavn(typeof data?.visningsnavn === 'string' ? data.visningsnavn : 'Spiller')
      setMyLatest(data?.myLatest ?? null)
      setLatestOverall(data?.latestOverall ?? null)
      setLoading(false)
    })()

    return () => {
      mounted = false
    }
  }, [])

  if (loading) return <LoadingState />

  if (!loggedIn) {
    return (
      <LoggedOutState
        title="Du er ikke logget ind"
        description="Log ind for at se dine egne og andres resultater."
      />
    )
  }

  const cards = [
    {
      href: '/mine',
      icon: '🧾',
      title: 'Mine resultater',
      subtitle: 'Dine egne kampe, Elo-bevægelser og kommentarer',
      accent: 'bg-[#fff0f5]',
    },
    {
      href: '/lastgames',
      icon: '🕓',
      title: 'Seneste kampe',
      subtitle: 'De nyeste indberettede kampe i huset',
      accent: 'bg-[#fff8e8]',
    },
  ]

  return (
    <PageShell className="bg-[#1a1a2e] px-0 py-0 md:px-6 md:py-6">
      <div className="mx-auto flex min-h-screen w-full max-w-[820px] flex-col overflow-hidden bg-[#f4f5f7] md:min-h-[min(100vh,980px)] md:rounded-[34px] md:border md:border-white/10 md:shadow-[0_28px_80px_rgba(0,0,0,0.35)]">
        <header className="bg-gradient-to-br from-[#f01f78] to-[#c0135a] px-4 pb-5 pt-4 text-white md:px-6">
          <div className="mb-4 flex items-center justify-between text-[11px] font-semibold opacity-90">
            <span>Padelhuset</span>
            <span>
              {new Intl.DateTimeFormat('da-DK', {
                hour: '2-digit',
                minute: '2-digit',
              }).format(new Date())}
            </span>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/75">
                Kampe
              </p>
              <h1 className="mt-1 text-2xl font-black tracking-tight">
                Resultater
              </h1>
            </div>

            <Link
              href={`/profil/${encodeURIComponent(visningsnavn)}`}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#ffd44d] text-xs font-black text-[#463018]"
              aria-label="Min profil"
            >
              {initials(visningsnavn)}
            </Link>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 pb-28 pt-4 md:px-6">
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <Link
                href="/mine"
                className="rounded-[18px] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.07)] transition hover:-translate-y-0.5"
              >
                <div className="mb-2 flex items-center gap-3">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#fff0f5] text-[22px]">
                    🧾
                  </span>
                  <div>
                    <p className="text-sm font-extrabold text-[#1f2430]">
                      Min seneste kamp
                    </p>
                    <p className="text-xs text-[#838999]">
                      {myLatest ? formatDate(myLatest.date) : 'Ingen kamp endnu'}
                    </p>
                  </div>
                </div>
                {myLatest ? (
                  <div className="rounded-[10px] bg-[#fbfbfc] px-3 py-2 text-[13px] text-[#414754]">
                    {myLatest.adminIssueOpen ? (
                      <div className="mb-2 rounded-[10px] border border-[#f8bfd0] bg-[#fff3f8] px-2.5 py-2 text-[12px] font-bold text-[#c0135a]">
                        {issueText(myLatest.adminIssueCount)}
                      </div>
                    ) : null}
                    <div className="space-y-1">
                      {myLatest.eloSummary.map((player) => (
                        <div key={player.navn} className="flex items-center justify-between gap-2">
                          <div className="min-w-0 truncate font-semibold text-[#1f2430]">
                            {getEmojiForEloDiff(player.diff)}{player.navn}
                          </div>
                          <div className="shrink-0 text-[11px]">
                            <span className="text-[#1f2430]">
                              {player.before.toFixed(1)} → {player.after.toFixed(1)}
                            </span>{' '}
                            <span
                              className={
                                player.diff > 0
                                  ? 'text-[#1f7a5a]'
                                  : player.diff < 0
                                    ? 'text-[#c62828]'
                                    : 'text-[#7a808c]'
                              }
                            >
                              ({player.diff > 0 ? '+' : ''}{player.diff.toFixed(1)})
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-[12px] font-semibold text-[#414754]">
                      {myLatest.sets.map((set, index) => (
                        <span key={index}>{set.scoreA}-{set.scoreB}</span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-[10px] bg-[#fbfbfc] px-3 py-2 text-sm text-[#838999]">
                    Ingen resultater fundet endnu.
                  </div>
                )}
              </Link>

              <Link
                href="/lastgames"
                className="rounded-[18px] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.07)] transition hover:-translate-y-0.5"
              >
                <div className="mb-2 flex items-center gap-3">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#fff8e8] text-[22px]">
                    🕓
                  </span>
                  <div>
                    <p className="text-sm font-extrabold text-[#1f2430]">
                      Senest indrapporterede
                    </p>
                    <p className="text-xs text-[#838999]">
                      {latestOverall ? formatDate(latestOverall.date) : 'Ingen kamp endnu'}
                    </p>
                  </div>
                </div>
                {latestOverall ? (
                  <div className="rounded-[10px] bg-[#fbfbfc] px-3 py-2 text-[13px] text-[#414754]">
                    {latestOverall.adminIssueOpen ? (
                      <div className="mb-2 rounded-[10px] border border-[#f8bfd0] bg-[#fff3f8] px-2.5 py-2 text-[12px] font-bold text-[#c0135a]">
                        {issueText(latestOverall.adminIssueCount)}
                      </div>
                    ) : null}
                    <div className="space-y-1">
                      {latestOverall.eloSummary.map((player) => (
                        <div key={player.navn} className="flex items-center justify-between gap-2">
                          <div className="min-w-0 truncate font-semibold text-[#1f2430]">
                            {getEmojiForEloDiff(player.diff)}{player.navn}
                          </div>
                          <div className="shrink-0 text-[11px]">
                            <span className="text-[#1f2430]">
                              {player.before.toFixed(1)} → {player.after.toFixed(1)}
                            </span>{' '}
                            <span
                              className={
                                player.diff > 0
                                  ? 'text-[#1f7a5a]'
                                  : player.diff < 0
                                    ? 'text-[#c62828]'
                                    : 'text-[#7a808c]'
                              }
                            >
                              ({player.diff > 0 ? '+' : ''}{player.diff.toFixed(1)})
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-2 gap-y-1 text-[12px] font-semibold text-[#414754]">
                      {latestOverall.sets.map((set, index) => (
                        <span key={index}>{set.scoreA}-{set.scoreB}</span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-[10px] bg-[#fbfbfc] px-3 py-2 text-sm text-[#838999]">
                    Ingen resultater fundet endnu.
                  </div>
                )}
              </Link>
            </div>

            <section className="rounded-[20px] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.07)]">
              <div className="mb-3">
                <h2 className="text-[13px] font-bold uppercase tracking-[0.12em] text-[#2d3340]">
                  Vælg visning
                </h2>
              </div>

              <div className="space-y-3">
                {cards.map((card) => (
                  <Link
                    key={card.href}
                    href={card.href}
                    className="block rounded-[18px] bg-[#fbfbfc] px-4 py-4 shadow-[0_1px_8px_rgba(0,0,0,0.04)] transition hover:-translate-y-0.5"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`inline-flex h-11 w-11 items-center justify-center rounded-full text-[22px] ${card.accent}`}>
                        {card.icon}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-extrabold text-[#1f2430]">
                          {card.title}
                        </p>
                        <p className="text-xs text-[#838999]">{card.subtitle}</p>
                      </div>
                      <span className="text-sm font-bold text-[#f01f78]">Se</span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          </div>
        </div>

        <nav className="absolute inset-x-0 bottom-0 flex justify-around border-t border-black/5 bg-white px-2 pb-5 pt-3 md:static md:pb-4">
          {[
            { href: '/startside', icon: '🏠', label: 'Hjem' },
            { href: '/ranglister', icon: '📊', label: 'Rangliste' },
            { href: '/kommende', icon: '📅', label: 'Events' },
            { href: `/profil/${encodeURIComponent(visningsnavn)}`, icon: '🧑‍🎾', label: 'Profil' },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex min-w-16 flex-col items-center gap-1 text-[#7b8190]"
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
