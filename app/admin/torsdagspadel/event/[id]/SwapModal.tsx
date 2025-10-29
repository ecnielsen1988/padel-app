"use client";

import { Profile } from "./EventAdminHelpers";

export default function SwapModal({
  open,
  onClose,
  onPick,
  searchResults,
  search,
  setSearch,
  loadingProfiles,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (p: Profile & { elo?: number }) => void;
  searchResults: Array<Profile & { elo?: number }>;
  search: string;
  setSearch: (v: string) => void;
  loadingProfiles: boolean;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-6">
      <div className="w-full sm:max-w-lg bg-white dark:bg-zinc-900 rounded-t-2xl sm:rounded-2xl shadow-xl border border-green-300 dark:border-green-800">
        {/* Header */}
        <div className="p-3 sm:p-4 border-b border-green-300 dark:border-green-800 flex items-center justify-between">
          <div className="font-semibold">Skift spiller</div>
          <button onClick={onClose} className="text-sm">
            Luk
          </button>
        </div>

        {/* Body */}
        <div className="p-3 sm:p-4">
          {/* søgeboks */}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Søg (visningsnavn)…"
            className="w-full border rounded px-2 py-1 text-sm bg-white/90 dark:bg-zinc-900 border-green-400/70 dark:border-green-800/70"
          />

          {/* resultater */}
          <div className="mt-2 max-h-72 overflow-auto rounded border bg-white dark:bg-zinc-900 border-green-300 dark:border-green-800">
            {loadingProfiles && (
              <div className="p-2 text-xs opacity-70">Indlæser…</div>
            )}

            {!loadingProfiles &&
              searchResults.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onPick(p)}
                  className="w-full text-left flex items-center justify-between px-2 py-1 text-sm hover:bg-green-100/70 dark:hover:bg-green-900/30"
                >
                  <div className="truncate">
                    {p.visningsnavn || "Ukendt"}{" "}
                    <span className="opacity-70">
                      · ELO {p.elo ?? 1000}
                    </span>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded border border-green-300 dark:border-green-700 text-green-700 dark:text-green-300">
                    Skift
                  </span>
                </button>
              ))}

            {!loadingProfiles && !searchResults.length && (
              <div className="p-2 text-xs opacity-70">Ingen…</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

