export const dynamic = 'force-dynamic'

import { beregnEloÆndringerForIndeværendeMåned, MånedensSpiller } from '@/lib/beregnEloChange'
import { supabase } from '@/lib/supabaseClient'

export default async function TorsdagsMånedensSpillerSide() {
  const alleSpillere: MånedensSpiller[] = await beregnEloÆndringerForIndeværendeMåned()

  const { data: torsdagspillere, error } = await supabase
    .from('profiles')
    .select('visningsnavn')
    .eq('torsdagspadel', true)

  const torsdagNavneSet = new Set(
    torsdagspillere?.map(s => s.visningsnavn.trim())
  )

  const maanedens = alleSpillere.filter(spiller =>
    torsdagNavneSet.has(spiller.visningsnavn.trim())
  )

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
    <main className="min-h-screen py-10 px-4 sm:px-8 md:px-16 bg-white dark:bg-[#1e1e1e] text-gray-900 dark:text-white font-sans">
      <h1 className="text-2xl sm:text-4xl font-bold text-center text-green-600 mb-10">
        🌿 Torsdagens månedens spillere
      </h1>

      {maanedens.length === 0 ? (
        <p className="text-center text-gray-500 dark:text-gray-400">
          Ingen torsdagsspillere har forbedret sig endnu i denne måned.
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
                   ? 'bg-gradient-to-r from-green-900 to-green-800 text-white scale-[1.03]'
                    : index === 1
                    ? 'bg-green-500 dark:bg-green-400/30'
                    : index === 2
                    ? 'bg-green-300 dark:bg-green-200/20'
                    : 'bg-white dark:bg-[#2a2a2a]'
                }`}
              >
                <div className="flex items-center gap-2 sm:gap-3">
                  <span className="text-base sm:text-xl font-bold text-green-600 dark:text-green-400">
                    #{index + 1}
                  </span>
                  <span className="text-sm sm:text-lg font-medium truncate">
                    {spiller.visningsnavn}
                  </span>
                </div>
                <span className="text-sm sm:text-base font-semibold whitespace-nowrap">
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

