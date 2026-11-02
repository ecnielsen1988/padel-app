import { beregnEloForKampe, type EloMap } from "@/lib/beregnElo";
import { eventRotation, finishedEventSet, type RoyalScore } from "@/lib/royal";

type Group = { gi: number; players: { visningsnavn: string | null; elo: number }[] };
export type RoyalPairingElo = { probabilityA: number; sets: ({ a: number; b: number } | null)[] };

/** Same set order and Elo calculation as event submission; empty sets have no effect. */
export function calculateRoyalElo(
  plan: Group[],
  roundsPerCourt: Record<number, number>,
  scores: Record<string, RoyalScore>,
  initialElo: EloMap,
) {
  let current = { ...initialElo };
  for (const group of plan) for (const player of group.players) {
    if (player.visningsnavn && current[player.visningsnavn] == null) current[player.visningsnavn] = player.elo;
  }
  const stats: Record<string, RoyalPairingElo> = {};
  for (const group of plan) {
    const pairings = Math.ceil(Math.max(9, roundsPerCourt[group.gi] ?? 9) / 3);
    for (let pairing = 0; pairing < pairings; pairing++) {
      const base = pairing * 3;
      const rotation = eventRotation(base, true);
      const names = rotation.flatMap(team => team.map(i => group.players[i]?.visningsnavn ?? ""));
      const ratings = names.map(name => current[name] ?? 1500);
      const averageA = (ratings[0] + ratings[1]) / 2;
      const averageB = (ratings[2] + ratings[3]) / 2;
      const pairingStats: RoyalPairingElo = {
        probabilityA: 1 / (1 + Math.pow(10, (averageB - averageA) / 400)),
        sets: [],
      };
      for (let i = 0; i < 3; i++) {
        const score = scores[`${group.gi}-${base + i}`];
        if (!score || (score.a === 0 && score.b === 0) || names.some(name => !name)) {
          pairingStats.sets.push(null);
          continue;
        }
        const match = {
          id: 1, kampid: 1, date: "1970-01-01",
          holdA1: names[0], holdA2: names[1], holdB1: names[2], holdB2: names[3],
          scoreA: score.a, scoreB: score.b,
          finish: finishedEventSet(score.a, score.b, i === 2),
          event: true, tiebreak: i === 2 ? "matchtiebreak" : "false",
        };
        const { nyEloMap, eloChanges } = beregnEloForKampe([match], current);
        pairingStats.sets.push({ a: eloChanges[1][names[0]].diff, b: eloChanges[1][names[2]].diff });
        current = nyEloMap;
      }
      stats[`${group.gi}-${pairing}`] = pairingStats;
    }
  }
  return stats;
}
