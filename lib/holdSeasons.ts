export const HOLD_SEASONS = [
  "2025 forår",
  "2025 efterår",
  "2026 forår",
  "2026 efterår",
] as const;

export const CURRENT_HOLD_SEASON = "2026 efterår";

export function getPreviousHoldSeason(season: string) {
  const seasonIndex = HOLD_SEASONS.indexOf(season as (typeof HOLD_SEASONS)[number]);

  if (seasonIndex <= 0) {
    return null;
  }

  return HOLD_SEASONS[seasonIndex - 1];
}

export function getRecentHoldSeasons(season: string, count: number) {
  const seasons: string[] = [];
  let currentSeason: string | null = season;

  while (currentSeason && seasons.length < count) {
    seasons.push(currentSeason);
    currentSeason = getPreviousHoldSeason(currentSeason);
  }

  return seasons;
}
