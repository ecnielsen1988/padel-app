"use client";

import { useMemo } from "react";
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

function RoyalScoreInput({ value, label, tiebreak, disabled, onChange }: {
  value: number;
  label: string;
  tiebreak: boolean;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return <input
    aria-label={label}
    title={label}
    inputMode="numeric"
    pattern={tiebreak ? "[0-9]*" : "[0-7]"}
    maxLength={tiebreak ? 6 : 1}
    value={value === 0 ? "" : String(value)}
    placeholder="–"
    onFocus={e => e.currentTarget.select()}
    onChange={e => onChange(e.target.value)}
    disabled={disabled}
    className="h-8 w-full min-w-0 rounded-lg border border-pink-200 bg-white text-center text-sm font-bold tabular-nums text-zinc-900 outline-none transition focus:border-pink-500 focus:ring-2 focus:ring-pink-200 disabled:cursor-not-allowed disabled:border-transparent disabled:bg-zinc-100 disabled:text-zinc-400 dark:border-pink-900 dark:bg-zinc-900 dark:text-white dark:disabled:bg-zinc-800"
  />;
}

const formatElo = (value: number) => `${value > 0 ? "+" : ""}${value.toLocaleString("da-DK", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;

export default function RoyalMatches({ plan, roundsPerCourt, scores, setScore, submittedLocked, eloMap }: RoyalMatchesProps) {
  const score = (gi: number, si: number) => scores[`${gi}-${si}`] ?? { a: 0, b: 0 };
  const eloStats = useMemo(() => calculateRoyalElo(plan, roundsPerCourt, scores, eloMap), [plan, roundsPerCourt, scores, eloMap]);
  return <div className="space-y-3">
    {plan.map(group => {
      const pairings = Math.ceil(Math.max(9, roundsPerCourt[group.gi] ?? 9) / 3);
      return <section key={group.gi} aria-label={`Bane ${group.court}`} className="overflow-hidden rounded-xl border border-pink-200 bg-white shadow-sm dark:border-pink-900 dark:bg-zinc-950">
        <header className="flex items-center justify-between bg-pink-50 px-3 py-2 dark:bg-pink-950/40">
          <h2 className="text-sm font-bold text-pink-900 dark:text-pink-100">Bane {group.court}</h2>
          <span className="text-xs text-pink-700/70 dark:text-pink-300">18–20</span>
        </header>
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
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
            return <article key={pairing} aria-label={`Kamp ${pairing + 1} på bane ${group.court}`} className="px-3 py-2.5">
              <div className="grid grid-cols-[minmax(0,1fr)_repeat(3,2.5rem)] items-center gap-x-2 gap-y-1 sm:grid-cols-[minmax(0,1fr)_repeat(3,2.75rem)]">
                <h3 className="text-xs font-bold text-zinc-500 dark:text-zinc-400">Kamp {pairing + 1}{complete && <span className="ml-2 text-emerald-600 dark:text-emerald-400">{winnersA}–{winnersB}</span>}</h3>
                {["Sæt 1", "Sæt 2", "MTB"].map(label => <span key={label} title={label === "MTB" ? "Matchtiebreak til 10 ved 1–1 i sæt" : undefined} className="text-center text-[10px] font-semibold text-zinc-400">{label}</span>)}
                {rotation.map((team, side) => <div key={side} className="contents">
                  <div className="flex min-w-0 items-center justify-between gap-2 pr-1 text-sm font-semibold leading-snug text-zinc-800 dark:text-zinc-100">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className={`h-6 w-0.5 shrink-0 rounded-full ${side === 0 ? "bg-pink-500" : "bg-violet-400"}`} />
                      <span className="min-w-0 break-words">{group.players[team[0]]?.visningsnavn || "Spiller mangler"}<span className="mx-1 text-pink-400">&amp;</span>{group.players[team[1]]?.visningsnavn || "Spiller mangler"}</span>
                    </div>
                    <span title="Forventet vinderchance før kampen" aria-label={`Vinderchance hold ${side === 0 ? "A" : "B"}`} className="shrink-0 text-xs font-bold tabular-nums" style={{ color: `hsl(${Math.round(120 * (side === 0 ? stats.probabilityA : 1 - stats.probabilityA))} 65% 40%)` }}>{side === 0 ? percentA : 100 - percentA}%</span>
                  </div>
                  {sets.map((set, i) => {
                    const diff = stats.sets[i]?.[side === 0 ? "a" : "b"];
                    return <div key={i} className="min-w-0">
                      <RoyalScoreInput
                        value={side === 0 ? set.a : set.b}
                        label={`Bane ${group.court}, kamp ${pairing + 1}, ${i === 2 ? "matchtiebreak" : `sæt ${i + 1}`}, hold ${side === 0 ? "A" : "B"}`}
                        tiebreak={i === 2}
                        disabled={submittedLocked || group.players.length < 4 || (i === 2 && !splitSets && sets[2].a === 0 && sets[2].b === 0)}
                        onChange={raw => setScore(group.gi, base + i, side === 0 ? "a" : "b", raw)}
                      />
                      <div title="Elo-point pr. spiller for sættet" aria-label={`Elo kamp ${pairing + 1}, sæt ${i + 1}, hold ${side === 0 ? "A" : "B"}`} className={`h-3.5 text-center text-[10px] font-semibold leading-3.5 tabular-nums ${diff != null && diff > 0 ? "text-emerald-600 dark:text-emerald-400" : diff != null && diff < 0 ? "text-rose-600 dark:text-rose-400" : "text-zinc-400"}`}>{diff == null ? "" : formatElo(diff)}</div>
                    </div>;
                  })}
                </div>)}
              </div>
            </article>;
          })}
        </div>
      </section>;
    })}
  </div>;
}
