'use client'

import type { Kamp } from "./EventLayout"
import React from 'react'

type Props = {
  kampe: Kamp[]
}

export default function EventEloVisning({ kampe }: Props) {
  const alleSæt: Kamp[] = kampe.flatMap((k) => k.sæt)

  const initialMap: Record<string, number> = {}
  alleSæt.forEach((sæt) => {
    ;[sæt.holdA1, sæt.holdA2, sæt.holdB1, sæt.holdB2].forEach((navn) => {
      if (!initialMap[navn]) initialMap[navn] = 1500
    })
  })

  const { eloChanges } = beregnEloForKampe(alleSæt, initialMap)

  const samlet: Record<string, number> = {}

  Object.values(eloChanges).forEach((sætChanges) => {
    Object.entries(sætChanges).forEach(([navn, change]) => {
      if (!samlet[navn]) samlet[navn] = 0
      samlet[navn] += change.diff
    })
  })

  const sorted = Object.entries(samlet)
    .sort((a, b) => b[1] - a[1])
    .filter(([, diff]) => diff !== 0)

  return (
    <div className="w-1/5 bg-white rounded-xl shadow p-3 overflow-y-auto text-xs">
      <h2 className="text-sm font-semibold mb-2">📊 Elo</h2>
      {sorted.length === 0 && <p className="text-gray-400">Ingen ændringer</p>}
      <ul className="space-y-1">
        {sorted.map(([navn, diff]) => (
          <li key={navn} className="flex justify-between">
            <span className="truncate">{navn}</span>
            <span className={diff > 0 ? 'text-green-600 font-bold' : 'text-red-500'}>
              {diff > 0 ? `+${Math.round(diff)}` : Math.round(diff)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
