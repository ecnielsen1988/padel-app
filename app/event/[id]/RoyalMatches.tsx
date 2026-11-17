"use client";

import { useMemo, useState } from "react";
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

function RoyalScoreInput({ value, empty, label, tiebreak, disabled, onChange }: {
  value: number;
  empty: boolean;
  label: string;
  tiebreak: boolean;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const [zeroDraft, setZeroDraft] = useState<"" | "0" | null>(null);

  return <input
    aria-label={label}
    title={label}
    inputMode="numeric"
    pattern={tiebreak ? "[0-9]*" : "[0-7]"}
    maxLength={tiebreak ? 6 : 1}
    value={value === 0 ? zeroDraft ?? (empty ? "" : "0") : String(value)}
    placeholder="–"
    onFocus={e => e.currentTarget.select()}
    onBlur={() => setZeroDraft(draft => draft === "" ? null : draft)}
    onChange={e => {
      const digits = e.currentTarget.value.replace(/\D/g, "");
      setZeroDraft(digits === "" ? "" : /^0+$/.test(digits) ? "0" : null);
      onChange(digits);
    }}
    disabled={disabled}
    className="block h-7 w-full min-w-0 rounded-md border border-white/70 bg-sky-50 text-center text-sm font-bold text-sky-950 tabular-nums outline-none transition [text-shadow:none] placeholder:text-sky-700 focus:bg-white focus:ring-2 focus:ring-cyan-300 disabled:cursor-not-allowed disabled:border-white/25 disabled:bg-sky-950/60 disabled:text-sky-100 disabled:placeholder:text-sky-200/75"
  />;
}

const formatElo = (value: number) => `${value > 0 ? "+" : ""}${value.toLocaleString("da-DK", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;

export default function RoyalMatches({ plan, roundsPerCourt, scores, setScore, submittedLocked, eloMap }: RoyalMatchesProps) {
  const score = (gi: number, si: number) => scores[`${gi}-${si}`] ?? { a: 0, b: 0 };
  const eloStats = useMemo(() => calculateRoyalElo(plan, roundsPerCourt, scores, eloMap), [plan, roundsPerCourt, scores, eloMap]);
  const courts = plan.map(group => {
    const pairings = Math.ceil(Math.max(9, roundsPerCourt[group.gi] ?? 9) / 3);
    return <section key={group.gi} aria-label={`Bane ${group.court}`} className="min-w-0 rounded-xl border border-sky-200 bg-sky-50/70 p-1.5 dark:border-sky-900 dark:bg-slate-950/70">
      <header className="px-2 pt-0.5 pb-1.5">
        <h2 className="text-sm font-bold text-sky-950 dark:text-sky-100">Bane {group.court}</h2>
      </header>
      <div className="space-y-1.5">
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
          return <article key={pairing} aria-label={`Kamp ${pairing + 1} på bane ${group.court}`} className="relative overflow-hidden rounded-lg bg-linear-to-br from-[#105eaa] to-[#073567] px-3 py-2 text-white">
            <div aria-hidden="true" className="pointer-events-none absolute inset-1 rounded-sm border border-white/70">
              <div className="absolute inset-y-0 left-[16%] right-[16%] border-x border-white/35">
                <div className="absolute inset-x-0 top-1/2 border-t border-white/35" />
              </div>
              <div className="absolute inset-y-0 left-1/2 w-1 -translate-x-1/2 border-x border-white/60 bg-[repeating-linear-gradient(to_bottom,#eff6ff_0_1px,#093d78_1px_3px)] shadow-sm" />
            </div>
            <div className="relative grid grid-cols-[50%_repeat(4,minmax(0,1fr))] items-start gap-y-0.5 [text-shadow:0_1px_2px_#073567]">
              <h3 className="pr-2 text-xs font-bold">Kamp {pairing + 1}{complete && <span className="ml-2 text-emerald-200">{winnersA}–{winnersB}</span>}</h3>
              <span title="Forventet vinderchance" className="pl-1 text-center text-[10px] font-semibold text-sky-100">%</span>
              {["Sæt 1", "Sæt 2", "MTB"].map(label => <span key={label} title={label === "MTB" ? "Matchtiebreak til 10 ved 1–1 i sæt" : undefined} className="text-center text-[10px] font-semibold whitespace-nowrap text-sky-100">{label}</span>)}
              {rotation.map((team, side) => <div key={side} className="contents">
                <div className="flex min-h-7 min-w-0 items-center gap-1.5 pr-2 text-xs font-semibold leading-tight">
                  <span className={`h-5 w-0.5 shrink-0 rounded-full ${side === 0 ? "bg-cyan-200" : "bg-violet-200"}`} />
                  <span className="min-w-0 wrap-break-word">{group.players[team[0]]?.visningsnavn || "Spiller mangler"}<span className="mx-1 text-sky-200">&amp;</span>{group.players[team[1]]?.visningsnavn || "Spiller mangler"}</span>
                </div>
                <span title="Forventet vinderchance før kampen" aria-label={`Vinderchance hold ${side === 0 ? "A" : "B"}`} className="flex h-7 items-center justify-center pl-1 text-[11px] font-bold tabular-nums" style={{ color: `hsl(${Math.round(120 * (side === 0 ? stats.probabilityA : 1 - stats.probabilityA))} 90% 83%)` }}>{side === 0 ? percentA : 100 - percentA}%</span>
                {sets.map((set, i) => {
                  const diff = stats.sets[i]?.[side === 0 ? "a" : "b"];
                  return <div key={i} className="min-w-0 px-px sm:px-0.5">
                    <RoyalScoreInput
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
      </div>
    </section>;
  });

  return <div className="grid items-start gap-3 sm:grid-cols-2 xl:gap-5 2xl:gap-6">
    <div className="grid min-w-0 gap-3">{courts.slice(0, 2)}</div>
    {courts.length > 2 && <div className="grid min-w-0 gap-3">{courts.slice(2)}</div>}
  </div>;
}
