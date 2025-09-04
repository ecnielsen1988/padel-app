export const dynamic = 'force-dynamic'

import { beregnEloÆndringerForIndeværendeMåned } from '@/lib/beregnEloChange'
import { headers } from 'next/headers'

type MånedensSpiller = {
  visningsnavn: string
  pluspoint: number
}

export default async function MånedensSpillerSide() {
  const maanedens: MånedensSpiller[] = await beregnEloÆndringerForIndeværendeMåned()

  // Læs Referer i server component og lav et internt href (uden cross-origin)
  const h = headers() as any
  const ref: string | null = typeof h.get === 'function' ? h.get('referer') : null

  let backHref = '/'
  if (ref) {
    try {
      const u = new URL(ref)
      backHref = (u.pathname || '/') + (u.search || '') + (u.hash || '')
    } catch {
      if (ref.startsWith('/')) backHref = ref
    }
  }

  function emojiForPluspoint(p: number) {
    if (p >= 100) return '🍾'
    if (p >= 50) return '🏆'
    if (p >= 40) return '🏅'
    if (p >= 30) return '☄️'
    if (p >= 20) return '🚀'
    if (p >= 10) return '🔥'
    if (p >= 5) return '📈'
    if (p >= 0) return '💪'
    if (p > -5) return '🎲'
    if (p > -10) return '📉'
    if (p > -20) return '🧯'
    if (p > -30) return '🪂'
    if (p > -40) return '❄️'
    if (p > -50) return '🙈'
    if (p > -100) return '🥊'
    if (p > -150) return '💩'
    return '💩💩'
  }

  return (
    <main className="min-h-screen py-10 px-4 sm:px-8 md:px-16 bg-white dark:bg-[#1e1e1e] text-gray-900 dark:text-white font-sans relative">
      {/* ← Tilbage-knap øverst til venstre */}
      <div className="fixed top-4 left-4 z-50">
        <a
          href={backHref}
          aria-label="Tilbage"
          title="Tilbage"
          className="px-3 py-1.5 rounded-full border-2 border-pink-500 text-pink-600 bg-white/90 dark:bg-[#2a2a2a]/90 shadow hover:bg-pink-50 dark:hover:bg-pink-900/20 transition"
        >
          ← Tilbage
        </a>
      </div>

      <h1 className="text-2xl sm:text-4xl font-bold text-center text-pink-600 mb-10">
        📈 Månedens spillere
      </h1>

      {maanedens.length === 0 ? (
        <p className="text-center text-gray-500 dark:text-gray-400">
          Ingen spillere har forbedret sig endnu i denne måned.
        </p>
      ) : (
        <ol className="space-y-4 max-w-2xl mx-auto">
          {maanedens.map((spiller, index) => {
            const emoji = emojiForPluspoint(spiller.pluspoint)
            return (
              <li
                key={spiller.visningsnavn}
                className={`flex items-center justify-between rounded-2xl px-6 py-4 shadow transition-all ${
                  index === 0
                    ? 'bg-gradient-to-r from-pink-500 to-pink-400 text-white scale-[1.03]'
                    : index === 1
                    ? 'bg-pink-100 dark:bg-pink-900/30'
                    : index === 2
                    ? 'bg-pink-50 dark:bg-pink-800/20'
                    : 'bg-white dark:bg-[#2a2a2a]'
                }`}
              >
                <div className="flex items-center gap-2 sm:gap-3">
                  <span className="text-base sm:text-xl font-bold text-pink-600 dark:text-pink-400">
                    #{index + 1}
                  </span>
                  <span className="text-sm sm:text-lg font-medium truncate">
                    {spiller.visningsnavn}
                  </span>
                </div>
                <span className="text-sm sm:text-base font-semibold whitespace-nowrap tabular-nums">
                  {spiller.pluspoint > 0 ? '+' : ''}
                  {spiller.pluspoint.toFixed(1)} {emoji}
                </span>
              </li>
            )
          })}
        </ol>
      )}
    </main>
  )
}

