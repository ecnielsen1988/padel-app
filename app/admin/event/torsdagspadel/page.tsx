"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { beregnEloForKampe } from "@/lib/beregnElo";

// ===== Typer =====
export type Spiller = {
  visningsnavn: string;
  elo?: number;
  tidligste_tid?: string | null; // HH:MM eller timestamp
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
  starttid: string; // 'HH:MM'
  sluttid: string;  // 'HH:MM'
  sæt: Sæt[];
};

type DraftPayload = {
  valgteSpillere: Spiller[];
  kampe: Kamp[];
  savedAt: string;
};

const DRAFT_KEY = "torsdagspadel"; // unik kladde pr. bruger for torsdag

// ===== Hjælpere =====
const erFærdigtSæt = (a: number, b: number) => {
  const max = Math.max(a, b);
  const min = Math.min(a, b);
  return (max === 6 && min <= 4) || (max === 7 && (min === 5 || min === 6));
};

function getNextThursdayISO(): string {
  const nowCph = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Copenhagen" }));
  const day = nowCph.getDay(); // 0=søn ... 4=tors
  let addDays = (4 - day + 7) % 7;
  if (addDays === 0) addDays = 7; // altid NÆSTE torsdag
  const d = new Date(nowCph);
  d.setDate(nowCph.getDate() + addDays);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatTime(value?: string | null) {
  if (!value) return "";
  const hhmm = value?.toString().match(/\d{2}:\d{2}/)?.[0];
  if (hhmm) return hhmm;
  try {
    const d = new Date(value as string);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch {
    return value ?? "";
  }
}

function emojiForPluspoint(p: number) {
  if (p >= 100) return "🍾";
  if (p >= 50) return "🏆";
  if (p >= 40) return "🏅";
  if (p >= 30) return "☄️";
  if (p >= 20) return "🚀";
  if (p >= 10) return "🔥";
  if (p >= 5) return "📈";
  if (p >= 0) return "💪";
  if (p > -5) return "🎲";
  if (p > -10) return "📉";
  if (p > -20) return "🧯";
  if (p > -30) return "🪂";
  if (p > -40) return "❄️";
  if (p > -50) return "🙈";
  if (p > -100) return "🥊";
  if (p > -150) return "💩";
  return "💩💩";
}

// === NY HJÆLPER: rehydrer spillere med nyeste Elo og sortér efter Elo
function withLatestElo(players: Spiller[], map: Record<string, number>) {
  return players
    .map((p) => ({
      ...p,
      elo: map[p.visningsnavn] ?? p.elo ?? 1000,
    }))
    .sort((a, b) => (b.elo ?? 0) - (a.elo ?? 0));
}

export default function EventLayout() {
  const [alleSpillere, setAlleSpillere] = useState<Spiller[]>([]);
  const [valgteSpillere, setValgteSpillere] = useState<Spiller[]>([]);
  const [eloMap, setEloMap] = useState<Record<string, number>>({});
  const [kampe, setKampe] = useState<Kamp[]>([]);
  const [search, setSearch] = useState("");

  const [busy, setBusy] = useState<null | "saving" | "loading" | "publishing">(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  // Hent kun torsdagsprofiler + signups for næste torsdag, og forudfyld valgte spillere
  useEffect(() => {
    const hentData = async () => {
      // Elo-map fra API
      const res = await fetch("/api/rangliste");
      const rangliste = await res.json();
      const map: Record<string, number> = {};
      (rangliste || []).forEach((s: any) => {
        map[s.visningsnavn] = Math.round(s.elo);
      });
      setEloMap(map);

      // Kun torsdagsflag-profiler
      const { data: profiles } = await supabase
        .from("profiles")
        .select("visningsnavn")
        .eq("torsdagspadel", true);

      const thursdayISO = getNextThursdayISO();

      // Signups for den kommende torsdag
      const { data: signups } = await supabase
        .from("event_signups")
        .select("visningsnavn, kan_spille, tidligste_tid, event_dato")
        .eq("event_dato", thursdayISO);

      const signupByName = new Map((signups ?? []).map((s) => [s.visningsnavn, s]));

      const spillereMedElo: Spiller[] = (profiles ?? []).map((p) => ({
        visningsnavn: p.visningsnavn,
        elo: map[p.visningsnavn] ?? 1000,
        tidligste_tid: signupByName.get(p.visningsnavn)?.tidligste_tid ?? null,
      }));

      setAlleSpillere(spillereMedElo);

      // Forudfyld med dem der har tilmeldt sig (kan_spille = true)
      const preselected = (profiles ?? [])
        .filter((p) => signupByName.get(p.visningsnavn)?.kan_spille === true)
        .map((p) => ({
          visningsnavn: p.visningsnavn,
          elo: map[p.visningsnavn] ?? 1000,
          tidligste_tid: signupByName.get(p.visningsnavn)?.tidligste_tid ?? null,
        }));

      // Brug altid nyeste Elo (og korrekt sortering) – uanset om der allerede er spillere valgt
      setValgteSpillere((prev) =>
        prev.length ? withLatestElo(prev, map) : withLatestElo(preselected, map)
      );
    };

    hentData();
  }, []);

  // Rehydrer automatisk hvis eloMap ændrer sig senere (fx hvis /api/rangliste opdateres)
  useEffect(() => {
    if (!Object.keys(eloMap).length || !valgteSpillere.length) return;
    setValgteSpillere((prev) => withLatestElo(prev, eloMap));
  }, [eloMap]); // eslint-disable-line react-hooks/exhaustive-deps

  // === Spillere ===
  const tilføjSpiller = (spiller: Spiller) => {
    if (!valgteSpillere.find((s) => s.visningsnavn === spiller.visningsnavn)) {
      const spillerMedElo = {
        ...spiller,
        elo: eloMap[spiller.visningsnavn] ?? 1000,
      };
      setValgteSpillere((prev) =>
        withLatestElo([...prev, spillerMedElo], eloMap)
      );
    }
    setSearch("");
  };

  const fjernSpiller = (visningsnavn: string) => {
    setValgteSpillere((prev) => prev.filter((s) => s.visningsnavn !== visningsnavn));
  };

  const moveSpillerUp = (index: number) => {
    if (index === 0) return; // øverste kan ikke rykkes op
    setValgteSpillere((prev) => {
      const arr = [...prev];
      [arr[index - 1], arr[index]] = [arr[index], arr[index - 1]];
      return arr;
    });
  };

  // === Kampe ===
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
        sluttid: "18:30",
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
      const base = kamp.sæt[0];

      const rotation = [
        [base.holdA1, base.holdA2, base.holdB1, base.holdB2],
        [base.holdA1, base.holdB1, base.holdA2, base.holdB2],
        [base.holdA1, base.holdB2, base.holdA2, base.holdB1],
      ];

      const r = rotation[kamp.sæt.length % 3];

      const nytSæt: Sæt = {
        holdA1: r[0],
        holdA2: r[1],
        holdB1: r[2],
        holdB2: r[3],
        scoreA: 0,
        scoreB: 0,
      };

      const arr = [...prev];
      arr[kampIndex] = { ...kamp, sæt: [...kamp.sæt, nytSæt] };
      return arr;
    });
  };

  const moveKampUp = (kampIndex: number) => {
    if (kampIndex === 0) return;
    setKampe((prev) => {
      const arr = [...prev];
      [arr[kampIndex - 1], arr[kampIndex]] = [arr[kampIndex], arr[kampIndex - 1]];
      return arr;
    });
  };

  // Elo-preview
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
    if (sæt.scoreA === 0 && sæt.scoreB === 0) return;
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

  // ======== KLADDE: GEM / HENT ========
  const saveDraft = async () => {
    setBusy("saving");
    try {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;
      if (!user) {
        alert("❌ Du skal være logget ind for at gemme kladden.");
        return;
      }
      const { data: profil } = await supabase
        .from("profiles")
        .select("visningsnavn")
        .eq("id", user.id)
        .single();

      const vn = profil?.visningsnavn;
      if (!vn) {
        alert("❌ Kunne ikke finde dit visningsnavn.");
        return;
      }

      const payload: DraftPayload = {
        valgteSpillere,
        kampe,
        savedAt: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("event_drafts")
        .upsert(
          [
            {
              visningsnavn: vn,
              draft_key: DRAFT_KEY,
              payload,
            },
          ],
          {
            onConflict: "visningsnavn, draft_key",
          }
        );

      if (error) throw error;

      localStorage.setItem("event_draft_torsdag", JSON.stringify(payload));
      setLastSavedAt(payload.savedAt);
      alert("💾 Torsdagskladde gemt!");
    } catch (e) {
      console.error(e);
      alert("❌ Kunne ikke gemme kladden.");
    } finally {
      setBusy(null);
    }
  };

  const loadDraft = async () => {
    setBusy("loading");
    try {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;

      let loaded: DraftPayload | null = null;

      if (user) {
        const { data: profil } = await supabase
          .from("profiles")
          .select("visningsnavn")
          .eq("id", user.id)
          .single();

        const vn = profil?.visningsnavn;
        if (vn) {
          const { data } = await supabase
            .from("event_drafts")
            .select("payload")
            .eq("visningsnavn", vn)
            .eq("draft_key", DRAFT_KEY)
            .maybeSingle();

          if (data?.payload) loaded = data.payload as DraftPayload;
        }
      }

      if (!loaded) {
        const raw = localStorage.getItem("event_draft_torsdag");
        if (raw) loaded = JSON.parse(raw) as DraftPayload;
      }

      if (!loaded) {
        alert("Ingen torsdagskladde fundet.");
        return;
      }

      // Sæt fra kladden
      setValgteSpillere(loaded.valgteSpillere ?? []);
      setKampe(loaded.kampe ?? []);
      setLastSavedAt(loaded.savedAt ?? null);

      // NYT: Rehydrer med nyeste Elo (hvis eloMap allerede er der)
      setValgteSpillere((prev) => withLatestElo(prev, eloMap));

      alert("📥 Kladde indlæst!");
    } catch (e) {
      console.error(e);
      alert("❌ Kunne ikke indlæse kladden.");
    } finally {
      setBusy(null);
    }
  };

  const publicerEventPlan = async () => {
    setBusy("publishing");
    try {
      const ok = window.confirm("Publicér eventplanen så spillerne kan se deres kampe?");
      if (!ok) return;

      const eventDato = getNextThursdayISO();

      const rows = kampe.flatMap((kamp, kampIndex) =>
        kamp.sæt.map((sæt, sætIndex) => ({
          event_dato: eventDato,
          kamp_nr: kampIndex + 1,
          saet_nr: sætIndex + 1,
          bane: kamp.bane,
          starttid: kamp.starttid,
          sluttid: kamp.sluttid,
          holda1: sæt.holdA1,
          holda2: sæt.holdA2,
          holdb1: sæt.holdB1,
          holdb2: sæt.holdB2,
        }))
      );

      await supabase.from("event_sets").delete().eq("event_dato", eventDato);

      const { error } = await supabase.from("event_sets").insert(rows);
      if (error) throw error;

      alert("📢 Eventplan publiceret – spillerne kan nu se deres kampe!");
    } catch (e: any) {
      alert("❌ Kunne ikke publicere planen: " + (e?.message ?? "ukendt fejl"));
    } finally {
      setBusy(null);
    }
  };

  const sendEventResultater = async () => {
    const ok = window.confirm(
      "Er du sikker på, at du vil indsende alle resultater?\n\nDette vil slette event-data og indsende alle sæt permanent til ranglisten."
    );
    if (!ok) return;

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      alert("❌ Du skal være logget ind for at indsende resultater.");
      return;
    }

    const { data: profil, error: profilError } = await supabase
      .from("profiles")
      .select("visningsnavn")
      .eq("id", user.id)
      .single();

    if (profilError || !profil?.visningsnavn) {
      alert("❌ Kunne ikke finde dit brugernavn.");
      return;
    }

    const visningsnavn = profil.visningsnavn;
    const { data: maxData } = await supabase
      .from("newresults")
      .select("kampid")
      .not("kampid", "is", null)
      .order("kampid", { ascending: false })
      .limit(1);

    const startKampid = (maxData?.[0]?.kampid || 0) + 1;

    const alleSaet = kampe.flatMap((kamp) =>
      kamp.sæt
        .filter((s) => !(s.scoreA === 0 && s.scoreB === 0))
        .map((sæt) => {
          const score = [sæt.scoreA, sæt.scoreB];
          const finish = score[0] === 0 && score[1] === 0 ? false : erFærdigtSæt(score[0], score[1]);
          return {
            ...sæt,
            finish,
            date: new Date().toISOString().split("T")[0],
            event: true,
            tiebreak: "false",
          };
        })
    );

    const grupper: Record<string, any[]> = {};
    for (const sæt of alleSaet) {
      const key = [sæt.holdA1, sæt.holdA2, sæt.holdB1, sæt.holdB2].sort().join("-");
      if (!grupper[key]) grupper[key] = [];
      grupper[key].push(sæt);
    }

    const resultater = Object.values(grupper)
      .map((saetGruppe, i) =>
        saetGruppe.map((sæt) => ({
          ...sæt,
          kampid: startKampid + i,
          indberettet_af: visningsnavn,
        }))
      )
      .flat();

    const { error } = await supabase.from("newresults").insert(resultater);

    if (error) {
      alert("❌ Noget gik galt: " + error.message);
    } else {
      alert("✅ Resultaterne er indsendt! 🎉");
      setKampe([]);
      setValgteSpillere([]);
    }
  };

  // UI helpers
  const nextThursdayLabel = useMemo(() => {
    const iso = getNextThursdayISO();
    try {
      return new Date(iso + "T00:00:00").toLocaleDateString("da-DK", {
        weekday: "long",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });
    } catch {
      return iso;
    }
  }, []);

  // ======== RENDER ========
  return (
    <div className="flex gap-4 p-4 h-screen overflow-auto bg-white text-black dark:bg-zinc-900 dark:text-white">
      {/* Venstre kolonne */}
      <div className="w-1/5 p-3 rounded shadow bg-zinc-100 dark:bg-zinc-800">
        <h2 className="font-semibold mb-1">👥 Spillere ({valgteSpillere.length})</h2>
        <p className="text-[11px] text-zinc-500 mb-2">Næste event: {nextThursdayLabel}</p>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tilføj spiller... (torsdagspadel)"
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
                  <span className="flex items-center gap-2">
                    {spiller.visningsnavn}
                    {spiller.tidligste_tid && (
                      <span className="text-[11px] text-zinc-500 dark:text-zinc-300">
                        ({formatTime(spiller.tidligste_tid)})
                      </span>
                    )}
                  </span>
                  <span className="text-gray-500 dark:text-gray-300">
                    {Math.round(spiller.elo ?? 1000)}
                  </span>
                </div>
              ))}
          </div>
        )}

        <div className="mt-3">
          {valgteSpillere.map((spiller, idx) => (
            <React.Fragment key={spiller.visningsnavn}>
              <div className="flex justify-between items-center bg-pink-100 dark:bg-zinc-700 rounded px-2 py-1 text-xs mb-1">
                <span className="flex items-center gap-2">
                  <span className="truncate">{spiller.visningsnavn}</span>
                  {spiller.tidligste_tid && (
                    <span className="text-[11px] text-zinc-600 dark:text-zinc-300">({formatTime(spiller.tidligste_tid)})</span>
                  )}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-600 dark:text-gray-300">
                    {Math.round(spiller.elo ?? 1000)}
                  </span>
                  <button
                    onClick={() => moveSpillerUp(idx)}
                    disabled={idx === 0}
                    className="text-xs inline-flex items-center rounded border px-2 py-0.5 disabled:opacity-40"
                    title="Ryk spilleren én plads op"
                  >
                    ▲
                  </button>
                  <button
                    onClick={() => fjernSpiller(spiller.visningsnavn)}
                    className="text-red-500"
                    title="Fjern spiller"
                  >
                    🗑
                  </button>
                </div>
              </div>

              {/* Divider efter hver 4. spiller (men ikke efter sidste) */}
              {((idx + 1) % 4 === 0) && idx !== valgteSpillere.length - 1 && (
                <div className="-mx-1 my-2 h-px bg-zinc-300 dark:bg-zinc-600 opacity-60" />
              )}
            </React.Fragment>
          ))}
        </div>

        <button
          onClick={lavEventFraSpillere}
          disabled={kampe.some((kamp) => kamp.sæt.some((sæt) => sæt.scoreA !== 0 || sæt.scoreB !== 0))}
          className={`mt-2 text-xs rounded px-2 py-1 font-semibold transition ${
            kampe.some((kamp) => kamp.sæt.some((sæt) => sæt.scoreA !== 0 || sæt.scoreB !== 0))
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
            <div className="mb-2 flex items-center justify-between">
              <div>
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

              <button
                onClick={() => moveKampUp(kampIndex)}
                disabled={kampIndex === 0}
                className="ml-3 inline-flex items-center rounded-xl border px-3 py-1 text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Ryk kampen én plads op"
                title="Ryk kampen én plads op"
              >
                ▲
              </button>
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
                      const updated = [...kampe];
                      if (!isNaN(val) && val >= 0 && val <= 7) {
                        updated[kampIndex].sæt[sætIndex].scoreA = val;
                      } else if (e.target.value === "") {
                        updated[kampIndex].sæt[sætIndex].scoreA = 0;
                      }
                      setKampe(updated);
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
                      const updated = [...kampe];
                      if (!isNaN(val) && val >= 0 && val <= 7) {
                        updated[kampIndex].sæt[sætIndex].scoreB = val;
                      } else if (e.target.value === "") {
                        updated[kampIndex].sæt[sætIndex].scoreB = 0;
                      }
                      setKampe(updated);
                    }}
                    className="w-8 border text-center text-xs bg-white dark:bg-zinc-700 dark:text-white"
                  />
                  <div className="w-1/3 truncate text-right">{sæt.holdB1} & {sæt.holdB2}</div>
                  <div className="text-pink-600 text-xs font-bold">{visPoint(sætId)}</div>
                </div>
              );
            })}
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
            const emoji = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : emojiForPluspoint(diff);
            const sizeClass = index === 0 ? "text-base font-bold" : index === 1 ? "text-sm font-semibold" : index === 2 ? "text-sm" : "text-xs";
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

        {/* Knapper */}
        <div className="mt-4 grid gap-2">
          <button
            onClick={saveDraft}
            disabled={busy === "saving"}
            className="bg-zinc-900/80 dark:bg-zinc-200 dark:text-zinc-900 text-white px-3 py-1 rounded text-sm hover:opacity-90 disabled:opacity-50"
          >
            {busy === "saving" ? "Gemmer..." : "💾 Gem torsdagskladde"}
          </button>
          <button
            onClick={loadDraft}
            disabled={busy === "loading"}
            className="bg-zinc-700/80 dark:bg-zinc-300 dark:text-zinc-900 text-white px-3 py-1 rounded text-sm hover:opacity-90 disabled:opacity-50"
          >
            {busy === "loading" ? "Henter..." : "📥 Hent torsdagskladde"}
          </button>
          <button
            onClick={publicerEventPlan}
            disabled={busy === "publishing"}
            className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700 disabled:opacity-50"
          >
            {busy === "publishing" ? "Publicerer..." : "📢 Publicér eventplan"}
          </button>
        </div>

        <div className="mt-3 text-center">
          <button onClick={sendEventResultater} className="bg-pink-600 text-white px-3 py-1 rounded text-sm hover:bg-pink-700">
            ✅ Indsend resultater
          </button>
          {lastSavedAt && (
            <p className="text-[11px] text-zinc-500 mt-2">Sidst gemt: {new Date(lastSavedAt).toLocaleString("da-DK")}</p>
          )}
        </div>
      </div>
    </div>
  );
}

