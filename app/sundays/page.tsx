"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { beregnEloForKampe } from "@/lib/beregnElo";

// ===== Konstanter: baner og timeslots (søndag) =====
const COURTS = ["Bane 1", "Bane 2", "Bane 3", "Bane 5", "Bane 6"] as const;
const SLOTS = [
  { id: 1, label: "13:00–14:40", start: "13:00", end: "14:40" },
  { id: 2, label: "15:00–16:30", start: "15:00", end: "16:30" },
  { id: 3, label: "16:30–18:00", start: "16:30", end: "18:00" },
] as const;

export type Spiller = {
  visningsnavn: string;
  elo?: number;
  // Hvilke søndagsslots spilleren kan deltage i – default alle 3
  slots?: number[];
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
  // Valgt slot (1,2,3). start/slut udfyldes automatisk fra SLOTS
  slot: number;
  starttid: string;
  sluttid: string;
  sæt: Sæt[];
};

type DraftPayload = {
  valgteSpillere: Spiller[];
  kampe: Kamp[];
  savedAt: string;
};

// Egen kladde-nøgle til søndage så den ikke konflikter med /makeevent
const DRAFT_KEY = "sundays";

const erFærdigtSæt = (a: number, b: number) => {
  const max = Math.max(a, b);
  const min = Math.min(a, b);
  return (
    (max === 6 && min <= 4) ||
    (max === 7 && (min === 5 || min === 6))
  );
};

function getNextSundayISO(): string {
  const nowCph = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Copenhagen" }));
  const day = nowCph.getDay(); // 0 = søndag
  let addDays = (7 - day) % 7; // hvor mange dage til næste søndag
  if (addDays === 0) addDays = 7; // altid NÆSTE søndag
  const d = new Date(nowCph);
  d.setDate(nowCph.getDate() + addDays);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
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

export default function SundaysPage() {
  const [alleSpillere, setAlleSpillere] = useState<Spiller[]>([]);
  const [valgteSpillere, setValgteSpillere] = useState<Spiller[]>([]);
  const [eloMap, setEloMap] = useState<Record<string, number>>({});
  const [kampe, setKampe] = useState<Kamp[]>([]);
  const [search, setSearch] = useState("");

  const [busy, setBusy] = useState<null | "saving" | "loading">(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

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
        slots: [1, 2, 3], // default alle slots
      }));

      setAlleSpillere(spillereMedElo);
    };

    hentData();
  }, []);

  const tilføjSpiller = (spiller: Spiller) => {
    if (!valgteSpillere.find((s) => s.visningsnavn === spiller.visningsnavn)) {
      const spillerMedElo: Spiller = {
        ...spiller,
        elo: eloMap[spiller.visningsnavn] ?? 1000,
        slots: spiller.slots && spiller.slots.length ? spiller.slots : [1, 2, 3],
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

  const toggleSlotForSpiller = (visningsnavn: string, slotId: number) => {
    setValgteSpillere((prev) =>
      prev.map((s) => {
        if (s.visningsnavn !== visningsnavn) return s;
        const curr = new Set(s.slots ?? [1, 2, 3]);
        if (curr.has(slotId)) curr.delete(slotId); else curr.add(slotId);
        const next = Array.from(curr).sort();
        return { ...s, slots: next };
      })
    );
  };

  const lavEventFraSpillere = () => {
    const slotCfg = SLOTS[0];
    const nyeKampe: Kamp[] = [];
    for (let i = 0; i < valgteSpillere.length; i += 4) {
      const gruppe = valgteSpillere.slice(i, i + 4);
      if (gruppe.length < 4) continue;

      const [p1, p2, p3, p4] = gruppe.map((s) => s.visningsnavn);
      nyeKampe.push({
        id: `kamp${i / 4 + 1}`,
        bane: `Bane ${i / 4 + 1}`,
        slot: 1,
        starttid: slotCfg.start,
        sluttid: slotCfg.end,
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

  const moveSpillerUp = (index: number) => {
    if (index === 0) return; // øverste kan ikke rykkes op
    setValgteSpillere((prev) => {
      const arr = [...prev];
      [arr[index - 1], arr[index]] = [arr[index], arr[index - 1]];
      return arr;
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

  const moveKampUp = (kampIndex: number) => {
    if (kampIndex === 0) return; // øverste kan ikke rykkes op
    setKampe((prev) => {
      const arr = [...prev];
      [arr[kampIndex - 1], arr[kampIndex]] = [arr[kampIndex], arr[kampIndex - 1]];
      return arr;
    });
  };

  const sendEventResultater = async () => {
    const confirm = window.confirm(
      `Er du sikker på, at du vil indsende alle resultater?

Dette vil slette event-data og indsende alle sæt permanent til ranglisten.`
    );
    if (!confirm) return;

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

    // Saml alle sæt i én flad liste
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

    // Gruppér sæt efter de samme spillere
    const grupper: Record<string, any[]> = {};
    for (const sæt of alleSaet) {
      const key = [sæt.holdA1, sæt.holdA2, sæt.holdB1, sæt.holdB2].sort().join("-");
      if (!grupper[key]) grupper[key] = [];
      grupper[key].push(sæt);
    }

    // Lav resultater med kampid
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

      // Supabase: gem/overskriv din kladde
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
          { onConflict: "visningsnavn, draft_key" }
        );

      if (error) throw error;

      // Lokal fallback
      localStorage.setItem("event_draft_sundays", JSON.stringify(payload));
      setLastSavedAt(payload.savedAt);
      alert("💾 Søndagskladde gemt!");
    } catch (e: any) {
      console.error(e);
      alert("❌ Kunne ikke gemme kladden.");
    } finally {
      setBusy(null);
    }
  };

  const publicerEventPlan = async () => {
    const ok = window.confirm("Publicér søndagsplanen så spillerne kan se deres kampe?");
    if (!ok) return;

    const eventDato = getNextSundayISO();

    // Fladgør kampe -> sæt-rækker til event_sets
    const rows = kampe.flatMap((kamp, kampIndex) =>
      kamp.sæt.map((sæt, sætIndex) => ({
        event_dato: eventDato,
        kamp_nr: kampIndex + 1,
        saet_nr: sætIndex + 1,
        bane: kamp.bane,
        starttid: kamp.starttid, // 'HH:MM'
        sluttid: kamp.sluttid,   // 'HH:MM'
        holda1: sæt.holdA1,
        holda2: sæt.holdA2,
        holdb1: sæt.holdB1,
        holdb2: sæt.holdB2,
      }))
    );

    // ryd eksisterende plan for datoen (ellers kan unique index konflikte)
    await supabase.from("event_sets").delete().eq("event_dato", eventDato);

    const { error } = await supabase.from("event_sets").insert(rows);
    if (error) {
      alert("❌ Kunne ikke publicere planen: " + error.message);
    } else {
      alert("📢 Søndagsplan publiceret – spillerne kan nu se deres kampe!");
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
            .single();

          if (data?.payload) loaded = data.payload as DraftPayload;
        }
      }

      if (!loaded) {
        // fallback til localStorage
        const raw = localStorage.getItem("event_draft_sundays");
        if (raw) loaded = JSON.parse(raw) as DraftPayload;
      }

      if (!loaded) {
        alert("Ingen søndagskladde fundet.");
        return;
      }

      // Normalisér data i tilfælde af gamle kladder uden slots/slot
      const normSpillere = (loaded.valgteSpillere ?? []).map((v) => ({
        ...v,
        slots: v.slots && v.slots.length ? v.slots : [1, 2, 3],
      }));
      const normKampe = (loaded.kampe ?? []).map((k) => {
        const slot = k.slot ?? 1;
        const cfg = SLOTS.find((s) => s.id === slot)!;
        return {
          ...k,
          slot,
          starttid: k.starttid || cfg.start,
          sluttid: k.sluttid || cfg.end,
        } as Kamp;
      });

      setValgteSpillere(normSpillere);
      setKampe(normKampe);
      setLastSavedAt(loaded.savedAt ?? null);
      alert("📥 Søndagskladde indlæst!");
    } catch (e: any) {
      console.error(e);
      alert("❌ Kunne ikke indlæse kladden.");
    } finally {
      setBusy(null);
    }
  };
  // ======== /KLADDE ========

  const eventDatoLabel = (() => {
    const iso = getNextSundayISO();
    try {
      return new Date(iso + "T00:00:00").toLocaleDateString("da-DK", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
    } catch {
      return iso;
    }
  })();

  // Overblik: hvor mange spillere har tilmeldt hvert slot
  const slotCounts = SLOTS.reduce<Record<number, number>>((acc, s) => {
    acc[s.id] = valgteSpillere.filter((v) => (v.slots ?? [1, 2, 3]).includes(s.id)).length;
    return acc;
  }, {} as any);

  return (
    <div className="flex gap-4 p-4 h-screen overflow-auto bg-white text-black dark:bg-zinc-900 dark:text-white">
      {/* Venstre kolonne */}
      <div className="w-1/5 p-3 rounded shadow bg-zinc-100 dark:bg-zinc-800">
        <h1 className="font-bold mb-1">🌞 Søndagsrangliste</h1>
        <p className="text-[11px] text-zinc-500 mb-2">Næste event: {eventDatoLabel}</p>

                <div className="mb-2 text-[11px] text-zinc-600 dark:text-zinc-300">
          <span className="font-medium mr-1">Timeslots:</span>
          {SLOTS.map((s) => (
            <span key={s.id} className="mr-2">{s.id}: {s.label}</span>
          ))}
        </div>

        {/* Overblik over tilmeldinger pr. slot */}
        <div className="mb-3 p-2 rounded bg-zinc-50 dark:bg-zinc-700">
          <h3 className="font-semibold text-sm mb-1">🕒 Tilmeldinger pr. slot</h3>
          {SLOTS.map((s) => (
            <div key={s.id} className="flex justify-between text-xs">
              <span>{`Slot ${s.id} (${s.label})`}</span>
              <span>{slotCounts[s.id] ?? 0}</span>
            </div>
          ))}
        </div>

        <h2 className="font-semibold mb-2">👥 Spillere ({valgteSpillere.length})</h2>

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
          {valgteSpillere.map((spiller, idx) => (
            <div key={spiller.visningsnavn} className="bg-pink-100 dark:bg-zinc-700 rounded px-2 py-1 text-xs">
              <div className="flex justify-between items-center">
                <span className="truncate mr-2">{spiller.visningsnavn}</span>
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
                  >
                    🗑
                  </button>
                </div>
              </div>
              {/* Slot toggles */}
              <div className="mt-1 flex gap-1">
                {SLOTS.map((s) => {
                  const selected = (spiller.slots ?? [1,2,3]).includes(s.id);
                  return (
                    <button
                      key={s.id}
                      onClick={() => toggleSlotForSpiller(spiller.visningsnavn, s.id)}
                      title={`Slot ${s.id}: ${s.label}`}
                      className={`px-2 py-0.5 rounded text-[11px] border ${selected ? "bg-green-600 text-white border-green-700" : "bg-zinc-300 dark:bg-zinc-600 text-zinc-900 dark:text-zinc-100 border-transparent"}`}
                    >
                      {s.id}
                    </button>
                  );
                })}
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
          ✅ Lav søndags-event
        </button>
      </div>

      {/* Midterste kolonne */}
      <div className="w-3/5 space-y-4">
        {kampe.map((kamp, kampIndex) => {
          const base = kamp.sæt[0];
          const kampSpillere = [base.holdA1, base.holdA2, base.holdB1, base.holdB2];
          const slotCfg = SLOTS.find((s) => s.id === kamp.slot)!;
          const utilgængelige = kampSpillere.filter((navn) => {
            const sp = valgteSpillere.find((v) => v.visningsnavn === navn);
            const allowed = sp ? (sp.slots ?? [1,2,3]) : [1,2,3];
            return !allowed.includes(kamp.slot);
          });

          return (
            <div key={kamp.id} className="p-3 rounded bg-zinc-100 dark:bg-zinc-800">
              <div className="mb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {/* Bane dropdown */}
                    <select
                      value={kamp.bane}
                      onChange={(e) => {
                        const updated = [...kampe];
                        updated[kampIndex].bane = e.target.value;
                        setKampe(updated);
                      }}
                      className="text-sm border px-1 bg-white dark:bg-zinc-700 dark:text-white rounded"
                    >
                      {COURTS.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>

                    {/* Slot dropdown */}
                    <select
                      value={kamp.slot}
                      onChange={(e) => {
                        const newSlot = Number(e.target.value);
                        const cfg = SLOTS.find((s) => s.id === newSlot)!;
                        const updated = [...kampe];
                        updated[kampIndex].slot = newSlot;
                        updated[kampIndex].starttid = cfg.start;
                        updated[kampIndex].sluttid = cfg.end;
                        setKampe(updated);
                      }}
                      className="text-sm border px-1 bg-white dark:bg-zinc-700 dark:text-white rounded"
                    >
                      {SLOTS.map((s) => (
                        <option key={s.id} value={s.id}>{`Slot ${s.id}: ${s.label}`}</option>
                      ))}
                    </select>

                    <span className="text-[11px] text-zinc-500">{slotCfg.start}–{slotCfg.end}</span>
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

                {utilgængelige.length > 0 && (
                  <div className="mt-1 text-[11px] text-red-600">
                    ⚠️ Ikke tilmeldt i valgt slot: {utilgængelige.join(", ")}
                  </div>
                )}
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
              <button
                onClick={() => genererNæsteSæt(kampIndex)}
                className="mt-2 text-xs text-pink-600 hover:underline"
              >
                ➕ Tilføj sæt
              </button>
            </div>
          );
        })}
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
            {busy === "saving" ? "Gemmer..." : "💾 Gem søndagskladde"}
          </button>
          <button
            onClick={loadDraft}
            disabled={busy === "loading"}
            className="bg-zinc-700/80 dark:bg-zinc-300 dark:text-zinc-900 text-white px-3 py-1 rounded text-sm hover:opacity-90 disabled:opacity-50"
          >
            {busy === "loading" ? "Henter..." : "📥 Hent søndagskladde"}
          </button>
          <button
            onClick={publicerEventPlan}
            className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700"
          >
            📢 Publicér søndagsplan
          </button>
          {lastSavedAt && (
            <p className="text-[11px] text-zinc-500 mt-1">
              Sidst gemt: {new Date(lastSavedAt).toLocaleString("da-DK")}
            </p>
          )}
        </div>

        <div className="mt-4 text-center">
          <button
            onClick={sendEventResultater}
            className="bg-pink-600 text-white px-3 py-1 rounded text-sm hover:bg-pink-700"
          >
            ✅ Indsend resultater
          </button>
        </div>
      </div>
    </div>
  );
}

