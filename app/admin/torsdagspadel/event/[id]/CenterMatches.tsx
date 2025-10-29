import { EventPlayer, Score, bentleyGreen as BGType } from "./EventAdminHelpers";

function ScoreBox({
  value,
  onChange,
  title,
}: {
  value: number;
  onChange: (v: string) => void;
  title: string;
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-7]"
      maxLength={1}
      value={String(value)}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => onChange(e.target.value)}
      className="w-7 border rounded px-0.5 py-0.5 text-center text-sm tabnums bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700"
      title={title}
    />
  );
}

export default function CenterMatches({
  plan,
  roundsPerGi,
  scores,
  setScore,
  addRoundForMatch,
  eventDate,
  locked,
  bentleyGreen,
  perSetInfoMap,
  ROT,
}: {
  plan: {
    gi: number;
    players: EventPlayer[];
    court: string;
    start: string;
    end: string;
  }[];
  roundsPerGi: Record<number, number>;
  scores: Record<string, Score>;
  setScore: (gi: number, si: number, side: "a" | "b", raw: string) => void;
  addRoundForMatch: (gi: number) => void;
  eventDate: string;
  locked: boolean;
  bentleyGreen: typeof BGType;
  perSetInfoMap: Record<
    string,
    {
      pctA: number;
      pctB: number;
      plusTxt: string;
    }
  >;
  ROT: readonly (readonly [readonly [number, number], readonly [number, number]])[];
}) {
  return (
    <section className="md:col-span-7 border rounded-xl p-3 bg-white/80 dark:bg-zinc-900/60 border-green-400 dark:border-green-800">
      {!plan.length ? (
        <div className="text-sm opacity-70">
          Tilføj spillere for at generere kampe.
        </div>
      ) : (
        <div className="space-y-3">
          {plan.map((g, idx) => {
            const gi = g.gi;
            const kampNr = idx + 1;
            const runder = roundsPerGi[gi] ?? 3;

            return (
              <div
                key={`kamp-${gi}`}
                className="rounded-lg border dark:border-zinc-800 overflow-hidden"
              >
                {/* header for kampen */}
                <div className="px-3 py-2 flex flex-wrap items-center gap-2 justify-between bg-zinc-100 dark:bg-zinc-900/40">
                  <div className="font-semibold">Kamp #{kampNr}</div>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <div className="px-2 py-0.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-100">
                      <span className="opacity-70 mr-1">Bane</span>
                      <span className="font-semibold">{g.court}</span>
                    </div>
                    <div className="px-2 py-0.5 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-100">
                      <span className="opacity-70 mr-1">Tid</span>
                      <span className="font-semibold tabnums">
                        {g.start}–{g.end}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => addRoundForMatch(gi)}
                      disabled={locked}
                      className="text-xs px-2 py-1 rounded border bg-white hover:bg-zinc-50 dark:hover:bg-zinc-800 border-zinc-300 dark:border-zinc-700 disabled:opacity-40"
                    >
                      + Tilføj sæt
                    </button>
                  </div>
                </div>

                {/* sæt for kampen */}
                <div className="px-3 py-2 space-y-1">
                  {Array.from({ length: runder }).map((_, si) => {
                    const rot = ROT[si % ROT.length];
                    const a1 = g.players[rot[0][0]];
                    const a2 = g.players[rot[0][1]];
                    const b1 = g.players[rot[1][0]];
                    const b2 = g.players[rot[1][1]];

                    const key = `${gi}-${si}`;
                    const sc = scores[key] ?? { a: 0, b: 0 };

                    const info = perSetInfoMap[key] || {
                      pctA: 50,
                      pctB: 50,
                      plusTxt: "",
                    };

                    return (
                      <div
                        key={key}
                        className="flex items-center justify-between gap-2 text-sm"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span className="opacity-70 shrink-0">
                            Sæt {si + 1}
                          </span>
                          <div className="flex-1 flex items-center gap-2 min-w-0">
                            <span className="truncate basis-0 grow min-w-0">
                              {a1?.visningsnavn || "?"} &amp;{" "}
                              {a2?.visningsnavn || "?"}
                            </span>
                            <span
                              className="shrink-0 font-semibold tabnums"
                              style={{
                                color: `hsl(${Math.round(
                                  120 *
                                    Math.max(
                                      0,
                                      Math.min(1, info.pctA / 100)
                                    )
                                )} 70% 30%)`,
                              }}
                            >
                              {info.pctA}%
                            </span>
                            <span className="opacity-60 shrink-0">vs</span>
                            <span
                              className="shrink-0 font-semibold tabnums"
                              style={{
                                color: `hsl(${Math.round(
                                  120 *
                                    Math.max(
                                      0,
                                      Math.min(1, info.pctB / 100)
                                    )
                                )} 70% 30%)`,
                              }}
                            >
                              {info.pctB}%
                            </span>
                            <span className="truncate basis-0 grow min-w-0 text-right">
                              {b1?.visningsnavn || "?"} &amp;{" "}
                              {b2?.visningsnavn || "?"}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <div className="flex items-center gap-1">
                            <ScoreBox
                              value={sc.a}
                              onChange={(val) =>
                                setScore(gi, si, "a", val)
                              }
                              title="Score A (0–7)"
                            />
                            <span className="opacity-60">-</span>
                            <ScoreBox
                              value={sc.b}
                              onChange={(val) =>
                                setScore(gi, si, "b", val)
                              }
                              title="Score B (0–7)"
                            />
                          </div>
                          <span className="text-green-700 font-semibold tabnums min-w-[36px] text-right">
                            {info.plusTxt}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* knap til ekstra sæt på mobil */}
                <div className="px-3 pb-3 sm:hidden">
                  <button
                    type="button"
                    onClick={() => addRoundForMatch(gi)}
                    disabled={locked}
                    className="text-xs px-2 py-1 rounded border bg-white hover:bg-zinc-50 dark:hover:bg-zinc-800 border-zinc-300 dark:border-zinc-700 disabled:opacity-40"
                  >
                    + Tilføj sæt
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

