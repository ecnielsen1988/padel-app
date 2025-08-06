"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { beregnEloForKampe, EloChange } from "@/lib/beregnElo";

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

export default function EventLayout() {
  const [alleSpillere, setAlleSpillere] = useState<Spiller[]>([]);
  const [valgteSpillere, setValgteSpillere] = useState<Spiller[]>([]);
  const [eloMap, setEloMap] = useState<Record<string, number>>({});
  const [kampe, setKampe] = useState<Kamp[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const hentData = async () => {
      const res = await fetch("/api/rangliste");
      const rangliste: { visningsnavn: string; elo: number }[] = await res.json();

      const map: Record<string, number> = {};
      rangliste.forEach((s) => {
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

      const kamp: Kamp = {
        id: `kamp${i / 4 + 1}`,
        bane: `Bane ${i / 4 + 1}`,
        starttid: "17:00",
        sluttid: "17:45",
        sæt: [
          { holdA1: p1, holdA2: p2, holdB1: p3, holdB2: p4, scoreA: 0, scoreB: 0 },
          { holdA1: p1, holdA2: p3, holdB1: p2, holdB2: p4, scoreA: 0, scoreB: 0 },
          { holdA1: p1, holdA2: p4, holdB1: p2, holdB2: p3, scoreA: 0, scoreB: 0 },
        ],
      };

      nyeKampe.push(kamp);
    }

    setKampe(nyeKampe);
  };

  const ScoreEditor = ({ value, onChange }: { value: number; onChange: (val: number) => void }) => {
    const [editing, setEditing] = useState(false);
    const [temp, setTemp] = useState(value.toString());

    return editing ? (
      <input
        autoFocus
        value={temp}
        onChange={(e) => setTemp(e.target.value)}
        onBlur={() => {
          const parsed = parseInt(temp);
          onChange(isNaN(parsed) ? 0 : parsed);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            const parsed = parseInt(temp);
            onChange(isNaN(parsed) ? 0 : parsed);
            setEditing(false);
          }
        }}
        className="w-10 text-center border border-gray-300 rounded text-xs py-[1px]"
      />
    ) : (
      <span
        className="w-10 text-center cursor-pointer"
        onClick={() => setEditing(true)}
      >
        {value}
      </span>
    );
  };

  // 💡 Midlertidige IDs til beregning
  const sætMedId = kampe.flatMap((kamp, kampIndex) =>
    kamp.sæt.map((sæt, sætIndex) => ({
      ...sæt,
      id: `event-kamp${kampIndex}-sæt${sætIndex}`,
      date: "2025-01-01", // dummy dato
    }))
  );

  const { eloChanges } = beregnEloForKampe(sætMedId, eloMap);

  const samletDiff: Record<string, number> = {};
  Object.values(eloChanges).forEach((ændringer) => {
    Object.entries(ændringer).forEach(([navn, change]) => {
      samletDiff[navn] = (samletDiff[navn] ?? 0) + change.diff;
    });
  });

  function getEmojiForEloDiff(diff: number): string {
    if (diff >= 100) return "🍾";
    if (diff >= 50) return "🏆";
    if (diff >= 40) return "🥇";
    if (diff >= 30) return "☄️";
    if (diff >= 20) return "🏸";
    if (diff >= 10) return "🔥";
    if (diff >= 5) return "📈";
    if (diff >= 0) return "💪";
    if (diff > -5) return "🎲";
    if (diff > -10) return "📉";
    if (diff > -20) return "🧯";
    if (diff > -30) return "🪂";
    if (diff > -40) return "❄️";
    if (diff > -50) return "💩";
    if (diff > -100) return "🥊";
    return "🙈";
  }

  return (
    <div className="flex flex-row gap-4 p-4 h-screen overflow-hidden font-sans text-xs">
      <div className="w-1/5 bg-white rounded-xl shadow p-3 flex flex-col">
        <h2 className="text-sm font-semibold mb-2">👥 Spillere</h2>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tilføj spiller..."
          className="w-full border border-gray-300 rounded px-2 py-1 text-xs mb-2"
        />
        {search.length > 0 && (
          <div className="bg-white border border-gray-200 rounded max-h-48 overflow-y-auto shadow text-xs">
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
                  className="px-2 py-1 hover:bg-pink-100 cursor-pointer"
                >
                  {spiller.visningsnavn} ({Math.round(spiller.elo ?? 1000)})
                </div>
              ))}
          </div>
        )}
        <div className="flex-1 overflow-y-auto space-y-1 mt-2 max-h-[calc(100vh-200px)]">
          {valgteSpillere.map((spiller) => (
            <div
              key={spiller.visningsnavn}
              className="flex justify-between bg-pink-100 rounded px-2 py-1"
            >
              <span className="truncate">
                {spiller.visningsnavn} ({Math.round(spiller.elo ?? 1000)})
              </span>
              <button
                onClick={() => fjernSpiller(spiller.visningsnavn)}
                className="text-red-500 text-sm"
              >
                🗑
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={lavEventFraSpillere}
          className="mt-2 bg-green-600 text-white text-xs rounded px-2 py-1 hover:bg-green-700"
        >
          ✅ Lav event
        </button>
      </div>

      <div className="w-4/5 flex gap-4">
        <div className="w-3/4 bg-white rounded-xl shadow p-3 overflow-y-auto text-xs">
          <h2 className="text-sm font-semibold mb-2">🎾 Kampe</h2>

          {kampe.map((kamp, kampIndex) => (
            <div key={kamp.id} className="mb-4 border border-pink-300 rounded p-2">
              <div className="text-[10px] text-gray-500 mb-1">
                🏟 {kamp.bane} ⏰ {kamp.starttid} - {kamp.sluttid}
              </div>
              {kamp.sæt.map((sæt, sætIndex) => {
                const id = `event-kamp${kampIndex}-sæt${sætIndex}`;
                const ændringer = eloChanges[id];
                const vinderPoint =
                  ændringer &&
                  Math.max(
                    ...Object.values(ændringer)
                      .map((e) => e.diff)
                      .filter((d) => d > 0)
                  );

                return (
                  <div key={sætIndex} className="flex items-center gap-1 relative">
                    <div className="w-[240px] truncate">{sæt.holdA1} & {sæt.holdA2}</div>
                    <ScoreEditor
                      value={sæt.scoreA}
                      onChange={(val) => {
                        setKampe((prev) =>
                          prev.map((k, i) =>
                            i === kampIndex
                              ? {
                                  ...k,
                                  sæt: k.sæt.map((s, j) =>
                                    j === sætIndex ? { ...s, scoreA: val } : s
                                  ),
                                }
                              : k
                          )
                        );
                      }}
                    />
                    <span>-</span>
                    <ScoreEditor
                      value={sæt.scoreB}
                      onChange={(val) => {
                        setKampe((prev) =>
                          prev.map((k, i) =>
                            i === kampIndex
                              ? {
                                  ...k,
                                  sæt: k.sæt.map((s, j) =>
                                    j === sætIndex ? { ...s, scoreB: val } : s
                                  ),
                                }
                              : k
                          )
                        );
                      }}
                    />
                    <div className="w-[240px] truncate text-right">{sæt.holdB1} & {sæt.holdB2}</div>

                    {vinderPoint > 0 && (
                      <div className="absolute right-0 text-pink-600 text-[10px] font-bold">
                        +{vinderPoint}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div className="w-1/4 bg-white rounded-xl shadow p-3 overflow-y-auto text-xs">
          <h2 className="text-sm font-semibold mb-2">📈 Elo-ændringer</h2>
          {Object.entries(samletDiff)
            .sort(([, a], [, b]) => b - a)
            .map(([navn, diff]) => (
              <div key={navn} className="flex justify-between items-center mb-1">
                <div className="truncate">{navn}</div>
                <div className={`font-semibold ${diff >= 0 ? "text-green-600" : "text-red-500"}`}>
                  {getEmojiForEloDiff(diff)} {diff > 0 ? "+" : ""}
                  {diff}
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

