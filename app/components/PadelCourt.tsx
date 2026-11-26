"use client";

import { useState, type ReactNode } from "react";

export const padelEventWidth = "w-full px-3 sm:px-5 2xl:px-8";
export const padelEventGrid = "grid grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(13rem,1fr)_repeat(2,minmax(0,1.7fr))_minmax(11rem,0.85fr)] xl:gap-5 2xl:gap-6";

export function PadelCourtColumns({ courts, byRow = false }: { courts: ReactNode[]; byRow?: boolean }) {
  const midpoint = Math.max(2, Math.ceil(courts.length / 2));

  return <div className="grid items-start gap-3 sm:grid-cols-2 xl:gap-5 2xl:gap-6">
    {byRow ? courts : <>
      <div className="grid min-w-0 gap-3">{courts.slice(0, midpoint)}</div>
      {courts.length > midpoint && <div className="grid min-w-0 gap-3">{courts.slice(midpoint)}</div>}
    </>}
  </div>;
}

export function PadelCourt({ label, header, children, backgroundImage }: {
  label: string;
  header: ReactNode;
  children: ReactNode;
  backgroundImage?: string;
}) {
  return <section aria-label={label} className="min-w-0 rounded-xl border border-sky-200 bg-sky-50/70 p-1.5 dark:border-sky-900 dark:bg-slate-950/70">
    {header}
    <div
      className="relative overflow-hidden rounded-lg bg-[#073567] bg-size-[100%_100%] bg-no-repeat py-1 text-white"
      style={{ backgroundImage: backgroundImage ? `url("${backgroundImage}")` : "linear-gradient(to bottom right, #105eaa, #073567)" }}
    >
      {!backgroundImage && <div aria-hidden="true" className="pointer-events-none absolute inset-1">
        <div className="absolute inset-y-0 left-[16%] right-[16%] border-x border-white/35">
          <div className="absolute inset-x-0 top-1/2 border-t border-white/35" />
        </div>
        <div className="absolute inset-y-0 left-1/2 w-1 -translate-x-1/2 border-x border-white/60 bg-[repeating-linear-gradient(to_bottom,#eff6ff_0_1px,#093d78_1px_3px)] shadow-sm" />
      </div>}
      {children}
    </div>
  </section>;
}

export function CourtScoreInput({ value, empty, label, tiebreak, disabled, onChange }: {
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

export function CourtWinChance({ side, probability, percent }: { side: "A" | "B"; probability: number; percent: number }) {
  return <span
    title="Forventet vinderchance før kampen"
    aria-label={`Vinderchance hold ${side}, ${percent}%`}
    className="flex h-7 items-center justify-center pl-1 text-[11px] font-bold tabular-nums"
    style={{ color: `hsl(${Math.round(120 * probability)} 90% 83%)` }}
  >{percent}%</span>;
}
