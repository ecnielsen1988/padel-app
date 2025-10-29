export default function EloSidebar({
  dagensEloDiffs,
  emojiForPluspoint,
  bentleyGreen,
  // Valgfrie nye props (bagudkompatibel):
  eloAtStartMapForUI,
  displayEloMap,
}: {
  dagensEloDiffs: { navn: string; diff: number }[];
  emojiForPluspoint: (p: number) => string;
  bentleyGreen: any;
  // Elo ved dagens start (baseline) – bruges til at vise StartElo/SlutElo
  eloAtStartMapForUI?: Record<string, number>;
  // NutidsElo (visning) – hvis du vil vise "ELO nu"-kolonnen
  displayEloMap?: Record<string, number>;
}) {
  const showStartEnd = !!eloAtStartMapForUI; // vis Start/Slut hvis vi har baseline
  const showNow = !!displayEloMap; // vis "ELO nu" hvis vi har nutidsElo

  return (
    <aside
      className={`md:col-span-2 border rounded-xl p-3 bg-white/90 dark:bg-zinc-900/60 ${bentleyGreen.border} md:sticky md:top-2 h-fit`}
    >
      <h2 className="font-semibold mb-2 text-green-900 dark:text-green-200">
        📈 Dagens Elo
      </h2>

      {dagensEloDiffs.length === 0 ? (
        <div className="text-sm opacity-70">Ingen udfyldte sæt endnu.</div>
      ) : (
        <div className="space-y-1 max-h-[520px] overflow-auto pr-1">
          {dagensEloDiffs.map(({ navn, diff }) => {
            const start = showStartEnd ? Math.round(eloAtStartMapForUI![navn] ?? 1500) : undefined;
            const end = showStartEnd ? Math.round((eloAtStartMapForUI![navn] ?? 1500) + diff) : undefined;
            const now = showNow ? Math.round(displayEloMap![navn] ?? NaN) : undefined;

            return (
              <div key={navn} className="flex items-center justify-between text-sm">
                <div className="truncate max-w-[55%]">
                  <span className="truncate">{navn}</span>
                  {showNow && (
                    <span className="opacity-60 ml-1 text-[11px]">· nu {Number.isFinite(now!) ? now : "-"}</span>
                  )}
                </div>

                <div className="flex items-baseline gap-2">
                  {showStartEnd && (
                    <span className="text-[11px] tabnums opacity-70">
                      {Number.isFinite(start!) ? start : "-"}
                      <span className="opacity-40"> → </span>
                      {Number.isFinite(end!) ? end : "-"}
                    </span>
                  )}

                  <span className={diff >= 0 ? "text-green-600 tabnums" : "text-red-500 tabnums"}>
                    {emojiForPluspoint(diff)} {diff >= 0 ? "+" : ""}
                    {diff.toFixed(1)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
}

