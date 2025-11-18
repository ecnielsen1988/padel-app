// lib/beregnEloHistorik.ts
import { beregnEloForKampe as beregnEloForKampeAny } from "@/lib/beregnElo"

/**
 * Vi typer beregnEloForKampe som any, så vi ikke konflikter
 * med din eksisterende signatur. Vi bruger den som et “black box”.
 *
 * Forventet signatur (som i resten af din app):
 *   beregnEloForKampe(kampeArray, initialEloMap)
 */
const beregnEloForKampe = beregnEloForKampeAny as any

export type EloPoint = {
  date: string | null
  elo: number
}

/** Robust parsing af datoer: håndterer både "YYYY-MM-DD" og "DD-MM-YYYY" */
function parseDateToMillis(raw: string | null | undefined): number {
  if (!raw) return 0

  const v = String(raw).trim()

  // ISO-format: 2025-11-13
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) {
    const t = Date.parse(v)
    return isNaN(t) ? 0 : t
  }

  // Europæisk format: 13-11-2025
  if (/^\d{2}-\d{2}-\d{4}$/.test(v)) {
    const [dd, mm, yyyy] = v.split("-")
    const iso = `${yyyy}-${mm}-${dd}`
    const t = Date.parse(iso)
    return isNaN(t) ? 0 : t
  }

  const t = Date.parse(v)
  return isNaN(t) ? 0 : t
}

/**
 * Sorterer kampe nogenlunde kronologisk efter "date"/"dato" + id.
 */
function sortKampeChrono(kampe: any[]): any[] {
  return [...kampe].sort((a, b) => {
    const da = a.date ?? a.dato ?? null
    const db = b.date ?? b.dato ?? null

    const ta = parseDateToMillis(da)
    const tb = parseDateToMillis(db)

    if (ta !== tb) return ta - tb

    // fallback: sortér på id hvis det findes
    const ida = String(a.id ?? "")
    const idb = String(b.id ?? "")
    if (ida < idb) return -1
    if (ida > idb) return 1
    return 0
  })
}

/**
 * Finder Elo-map i returværdien fra beregnEloForKampe.
 * Dækker flere typiske returtyper:
 *  - { eloMap: {...} }
 *  - { nyEloMap: {...} }
 *  - { elo: {...} }
 *  - direkte map
 */
function extractEloMap(result: any): Record<string, number> {
  if (result && typeof result === "object") {
    if ("eloMap" in result) return (result as any).eloMap as Record<string, number>
    if ("nyEloMap" in result)
      return (result as any).nyEloMap as Record<string, number>
    if ("elo" in result) return (result as any).elo as Record<string, number>
  }
  return (result ?? {}) as Record<string, number>
}

/**
 * Tjekker om en spiller (visningsnavn) faktisk deltager i en given kamp.
 * Vi går igennem alle string-felter i kampen og ser om nogen matcher navnet 1:1.
 */
function playerInKamp(kamp: any, visningsnavn: string): boolean {
  if (!kamp || !visningsnavn) return false
  const target = visningsnavn.toLowerCase()

  for (const value of Object.values(kamp)) {
    if (typeof value === "string" && value.toLowerCase() === target) {
      return true
    }
  }

  return false
}

/**
 * Elo-historik for én bestemt spiller (visningsnavn).
 *
 * Implementation:
 *  - sorter alle kampe
 *  - for i = 0..n-1:
 *      - kør beregnEloForKampe(kampe[0..i], initialEloMap)
 *      - HVIS spilleren er med i kamp[i]:
 *          - læs Elo for visningsnavn ud
 *          - tilføj et punkt til historikken
 *
 * Det betyder:
 *  - første punkt bliver datoen for spillerens FØRSTE kamp
 *  - der kommer kun punkter på de dage, hvor spilleren faktisk har spillet
 */
export function hentEloHistorikForSpiller(
  visningsnavn: string,
  kampe: any[],
  initialEloMap: Record<string, number> = {}
): EloPoint[] {
  const sorted = sortKampeChrono(kampe)
  const history: EloPoint[] = []

  for (let i = 0; i < sorted.length; i++) {
    const kamp = sorted[i]

    // Spring kamp over hvis spilleren slet ikke er med
    if (!playerInKamp(kamp, visningsnavn)) continue

    const subset = sorted.slice(0, i + 1)

    const result = beregnEloForKampe(subset, initialEloMap)
    const eloMap = extractEloMap(result)
    const eloForSpiller = eloMap?.[visningsnavn]

    if (typeof eloForSpiller === "number") {
      const date: string | null = kamp.date ?? kamp.dato ?? null

      history.push({
        date,
        elo: eloForSpiller,
      })
    }
  }

  return history
}

/**
 * Nuværende Elo for én spiller – dvs. sidste punkt i historikken.
 */
export function findCurrentEloForSpiller(
  visningsnavn: string,
  kampe: any[],
  initialEloMap: Record<string, number> = {}
): number | null {
  const hist = hentEloHistorikForSpiller(visningsnavn, kampe, initialEloMap)
  if (!hist.length) return null
  return hist[hist.length - 1].elo
}

