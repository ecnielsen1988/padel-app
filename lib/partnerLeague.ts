import type { MatchSet, PlayerMatch } from "@/lib/playerMatches";
import type { PartnerDivision, PartnerRegistration } from "@/lib/partnerTournaments";

export type LeagueTeam = { id: string; names: [string, string] };
export type LeagueFixture = Pick<PlayerMatch, "date" | "start_time" | "location" | "court"> & {
  id: string | null;
  team_a: string;
  team_b: string;
  confirmed: boolean;
  sets: MatchSet[] | null;
};
export type LeaguePool = {
  id: string;
  division: PartnerDivision;
  number: number;
  teams: LeagueTeam[];
  matches: LeagueFixture[];
};
export type LeagueRoster = {
  closes_on: string | null;
  pools_published: boolean;
  registrations: (LeagueTeam & Pick<PartnerRegistration, "division" | "status"> & { created_at: string })[];
};
export type LeagueCalendarMatch = {
  date: string;
  start_time: string;
  location: string;
  court: string;
  division: PartnerDivision;
  pool: number;
};

export function leagueStandings(pool: LeaguePool) {
  const rows = pool.teams.map((team) => ({
    ...team, played: 0, points: 0, setDifference: 0, gameDifference: 0, headToHead: 0,
  }));
  const byId = new Map(rows.map((row) => [row.id, row]));
  const winners = new Map<string, Set<string>>();
  for (const match of pool.matches) {
    const a = byId.get(match.team_a);
    const b = byId.get(match.team_b);
    if (!a || !b || !match.sets?.length) continue;

    const wonA = match.sets.filter((set) => set.a > set.b).length;
    const wonB = match.sets.length - wonA;
    const gameDifference = match.sets.reduce((total, set) => total + set.a - set.b, 0);
    a.played++;
    b.played++;
    a.points += 1 + wonA;
    b.points += 1 + wonB;
    a.setDifference += wonA - wonB;
    b.setDifference += wonB - wonA;
    a.gameDifference += gameDifference;
    b.gameDifference -= gameDifference;

    const [winner, loser] = wonA > wonB ? [a.id, b.id] : [b.id, a.id];
    const opponents = winners.get(winner) ?? new Set<string>();
    opponents.add(loser);
    winners.set(winner, opponents);
  }

  const compare = (a: typeof rows[number], b: typeof rows[number]) =>
    b.points - a.points || b.setDifference - a.setDifference || b.gameDifference - a.gameDifference;
  for (const row of rows) {
    const tied = rows.filter((other) => other.id !== row.id && compare(row, other) === 0);
    const tiedIds = new Set([row.id, ...tied.map((other) => other.id)]);
    const games = pool.matches.filter((match) => tiedIds.has(match.team_a) && tiedIds.has(match.team_b) && match.sets);
    if (games.length === tiedIds.size * (tiedIds.size - 1) / 2) {
      row.headToHead = tied.filter((other) => winners.get(row.id)?.has(other.id)).length;
    }
  }
  rows.sort((a, b) => compare(a, b) || b.headToHead - a.headToHead);
  let place = 1;
  return rows.map((row, index) => {
    const previous = rows[index - 1];
    if (previous && (compare(previous, row) || previous.headToHead !== row.headToHead)) place = index + 1;
    return { ...row, place };
  });
}
