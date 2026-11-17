"use client";

import { useMemo } from "react";
import { CourtScoreInput, CourtWinChance, PadelCourt, PadelCourtColumns } from "@/app/components/PadelCourt";
import { eventRotation, finishedEventSet, royalPairingComplete } from "@/lib/royal";
import { calculateRoyalElo } from "@/lib/royalElo";
import type { EloMap } from "@/lib/beregnElo";

type Player = { user_id: string; visningsnavn: string | null; elo: number };
type Score = { a: number; b: number };
export type RoyalMatchesProps = {
  plan: { gi: number; court: string | number; players: Player[] }[];
  roundsPerCourt: Record<number, number>;
  scores: Record<string, Score>;
  setScore: (gi: number, si: number, side: "a" | "b", raw: string) => void;
  submittedLocked: boolean;
  eloMap: EloMap;
};

const formatElo = (value: number) => `${value > 0 ? "+" : ""}${value.toLocaleString("da-DK", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;

export default function RoyalMatches({ plan, roundsPerCourt, scores, setScore, submittedLocked, eloMap }: RoyalMatchesProps) {
  const score = (gi: number, si: number) => scores[`${gi}-${si}`] ?? { a: 0, b: 0 };
  const eloStats = useMemo(() => calculateRoyalElo(plan, roundsPerCourt, scores, eloMap), [plan, roundsPerCourt, scores, eloMap]);
  const courts = plan.map(group => {
    const pairings = Math.ceil(Math.max(9, roundsPerCourt[group.gi] ?? 9) / 3);
    return <PadelCourt key={group.gi} label={`Bane ${group.court}`} header={
      <header className="px-2 pt-0.5 pb-1.5">
        <h2 className="text-sm font-bold text-sky-950 dark:text-sky-100">Bane {group.court}</h2>
      </header>
    }>
      {Array.from({ length: pairings }, (_, pairing) => {
        const base = pairing * 3;
        const sets = [0, 1, 2].map(i => score(group.gi, base + i));
        const complete = royalPairingComplete(sets);
        const firstTwoFinished = sets.slice(0, 2).every(s => finishedEventSet(s.a, s.b));
        const splitSets = firstTwoFinished && (sets[0].a > sets[0].b) !== (sets[1].a > sets[1].b);
        const rotation = eventRotation(base, true);
        const stats = eloStats[`${group.gi}-${pairing}`];
        const percentA = Math.round(stats.probabilityA * 100);
        const winnersA = sets.reduce((wins, s, i) => wins + (finishedEventSet(s.a, s.b, i === 2) && s.a > s.b ? 1 : 0), 0);
        const winnersB = sets.reduce((wins, s, i) => wins + (finishedEventSet(s.a, s.b, i === 2) && s.b > s.a ? 1 : 0), 0);
        return <article key={pairing} aria-label={`Kamp ${pairing + 1} på bane ${group.court}`} className="relative px-3 py-2">
          <div className="grid grid-cols-[50%_repeat(4,minmax(0,1fr))] items-start gap-y-0.5 [text-shadow:0_1px_2px_#073567]">
            <h3 className="pr-2 text-xs font-bold">Kamp {pairing + 1}{complete && <span className="ml-2 text-emerald-200">{winnersA}–{winnersB}</span>}</h3>
            <span title="Forventet vinderchance" className="pl-1 text-center text-[10px] font-semibold text-sky-100">%</span>
            {["Sæt 1", "Sæt 2", "MTB"].map(label => <span key={label} title={label === "MTB" ? "Matchtiebreak til 10 ved 1–1 i sæt" : undefined} className="text-center text-[10px] font-semibold whitespace-nowrap text-sky-100">{label}</span>)}
            {rotation.map((team, side) => <div key={side} className="contents">
              <div className="flex min-h-7 min-w-0 items-center pr-2 text-xs font-semibold leading-tight">
                <span className="min-w-0 wrap-break-word">{group.players[team[0]]?.visningsnavn || "Spiller mangler"}<span className="mx-1 text-sky-200">&amp;</span>{group.players[team[1]]?.visningsnavn || "Spiller mangler"}</span>
              </div>
              <CourtWinChance side={side === 0 ? "A" : "B"} probability={side === 0 ? stats.probabilityA : 1 - stats.probabilityA} percent={side === 0 ? percentA : 100 - percentA} />
              {sets.map((set, i) => {
                const diff = stats.sets[i]?.[side === 0 ? "a" : "b"];
                return <div key={i} className="min-w-0 px-px sm:px-0.5">
                  <CourtScoreInput
                    value={side === 0 ? set.a : set.b}
                    empty={set.a === 0 && set.b === 0}
                    label={`Bane ${group.court}, kamp ${pairing + 1}, ${i === 2 ? "matchtiebreak" : `sæt ${i + 1}`}, hold ${side === 0 ? "A" : "B"}`}
                    tiebreak={i === 2}
                    disabled={submittedLocked || group.players.length < 4 || (i === 2 && !splitSets && sets[2].a === 0 && sets[2].b === 0)}
                    onChange={raw => setScore(group.gi, base + i, side === 0 ? "a" : "b", raw)}
                  />
                  {diff != null && <div title="Elo-point pr. spiller for sættet" aria-label={`Elo kamp ${pairing + 1}, sæt ${i + 1}, hold ${side === 0 ? "A" : "B"}`} className={`text-center text-[10px] font-semibold leading-3 tabular-nums ${diff > 0 ? "text-emerald-200" : diff < 0 ? "text-rose-200" : "text-sky-100"}`}>{formatElo(diff)}</div>}
                </div>;
              })}
            </div>)}
          </div>
        </article>;
      })}
    </PadelCourt>;
  });

  return <PadelCourtColumns courts={courts} />;
}
