"use client";

import { Fragment, useEffect, useRef, type ReactNode } from "react";
import { thursdayRotationCount } from "@/lib/thursdayProgram";
import { CourtScoreInput, CourtWinChance, PadelCourt } from "./PadelCourt";

export function ThursdayCourt({ label, header, children }: {
  label: string;
  header: ReactNode;
  children: ReactNode[];
}) {
  const scrollArea = useRef<HTMLDivElement>(null);
  const setCount = children.length;
  const hasExtraSets = setCount > thursdayRotationCount;
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
      <div className="grid auto-cols-max grid-cols-[minmax(min(100%,12rem),1fr)] gap-x-1 gap-y-0.5 px-[5%] py-3">
        {children.map((set, index) => set && (
          <div
            key={index}
            className="grid min-w-0 grid-rows-subgrid"
            style={{ gridRow: `${(index % thursdayRotationCount) * 3 + 1} / span 3`, gridColumn: Math.floor(index / thursdayRotationCount) + 1 }}
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
  teams?: [ReactNode, ReactNode];
  probabilityA?: number;
  score: { a: number; b: number };
  eloGain?: string;
  disabled?: boolean;
  onScore: (side: "a" | "b", value: string) => void;
}) {
  const percentA = probabilityA === undefined ? undefined : Math.round(100 * probabilityA);
  const showElo = teams && number <= thursdayRotationCount && probabilityA !== undefined;
  const columns = teams ? ["minmax(0,1fr)"] : [];
  if (probabilityA !== undefined) columns.push("2.25rem");
  columns.push("2.5rem");
  if (showElo) columns.push("2.5rem");

  return <article
    aria-label={`${court}, sæt ${number}`}
    className={`row-span-3 grid grid-rows-subgrid items-center px-2 py-1 [text-shadow:0_1px_3px_#001329,0_0_4px_#001329] ${teams && number > thursdayRotationCount ? "w-56" : ""}`}
    style={{ gridTemplateColumns: columns.join(" ") }}
  >
    <h3 className={`text-xs font-bold whitespace-nowrap ${teams ? "" : "col-span-full text-center"}`}>Sæt {number}</h3>
    {teams && probabilityA !== undefined && <span title="Forventet vinderchance" className="text-center text-[10px] font-semibold text-sky-100">%</span>}
    {teams && <span className="text-center text-[10px] font-semibold text-sky-100">Score</span>}
    {showElo && <span aria-hidden="true" />}
    {(["a", "b"] as const).map((side, index) => (
      <Fragment key={side}>
        {teams && <div className="flex min-h-7 min-w-0 items-center pr-2 text-xs font-semibold leading-tight">
          <span className="min-w-0 wrap-break-word">{teams[index]}</span>
        </div>}
        {probabilityA !== undefined && percentA !== undefined && <CourtWinChance
          side={side === "a" ? "A" : "B"}
          probability={side === "a" ? probabilityA : 1 - probabilityA}
          percent={side === "a" ? percentA : 100 - percentA}
        />}
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
    {showElo && <span title={eloGain ? "Største Elo-fremgang i sættet" : undefined} className="col-start-4 row-span-2 row-start-2 self-center text-center text-xs font-semibold whitespace-nowrap text-emerald-200 tabular-nums">
      {eloGain}
    </span>}
  </article>;
}
