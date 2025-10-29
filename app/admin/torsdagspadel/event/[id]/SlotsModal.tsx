"use client";

import { useState } from "react";

type Slot = { court: string; start: string; end: string };

export default function SlotsModal({
  slots,
  onClose,
  onSave,
}: {
  slots: Slot[];
  onClose: () => void;
  onSave: (next: Slot[]) => void;
}) {
  const [draft, setDraft] = useState<Slot[]>(slots);

  function updateField(idx: number, field: keyof Slot, value: string) {
    setDraft((d) => d.map((s, i) => (i === idx ? { ...s, [field]: value } : s)));
  }

  function removeSlot(idx: number) {
    setDraft((d) => d.filter((_, i) => i !== idx));
  }

  function addSlot() {
    setDraft((d) => [
      ...d,
      { court: "CC", start: "17:00", end: "18:40" },
    ]);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-6">
      <div className="w-full sm:max-w-2xl bg-white dark:bg-zinc-900 rounded-t-2xl sm:rounded-2xl shadow-xl border border-green-300 dark:border-green-800">
        {/* Header */}
        <div className="p-3 sm:p-4 border-b border-green-300 dark:border-green-800 flex items-center justify-between">
          <div className="font-semibold">Baner & tider (rækkefølge)</div>
          <button onClick={onClose} className="text-sm">
            Luk
          </button>
        </div>

        {/* Body */}
        <div className="p-3 sm:p-4">
          <div className="space-y-2">
            {draft.map((slot, idx) => (
              <div
                key={idx}
                className="grid grid-cols-12 gap-2 items-center text-sm"
              >
                <div className="col-span-1 text-[11px] opacity-70">
                  #{idx + 1}
                </div>

                <input
                  value={slot.court}
                  onChange={(e) => updateField(idx, "court", e.target.value)}
                  className="col-span-4 border rounded px-2 py-1 bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700"
                  placeholder="Bane"
                />

                <input
                  type="time"
                  value={slot.start}
                  onChange={(e) => updateField(idx, "start", e.target.value)}
                  className="col-span-3 border rounded px-2 py-1 bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700"
                />

                <input
                  type="time"
                  value={slot.end}
                  onChange={(e) => updateField(idx, "end", e.target.value)}
                  className="col-span-3 border rounded px-2 py-1 bg-white dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700"
                />

                <button
                  onClick={() => removeSlot(idx)}
                  className="col-span-1 text-sm px-2 py-1 rounded border bg-white hover:bg-zinc-50 dark:hover:bg-zinc-800 border-zinc-300 dark:border-zinc-700"
                >
                  🗑️
                </button>
              </div>
            ))}
          </div>

          {/* Footer / actions */}
          <div className="mt-4 flex items-center justify-between">
            <button
              onClick={addSlot}
              className="px-3 py-1 rounded border bg-white hover:bg-zinc-50 dark:hover:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-sm"
            >
              + Tilføj slot
            </button>

            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                className="px-3 py-1 rounded border bg-white hover:bg-zinc-50 dark:hover:bg-zinc-800 border-zinc-300 dark:border-zinc-700 text-sm"
              >
                Annullér
              </button>
              <button
                onClick={() => onSave(draft)}
                className="px-3 py-1 rounded bg-green-600 text-white hover:bg-green-700 text-sm"
              >
                Gem
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

