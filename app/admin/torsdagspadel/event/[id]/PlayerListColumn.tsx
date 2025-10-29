import { EventPlayer } from "./EventAdminHelpers";

export default function PlayerListColumn({
  orderedPlayers,
  orderIds,
  loadingPlayers,
  locked,
  bentleyGreen,
  groups,
  matchNoByGroup,
  setMatchNo,
  movePlayerUp,
  removePlayer,
  startSwap,
  search,
  setSearch,
  searchResults,
  loadingProfiles,
  addPlayerFromSearch,
  onFetchSignups,
  eloAtStartMapForUI,
  displayEloMap, // <-- NY prop: nutidsElo til visning
}: {
  orderedPlayers: EventPlayer[];
  orderIds: string[];
  loadingPlayers: boolean;
  locked: boolean;
  bentleyGreen: any;
  groups: EventPlayer[][];
  matchNoByGroup: Record<number, number>;
  setMatchNo: (gi: number, v: number) => void;
  movePlayerUp: (uid: string) => void;
  removePlayer: (uid: string) => void;
  startSwap: (idx: number) => void;
  search: string;
  setSearch: (v: string) => void;
  searchResults: Array<{
    id: string;
    visningsnavn: string | null;
    elo?: number;
  }>;
  loadingProfiles: boolean;
  addPlayerFromSearch: (p: {
    id: string;
    visningsnavn: string | null;
    elo?: number;
  }) => void;
  onFetchSignups: () => void;
  eloAtStartMapForUI: Record<string, number>;
  displayEloMap: Record<string, number>; // <-- NY prop type
}) {
  return (
    <section
      className={`md:col-span-3 rounded-xl p-3 ${bentleyGreen.bgSoft} border ${bentleyGreen.border} dark:border-green-800`}
    >
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-semibold text-green-900 dark:text-green-200">
          Spillere ({orderedPlayers.length})
        </h2>
        <span className="text-[10px] opacity-60">
          grupper á 4 · kamp nr styrer rækkefølgen
        </span>
      </div>

      {/* Opdater deltagere */}
      <div className="mb-2 flex justify-between items-center">
        <button
          type="button"
          onClick={onFetchSignups}
          disabled={locked}
          className="text-xs px-2 py-1 rounded-md border border-green-300 dark:border-green-700 bg-white hover:bg-green-50 dark:bg-zinc-900 dark:hover:bg-green-900/30 disabled:opacity-40"
          title="Hent tilmeldte spillere (erstatter listen)"
        >
          ↻ Opdater deltagere
        </button>

        {loadingPlayers && (
          <span className="text-[11px] opacity-60">Henter…</span>
        )}
      </div>

      {/* Tilføj spiller manuelt */}
      <div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={locked ? "Låst" : "Tilføj spiller (søg visningsnavn)…"}
          disabled={locked}
          className={`w-full border rounded px-2 py-1 text-sm bg-white dark:bg-zinc-900 border-green-400/70 dark:border-green-800/70 ${
            locked ? "opacity-60" : ""
          }`}
        />
        {!!search && !locked && (
          <div className="mt-1 max-h-56 overflow-auto rounded border bg-white dark:bg-zinc-900 border-green-300 dark:border-green-800">
            {loadingProfiles && (
              <div className="p-2 text-xs opacity-70">Indlæser…</div>
            )}

            {!loadingProfiles &&
              searchResults.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => addPlayerFromSearch(p)}
                  className="w-full text-left flex items-center justify-between px-2 py-1 text-sm hover:bg-green-100/70 dark:hover:bg-green-900/30"
                >
                  <div className="truncate">
                    {p.visningsnavn || "Ukendt"}{" "}
                    <span className="opacity-70">
                      · ELO {displayEloMap[p.visningsnavn || ""] ?? 1500}
                    </span>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded border border-green-300 dark:border-green-700 text-green-700 dark:text-green-300">
                    Tilføj
                  </span>
                </button>
              ))}

            {!loadingProfiles && !searchResults.length && (
              <div className="p-2 text-xs opacity-70">Ingen…</div>
            )}
          </div>
        )}
      </div>

      {/* Grupper */}
      <div className="mt-3 space-y-3">
        {loadingPlayers ? (
          <div>Indlæser spillere…</div>
        ) : orderedPlayers.length === 0 ? (
          <div className="text-sm opacity-70">Ingen spillere endnu.</div>
        ) : (
          groups.map((block, bi) => {
            const gi = bi;
            const kampNo = matchNoByGroup[gi] ?? gi + 1;
            return (
              <div
                key={`grp-${gi}`}
                className={`rounded-lg border ${bentleyGreen.border} dark:border-green-700/80 bg-white/95 dark:bg-zinc-900 shadow-sm`}
              >
                {/* Gruppe header */}
                <div className={`px-3 py-2 flex items-center justify-between ${bentleyGreen.bgSoft}`}>
                  <div className="font-semibold text-green-900 dark:text-green-200">Gruppe {bi + 1}</div>
                  <label className="text-xs flex items-center gap-1">
                    Kamp nr.
                    <input
                      type="number"
                      min={1}
                      value={kampNo}
                      onChange={(e) => setMatchNo(gi, Number(e.target.value))}
                      className="w-14 text-xs px-2 py-1 border rounded bg-white dark:bg-zinc-900 border-green-300 dark:border-green-700"
                    />
                  </label>
                </div>

                {/* Spillere i gruppen */}
                <ul className="px-3 py-2 divide-y divide-green-100 dark:divide-green-900/30">
                  {block.map((p, idx) => {
                    const globalIndex = bi * 4 + idx;
                    const uid = orderIds[globalIndex];
                    const navn = p?.visningsnavn || "";
                    // Vis nutidsElo hvis vi har den, ellers fallback til baseline (dagens start)
                    const eloTilVisning =
                      displayEloMap[navn] ?? eloAtStartMapForUI[navn] ?? 1500;

                    return (
                      <li key={`${uid}-${globalIndex}`} className="py-1.5 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">
                            {globalIndex + 1}. {navn || "(ukendt)"}
                          </div>
                          <div className="text-[11px] opacity-70">
                            ELO {Math.round(eloTilVisning)}
                            {p?.tidligste_tid ? ` · ${p.tidligste_tid}` : ""}
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          {/* Ryk op */}
                          <button
                            type="button"
                            onClick={() => movePlayerUp(uid)}
                            disabled={locked}
                            className={`p-1.5 rounded-md border text-xs hover:bg-green-50 dark:hover:bg-green-900/30 border-green-300 dark:border-green-700 text-green-700 dark:text-green-300 ${
                              locked ? "opacity-50" : ""
                            }`}
                            title="Ryk spiller op"
                          >
                            ⬆️
                          </button>

                          {/* Skift spiller */}
                          <button
                            type="button"
                            onClick={() => startSwap(globalIndex)}
                            className="p-1.5 rounded-md border text-xs hover:bg-blue-50 dark:hover:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-200"
                            title="Skift spiller"
                          >
                            🔁
                          </button>

                          {/* Fjern spiller */}
                          <button
                            type="button"
                            onClick={() => removePlayer(uid)}
                            disabled={locked}
                            className={`p-1.5 rounded-md border text-xs hover:bg-red-50 dark:hover:bg-red-900/30 border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 ${
                              locked ? "opacity-50" : ""
                            }`}
                            title="Fjern spiller"
                          >
                            🗑️
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

