// Entire /event page component with player picker, Elo shown, editable scores, editable court/time, +point on set, no point for 0-0, dark/light mode friendly

"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { beregnEloForKampe } from "@/lib/beregnElo";

export type Spiller = {
  visningsnavn: string;
  elo?: number;
};

export type Sæt = {
  holdA1: string;
  holdA2: string;
  holdB1: string;
  holdB2: string;
  scoreA: number;
  scoreB: number;
};

export type Kamp = {
  id: string;
  bane: string;
  starttid: string;
  sluttid: string;
  sæt: Sæt[];
};

const erFærdigtSæt = (a: number, b: number) => {
  const max = Math.max(a, b);
  const min = Math.min(a, b);
  return (
    (max === 6 && min <= 4) ||
    (max === 7 && (min === 5 || min === 6))
  );
};

function emojiForPluspoint(p: number) {
  if (p >= 100) return '🍾';
  if (p >= 50) return '🏆';
  if (p >= 40) return '🏅';
  if (p >= 30) return '☄️';
  if (p >= 20) return '🚀';
  if (p >= 10) return '🔥';
  if (p >= 5) return '📈';
  if (p >= 0) return '💪';
  if (p > -5) return '🎲';
  if (p > -10) return '📉';
  if (p > -20) return '🧯';
  if (p > -30) return '🪂';
  if (p > -40) return '❄️';
  if (p > -50) return '💩';
  if (p > -100) return '🥊';
  return '🙈';
}


export default function EventLayout() {
  const [alleSpillere, setAlleSpillere] = useState<Spiller[]>([]);
  const [valgteSpillere, setValgteSpillere] = useState<Spiller[]>([]);
  const [eloMap, setEloMap] = useState<Record<string, number>>({});
  const [kampe, setKampe] = useState<Kamp[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const hentData = async () => {
      const res = await fetch("/api/rangliste");
      const rangliste = await res.json();
      const map: Record<string, number> = {};
      rangliste.forEach((s: any) => {
        map[s.visningsnavn] = s.elo;
      });
      setEloMap(map);

      const { data: profiles } = await supabase.from("profiles").select("visningsnavn");
      if (!profiles) return;

      const spillereMedElo = profiles.map((p) => ({
        visningsnavn: p.visningsnavn,
        elo: map[p.visningsnavn] ?? 1000,
      }));

      setAlleSpillere(spillereMedElo);
    };

    hentData();
  }, []);

  const tilføjSpiller = (spiller: Spiller) => {
    if (!valgteSpillere.find((s) => s.visningsnavn === spiller.visningsnavn)) {
      const spillerMedElo = {
        ...spiller,
        elo: eloMap[spiller.visningsnavn] ?? 1000,
      };
      setValgteSpillere((prev) =>
        [...prev, spillerMedElo].sort((a, b) => (b.elo ?? 0) - (a.elo ?? 0))
      );
    }
    setSearch("");
  };

  const fjernSpiller = (visningsnavn: string) => {
    setValgteSpillere((prev) => prev.filter((s) => s.visningsnavn !== visningsnavn));
  };

  const lavEventFraSpillere = () => {
    const nyeKampe: Kamp[] = [];
    for (let i = 0; i < valgteSpillere.length; i += 4) {
      const gruppe = valgteSpillere.slice(i, i + 4);
      if (gruppe.length < 4) continue;

      const [p1, p2, p3, p4] = gruppe.map((s) => s.visningsnavn);
      nyeKampe.push({
        id: `kamp${i / 4 + 1}`,
        bane: `Bane ${i / 4 + 1}`,
        starttid: "17:00",
        sluttid: "17:45",
        sæt: [
          { holdA1: p1, holdA2: p2, holdB1: p3, holdB2: p4, scoreA: 0, scoreB: 0 },
          { holdA1: p1, holdA2: p3, holdB1: p2, holdB2: p4, scoreA: 0, scoreB: 0 },
          { holdA1: p1, holdA2: p4, holdB1: p2, holdB2: p3, scoreA: 0, scoreB: 0 },
        ],
      });
    }
    setKampe(nyeKampe);
  };

  const genererNæsteSæt = (kampIndex: number) => {
  setKampe((prev) => {
    const kamp = prev[kampIndex];
    const baseSpillere = kamp.sæt[0];

    const rotation = [
      [baseSpillere.holdA1, baseSpillere.holdA2, baseSpillere.holdB1, baseSpillere.holdB2],
      [baseSpillere.holdA1, baseSpillere.holdB1, baseSpillere.holdA2, baseSpillere.holdB2],
      [baseSpillere.holdA1, baseSpillere.holdB2, baseSpillere.holdA2, baseSpillere.holdB1],
    ];

    const næsteRotation = rotation[kamp.sæt.length % 3];

    const nytSæt = {
      holdA1: næsteRotation[0],
      holdA2: næsteRotation[1],
      holdB1: næsteRotation[2],
      holdB2: næsteRotation[3],
      scoreA: 0,
      scoreB: 0,
    };

    const opdateretKamp = {
      ...kamp,
      sæt: [...kamp.sæt, nytSæt],
    };

    const opdateretKampe = [...prev];
    opdateretKampe[kampIndex] = opdateretKamp;
    return opdateretKampe;
  });
};


  const sætMedId = kampe.flatMap((kamp, kampIndex) =>
    kamp.sæt.map((sæt, sætIndex) => {
        
      const score = [sæt.scoreA, sæt.scoreB];
      const finish = score[0] === 0 && score[1] === 0 ? false : erFærdigtSæt(score[0], score[1]);

      return {
        ...sæt,
        id: 1_000_000 + kampIndex * 10 + sætIndex,
        kampid: 999999,
        date: "2025-01-01",
        finish,
        event: true,
        tiebreak: "false",
      };
    })
  );

  const { eloChanges } = beregnEloForKampe(sætMedId, eloMap);

  const samletDiff: Record<string, number> = {};
  sætMedId.forEach((sæt) => {
  if (sæt.scoreA === 0 && sæt.scoreB === 0) return; // Ignorer 0-0 sæt
  const ændringer = eloChanges[sæt.id];
  if (!ændringer) return;
  Object.entries(ændringer).forEach(([navn, change]) => {
    samletDiff[navn] = (samletDiff[navn] ?? 0) + change.diff;
  });
});


  const visPoint = (id: number) => {
    const ændringer = eloChanges[id];
    if (!ændringer) return null;
    const score = sætMedId.find((s) => s.id === id);
    if (!score || (score.scoreA === 0 && score.scoreB === 0)) return null;
    const max = Math.max(...Object.values(ændringer).map((e) => e.diff).filter((v) => v > 0));
    return max > 0 ? `+${max.toFixed(1)}` : null;
  };

  return (
    <div className="flex gap-4 p-4 h-screen overflow-auto bg-white text-black dark:bg-zinc-900 dark:text-white">

      {/* Venstre kolonne */}
      <div className="w-1/5 p-3 rounded shadow bg-zinc-100 dark:bg-zinc-800">
        <h2 className="font-semibold mb-2">👥 Spillere</h2>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tilføj spiller..."
          className="w-full mb-2 p-1 rounded border bg-white dark:bg-zinc-700 dark:text-white"
        />
        {search && (
          <div className="bg-white dark:bg-zinc-700 border rounded shadow max-h-48 overflow-y-auto text-sm">
            {alleSpillere
              .filter(
                (s) =>
                  s.visningsnavn.toLowerCase().includes(search.toLowerCase()) &&
                  !valgteSpillere.find((vs) => vs.visningsnavn === s.visningsnavn)
              )
              .map((spiller) => (
                <div
                  key={spiller.visningsnavn}
                  onClick={() => tilføjSpiller(spiller)}
                  className="px-2 py-1 hover:bg-pink-100 dark:hover:bg-zinc-600 cursor-pointer flex justify-between text-sm"
                >
                  <span>{spiller.visningsnavn}</span>
                  <span className="text-gray-500 dark:text-gray-300">
                    {Math.round(spiller.elo ?? 1000)}
                  </span>
                </div>
              ))}
          </div>
        )}

        <div className="mt-3 space-y-1">
          {valgteSpillere.map((spiller) => (
            <div
              key={spiller.visningsnavn}
              className="flex justify-between items-center bg-pink-100 dark:bg-zinc-700 rounded px-2 py-1 text-xs"
            >
              <span>{spiller.visningsnavn}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-600 dark:text-gray-300">
                  {Math.round(spiller.elo ?? 1000)}
                </span>
                <button
                  onClick={() => fjernSpiller(spiller.visningsnavn)}
                  className="text-red-500"
                >
                  🗑
                </button>
              </div>
            </div>
          ))}
        </div>

        <button
  onClick={lavEventFraSpillere}
  disabled={kampe.some((kamp) =>
    kamp.sæt.some((sæt) => sæt.scoreA !== 0 || sæt.scoreB !== 0)
  )}
  className={`mt-2 text-xs rounded px-2 py-1 font-semibold transition
    ${kampe.some((kamp) =>
      kamp.sæt.some((sæt) => sæt.scoreA !== 0 || sæt.scoreB !== 0)
    )
      ? "bg-gray-400 text-white cursor-not-allowed"
      : "bg-green-600 text-white hover:bg-green-700"
    }`}
>
  ✅ Lav event
</button>

      </div>

      {/* Midterste kolonne */}
      <div className="w-3/5 space-y-4">
        {kampe.map((kamp, kampIndex) => (
          <div key={kamp.id} className="p-3 rounded bg-zinc-100 dark:bg-zinc-800">
            <div className="mb-2">
              <input
                type="text"
                value={kamp.bane}
                onChange={(e) => {
                  const updated = [...kampe];
                  updated[kampIndex].bane = e.target.value;
                  setKampe(updated);
                }}
                className="text-sm mr-2 border px-1 bg-white dark:bg-zinc-700 dark:text-white"
              />
              <input
                type="time"
                value={kamp.starttid}
                onChange={(e) => {
                  const updated = [...kampe];
                  updated[kampIndex].starttid = e.target.value;
                  setKampe(updated);
                }}
                className="text-sm mr-2 border px-1 bg-white dark:bg-zinc-700 dark:text-white"
              />
              -
              <input
                type="time"
                value={kamp.sluttid}
                onChange={(e) => {
                  const updated = [...kampe];
                  updated[kampIndex].sluttid = e.target.value;
                  setKampe(updated);
                }}
                className="text-sm ml-2 border px-1 bg-white dark:bg-zinc-700 dark:text-white"
              />
            </div>
            {kamp.sæt.map((sæt, sætIndex) => {
                
              const sætId = 1_000_000 + kampIndex * 10 + sætIndex;
              return (
                <div key={sætIndex} className="flex items-center gap-2 text-xs">
                  <div className="w-1/3 truncate">{sæt.holdA1} & {sæt.holdA2}</div>
                  <input
                  
  type="text"
  inputMode="numeric"
  maxLength={1}
  value={sæt.scoreA.toString()}
  onFocus={(e) => e.target.select()}
  onChange={(e) => {
    const val = parseInt(e.target.value);
    if (!isNaN(val) && val >= 0 && val <= 7) {
      const updated = [...kampe];
      updated[kampIndex].sæt[sætIndex].scoreA = val;
      setKampe(updated);
    } else if (e.target.value === "") {
      const updated = [...kampe];
      updated[kampIndex].sæt[sætIndex].scoreA = 0;
      setKampe(updated);
    }
  }}
  className="w-8 border text-center text-xs bg-white dark:bg-zinc-700 dark:text-white"
/>
                  -
                  <input
  type="text"
  inputMode="numeric"
  maxLength={1}
  value={sæt.scoreB.toString()}
  onFocus={(e) => e.target.select()}
  onChange={(e) => {
    const val = parseInt(e.target.value);
    if (!isNaN(val) && val >= 0 && val <= 7) {
      const updated = [...kampe];
      updated[kampIndex].sæt[sætIndex].scoreB = val;
      setKampe(updated);
    } else if (e.target.value === "") {
      const updated = [...kampe];
      updated[kampIndex].sæt[sætIndex].scoreB = 0;
      setKampe(updated);
    }
  }}
  className="w-8 border text-center text-xs bg-white dark:bg-zinc-700 dark:text-white"
/>
                  <div className="w-1/3 truncate text-right">{sæt.holdB1} & {sæt.holdB2}</div>
                  <div className="text-pink-600 text-xs font-bold">{visPoint(sætId)}</div>
                </div>
              );
            })}
            {/* Tilføj sæt-knap skal være her – uden for map */}
<button
  onClick={() => genererNæsteSæt(kampIndex)}
  className="mt-2 text-xs text-pink-600 hover:underline"
>
  ➕ Tilføj sæt
</button>

          </div>
        ))}
      </div>

      {/* Højre kolonne */}
     <div className="w-1/5 p-3 rounded shadow bg-zinc-100 dark:bg-zinc-800 sticky top-4 self-start h-fit">

  <h2 className="font-semibold mb-2">📈 Elo-ændringer</h2>
  {Object.entries(samletDiff)
    .sort(([, a], [, b]) => b - a)
    .map(([navn, diff], index) => {
      let emoji = emojiForPluspoint(diff);
      if (index === 0) emoji = '🥇';
      else if (index === 1) emoji = '🥈';
      else if (index === 2) emoji = '🥉';

      const sizeClass =
        index === 0 ? 'text-xl' : index === 1 ? 'text-lg' : index === 2 ? 'text-sm' : 'text-xs';

      return (
        <div key={navn} className={`flex justify-between items-center ${sizeClass}`}>
  <span className="truncate max-w-[180px] block">{navn}</span>
  <span className={diff >= 0 ? 'text-green-600' : 'text-red-500'}>
    {emoji} {diff >= 0 ? '+' : ''}
    {diff.toFixed(1)}
  </span>
</div>
      );
    })}
</div>

    </div>
  );
}
