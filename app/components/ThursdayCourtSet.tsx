"use client";

import { Fragment, type ReactNode } from "react";
import { thursdayRotationCount } from "@/lib/thursdayProgram";
import { CourtScoreInput, CourtWinChance, PadelCourt } from "./PadelCourt";

export function ThursdayCourt({ label, header, children }: {
  label: string;
  header: ReactNode;
  children: ReactNode[];
}) {
  const hasExtraSets = children.length > thursdayRotationCount;

  return <PadelCourt label={label} header={header} backgroundImage="/thursday-padel-court.webp">
    <div className="grid min-h-[max(15rem,50cqw)] grid-rows-[3fr_14fr_3fr] px-[5%]">
      <div
        className="row-start-2 min-w-0 self-center overflow-x-auto overscroll-x-contain [scrollbar-width:none]"
        role={hasExtraSets ? "region" : undefined}
        aria-label={hasExtraSets ? `Sæt for ${label}` : undefined}
        tabIndex={hasExtraSets ? 0 : undefined}
      >
        <div className="grid auto-cols-max grid-cols-[max(min(100%,14rem),calc(100%-6rem))] gap-x-1 gap-y-0.5">
          {children.map((set, index) => set && (
            <div
              key={index}
              className="grid min-w-0 grid-rows-subgrid"
              style={{ gridRow: `${(index % thursdayRotationCount) * 2 + 1} / span 2`, gridColumn: Math.floor(index / thursdayRotationCount) + 1 }}
            >
              {set}
            </div>
          ))}
        </div>
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
    className={`row-span-2 grid grid-rows-subgrid items-center px-2 py-1 [text-shadow:0_1px_2px_#001329,0_0_5px_#001329] ${teams && number > thursdayRotationCount ? "w-56" : ""}`}
    style={{ gridTemplateColumns: columns.join(" ") }}
  >
    {(["a", "b"] as const).map((side, index) => (
      <Fragment key={side}>
        {teams && <div className="flex min-h-7 min-w-0 items-center pr-2 text-base font-bold leading-tight text-amber-200">
          <span className="min-w-0 wrap-break-word">{teams[index]}</span>
        </div>}
        {probabilityA !== undefined && percentA !== undefined && <CourtWinChance
          side={side === "a" ? "A" : "B"}
          probability={side === "a" ? probabilityA : 1 - probabilityA}
          percent={side === "a" ? percentA : 100 - percentA}
          textSize="text-sm"
        />}
        <div className="mx-auto w-full max-w-14 px-0.5 [&_input]:text-base">
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
    {showElo && <span title={eloGain ? "Største Elo-fremgang i sættet" : undefined} className="col-start-4 row-span-2 row-start-1 self-center text-center text-xs font-semibold whitespace-nowrap text-emerald-200 tabular-nums">
      {eloGain}
    </span>}
  </article>;
}
