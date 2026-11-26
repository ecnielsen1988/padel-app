"use client";

import { Fragment, useEffect, useRef, type ReactNode } from "react";
import { CourtScoreInput, CourtWinChance, PadelCourt } from "./PadelCourt";

const teamRotations = 3;

export function ThursdayCourt({ label, header, children }: {
  label: string;
  header: ReactNode;
  children: ReactNode[];
}) {
  const scrollArea = useRef<HTMLDivElement>(null);
  const setCount = children.length;
  const hasExtraSets = setCount > teamRotations;
  const previousSetCount = useRef(setCount);

  useEffect(() => {
    const area = scrollArea.current;
    if (area && setCount > previousSetCount.current) {
      area.scrollLeft = area.scrollWidth;
    }
    previousSetCount.current = setCount;
  }, [setCount]);

  return <PadelCourt label={label} header={header} backgroundImage="/thursday-padel-court.webp">
    <div
      ref={scrollArea}
      className="overflow-x-auto overscroll-x-contain"
      role={hasExtraSets ? "region" : undefined}
      aria-label={hasExtraSets ? `Sæt for ${label}` : undefined}
      tabIndex={hasExtraSets ? 0 : undefined}
    >
      <div className="grid auto-cols-[minmax(min(100%,14rem),1fr)] grid-rows-3 gap-1 px-[5%] py-3">
        {children.map((set, index) => set && (
          <div
            key={index}
            className="min-w-0 rounded-md bg-slate-950/70"
            style={{ gridRow: index % teamRotations + 1, gridColumn: Math.floor(index / teamRotations) + 1 }}
          >
            {set}
          </div>
        ))}
      </div>
    </div>
  </PadelCourt>;
}

export default function ThursdayCourtSet({ number, court, teams, probabilityA, score, eloGain, disabled = false, onScore }: {
  number: number;
  court: string;
  teams: [ReactNode, ReactNode];
  probabilityA: number;
  score: { a: number; b: number };
  eloGain: string;
  disabled?: boolean;
  onScore: (side: "a" | "b", value: string) => void;
}) {
  const percentA = Math.round(100 * probabilityA);

  return <article aria-label={`${court}, sæt ${number}`} className="relative grid grid-cols-[minmax(0,1fr)_2.25rem_2.5rem_2.5rem] items-start gap-y-0.5 px-2 py-1 [text-shadow:0_1px_2px_#073567]">
    <h3 className="pr-2 text-xs font-bold">Sæt {number}</h3>
    <span title="Forventet vinderchance" className="pl-1 text-center text-[10px] font-semibold text-sky-100">%</span>
    <span className="text-center text-[10px] font-semibold text-sky-100">Score</span>
    <span aria-hidden="true" />
    {(["a", "b"] as const).map((side, index) => (
      <Fragment key={side}>
        <div className="flex min-h-7 min-w-0 items-center pr-2 text-xs font-semibold leading-tight">
          <span className="min-w-0 wrap-break-word">{teams[index]}</span>
        </div>
        <CourtWinChance side={side === "a" ? "A" : "B"} probability={side === "a" ? probabilityA : 1 - probabilityA} percent={side === "a" ? percentA : 100 - percentA} />
        <div className="mx-auto w-full max-w-14 px-0.5">
          <CourtScoreInput
            value={score[side]}
            empty={false}
            label={`${court}, sæt ${number}, hold ${side.toUpperCase()}`}
            tiebreak={false}
            disabled={disabled}
            onChange={value => onScore(side, value)}
          />
        </div>
      </Fragment>
    ))}
    <span title={eloGain ? "Største Elo-fremgang i sættet" : undefined} className="col-start-4 row-span-2 row-start-2 self-center text-center text-xs font-semibold whitespace-nowrap text-emerald-200 tabular-nums">
      {eloGain}
    </span>
  </article>;
}
