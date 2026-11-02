"use client";

import { eventRotation, finishedEventSet, royalPairingComplete } from "@/lib/royal";

type Player = { user_id: string; visningsnavn: string | null; elo: number };
type Score = { a: number; b: number };
export type RoyalMatchesProps = {
  plan: { gi: number; court: string | number; players: Player[] }[];
  roundsPerCourt: Record<number, number>;
  scores: Record<string, Score>;
  setScore: (gi: number, si: number, side: "a" | "b", raw: string) => void;
  submittedLocked: boolean;
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
    className="h-11 w-full min-w-0 rounded-xl border border-pink-200 bg-white text-center text-base font-bold tabular-nums text-zinc-900 outline-none transition focus:border-pink-500 focus:ring-2 focus:ring-pink-200 disabled:cursor-not-allowed disabled:border-transparent disabled:bg-zinc-100 disabled:text-zinc-400 dark:border-pink-900 dark:bg-zinc-900 dark:text-white dark:disabled:bg-zinc-800"
  />;
}

export default function RoyalMatches({ plan, roundsPerCourt, scores, setScore, submittedLocked }: RoyalMatchesProps) {
  const score = (gi: number, si: number) => scores[`${gi}-${si}`] ?? { a: 0, b: 0 };
  return <div className="space-y-6">
    {plan.map(group => {
      const pairings = Math.ceil(Math.max(9, roundsPerCourt[group.gi] ?? 9) / 3);
      return <section key={group.gi} aria-label={`Bane ${group.court}`} className="overflow-hidden rounded-2xl border border-pink-200 bg-white shadow-sm dark:border-pink-900 dark:bg-zinc-950">
        <header className="flex items-center justify-between gap-3 bg-gradient-to-r from-pink-100 via-pink-50 to-white px-4 py-4 dark:from-pink-950 dark:via-pink-950/50 dark:to-zinc-950 sm:px-5">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-pink-600 text-base font-black text-white shadow-sm">{group.court}</span>
            <div><h2 className="font-bold text-zinc-900 dark:text-white">Bane {group.court}</h2><p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">{group.players.length} spillere · {pairings} kampe med makkerskift</p></div>
          </div>
          <span className="shrink-0 rounded-full border border-pink-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-pink-800 dark:border-pink-900 dark:bg-pink-950 dark:text-pink-200">18.00–20.00</span>
        </header>
        <div className="space-y-3 p-3 sm:p-4">
          {Array.from({ length: pairings }, (_, pairing) => {
            const base = pairing * 3;
            const sets = [0, 1, 2].map(i => score(group.gi, base + i));
            const previous = [0, 1, 2].map(i => score(group.gi, base - 3 + i));
            const ready = pairing === 0 || royalPairingComplete(previous);
            const complete = royalPairingComplete(sets);
            const firstTwoFinished = sets.slice(0, 2).every(s => finishedEventSet(s.a, s.b));
            const splitSets = firstTwoFinished && (sets[0].a > sets[0].b) !== (sets[1].a > sets[1].b);
            const straightSets = firstTwoFinished && !splitSets;
            const rotation = eventRotation(base, true);
            const winnersA = sets.reduce((wins, s, i) => wins + (finishedEventSet(s.a, s.b, i === 2) && s.a > s.b ? 1 : 0), 0);
            const winnersB = sets.reduce((wins, s, i) => wins + (finishedEventSet(s.a, s.b, i === 2) && s.b > s.a ? 1 : 0), 0);
            return <article key={pairing} aria-label={`Kamp ${pairing + 1} på bane ${group.court}`} className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-900/30 sm:p-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-sm font-bold text-zinc-900 dark:text-white"><span className="h-1.5 w-1.5 rounded-full bg-pink-500" />Kamp #{pairing + 1}<span className="font-normal text-zinc-500 dark:text-zinc-400">{rotation[0].map(i => i + 1).join("+")} mod {rotation[1].map(i => i + 1).join("+")}</span></h3>
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${complete ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : "bg-white text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"}`}>{complete ? `Afsluttet · ${winnersA}–${winnersB}` : ready ? "Klar til spil" : `Efter kamp ${pairing}`}</span>
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_repeat(3,2.75rem)] items-center gap-x-2 gap-y-2 sm:grid-cols-[minmax(0,1fr)_repeat(3,3.25rem)] sm:gap-x-3">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Makkerpar</span>
                {["Sæt 1", "Sæt 2", "MTB"].map(label => <span key={label} className="text-center text-[10px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</span>)}
                {rotation.map((team, side) => <div key={side} className="contents">
                  <div className="flex min-h-11 min-w-0 items-center gap-2 pr-1 text-sm font-semibold leading-snug text-zinc-800 dark:text-zinc-100">
                    <span className={`h-7 w-1 shrink-0 rounded-full ${side === 0 ? "bg-pink-500" : "bg-violet-400"}`} />
                    <span className="min-w-0 break-words">{group.players[team[0]]?.visningsnavn || "Spiller mangler"}<span className="mx-1 text-pink-400">&amp;</span>{group.players[team[1]]?.visningsnavn || "Spiller mangler"}</span>
                  </div>
                  {sets.map((set, i) => <RoyalScoreInput
                    key={i}
                    value={side === 0 ? set.a : set.b}
                    label={`Bane ${group.court}, kamp ${pairing + 1}, ${i === 2 ? "matchtiebreak" : `sæt ${i + 1}`}, hold ${side === 0 ? "A" : "B"}`}
                    tiebreak={i === 2}
                    disabled={submittedLocked || !ready || group.players.length < 4 || (i === 2 && !splitSets && sets[2].a === 0 && sets[2].b === 0)}
                    onChange={raw => setScore(group.gi, base + i, side === 0 ? "a" : "b", raw)}
                  />)}
                </div>)}
              </div>
              <p className="mt-3 text-xs leading-relaxed text-zinc-400 dark:text-zinc-500">{straightSets ? "Afgjort i to sæt · ingen matchtiebreak." : "MTB = matchtiebreak til 10 ved 1–1 i sæt. Vind med to point."}</p>
            </article>;
          })}
        </div>
      </section>;
    })}
  </div>;
}
