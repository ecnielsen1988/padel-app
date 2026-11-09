'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { beregnEloForKampe } from '@/lib/beregnElo';
import { legacyProgramPushSummary } from '@/lib/programNotificationsClient';

// ================== Typer ==================
type Slot = { id: number; label: string; start: string; end: string };
type SlotMode = 'standard' | 'two' | 'manual';

export type Spiller = {
  visningsnavn: string;
  elo?: number;
  slots?: number[]; // de slots spilleren kan (kun brugt i non-manual tilstand)
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
  slot: number;     // 1..N (afhængig af aktive slots). I manual bruges feltet ikke til tider.
  starttid: string; // 'HH:MM'
  sluttid: string;  // 'HH:MM'
  sæt: Sæt[];
};

type DraftPayload = {
  valgteSpillere: Spiller[];
  kampe: Kamp[];
  savedAt: string;
  eventDato?: string; // skelne uger
  slotMode?: SlotMode; // gem aktiv tilstand
};

type ProfileNameRow = { visningsnavn: string | null };

// ================== Konstanter ==================
const COURTS: string[] = ['Bane 1', 'Bane 2', 'Bane 3', 'Bane 5', 'Bane 6'];

const DEFAULT_SLOTS: Slot[] = [
  { id: 1, label: '13:00–14:40', start: '13:00', end: '14:40' },
  { id: 2, label: '14:40–16:20', start: '14:40', end: '16:20' },
  { id: 3, label: '16:20–18:00', start: '16:20', end: '18:00' },
];

const TWO_SLOTS: Slot[] = [
  { id: 1, label: '15:00–16:30', start: '15:00', end: '16:30' },
  { id: 2, label: '16:30–18:00', start: '16:30', end: '18:00' },
];

const DRAFT_KEY = 'sundays';

// ================== Hjælpere ==================
const erFærdigtSæt = (a: number, b: number) => {
  const max = Math.max(a, b);
  const min = Math.min(a, b);
  return (max === 6 && min <= 4) || (max === 7 && (min === 5 || min === 6));
};

function getNextSundayISO(): string {
  const nowCph = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Copenhagen' }));
  const day = nowCph.getDay(); // 0 = søndag
  let addDays = (7 - day) % 7;
  if (addDays === 0) addDays = 7; // altid NÆSTE søndag
  const d = new Date(nowCph);
  d.setDate(nowCph.getDate() + addDays);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function emojiForPluspoint(p: number) {
  if (p >= 100) return '🍾';
  if (p >= 50) return '🏆';
  if (p >= 40) return '🥇';
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
  if (p > -50) return '🙈';
  if (p > -100) return '🥊';
  if (p > -150) return '💩';
  return '💩💩';
}

const getSlotsByMode = (mode: SlotMode): Slot[] => {
  switch (mode) {
    case 'two':
      return [...TWO_SLOTS];
    case 'standard':
    default:
      return [...DEFAULT_SLOTS];
  }
};

// ================== Component ==================
export default function SundaysPage() {
  // Dato + slots for netop den kommende søndag
  const [eventDato, setEventDato] = useState<string>(() => getNextSundayISO());
  const [slotMode, setSlotMode] = useState<SlotMode>('standard'); // 👈 standard som ønsket
  const [slots, setSlots] = useState<Slot[]>(getSlotsByMode('standard'));

  // Data
  const [alleSpillere, setAlleSpillere] = useState<Spiller[]>([]);
  const [valgteSpillere, setValgteSpillere] = useState<Spiller[]>([]);
  const [eloMap, setEloMap] = useState<Record<string, number>>({});
  const [kampe, setKampe] = useState<Kamp[]>([]);

  // UI state
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<null | 'saving' | 'loading'>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  // --- Slots opsætning ---
  useEffect(() => {
    // Reset slots når dato/tilstand ændres
    setSlots(getSlotsByMode(slotMode));
  }, [eventDato, slotMode]);

  // Når slotMode ændres (mellem 'standard' og 'two'), opdatér spillernes slot-tilmeldinger
  useEffect(() => {
    if (slotMode === 'manual') return; // i manuel tilstand bruger vi ikke spillerslots
    setValgteSpillere((prev) => {
      const activeIds = new Set<number>(getSlotsByMode(slotMode).map((s) => s.id));
      const fallbackId = [...activeIds][0] ?? 1;
      return prev.map((p) => {
        const curr = new Set<number>((p.slots && p.slots.length ? p.slots : [...activeIds]));
        const next = [...curr].filter((id) => activeIds.has(id)).sort((a, b) => a - b);
        return { ...p, slots: next.length ? next : [fallbackId] };
      });
    });
  }, [slotMode]);

  // --- Hent ELO + profiler ---
  useEffect(() => {
    const hentData = async () => {
      const res = await fetch('/api/rangliste');
      const rangliste = await res.json();
      const map: Record<string, number> = {};
      (rangliste || []).forEach((s: any) => {
        if (s?.visningsnavn) map[(s.visningsnavn as string).trim()] = s.elo;
      });
      setEloMap(map);

      const { data: profiles } = await supabase.from('profiles').select('visningsnavn');
      if (!profiles) return;

      const defaultSlotIds = getSlotsByMode(slotMode).map((s) => s.id);
      const spillereMedElo = (profiles as ProfileNameRow[])
        .map((p) => {
          const navn = (p.visningsnavn || '').trim();
          if (!navn) return null;
          return {
            visningsnavn: navn,
            elo: map[navn] ?? 1000,
            slots: defaultSlotIds, // default = alle aktive slots for DENNE søndag (ikke brugt i manual)
          } as Spiller;
        })
        .filter(Boolean) as Spiller[];

      setAlleSpillere(spillereMedElo);
    };

    hentData();
  }, [slotMode]);

  // === Spillere ===
  const tilføjSpiller = (spiller: Spiller) => {
    const defaultSlotIds = getSlotsByMode(slotMode).map((s) => s.id);
    if (!valgteSpillere.find((s) => s.visningsnavn === spiller.visningsnavn)) {
      const spillerMedElo: Spiller = {
        ...spiller,
        elo: eloMap[spiller.visningsnavn] ?? 1000,
        slots:
          slotMode === 'manual'
            ? spiller.slots // i manual er slots irrelevante
            : spiller.slots && spiller.slots.length
            ? spiller.slots.filter((id) => defaultSlotIds.includes(id))
            : defaultSlotIds,
      };
      setValgteSpillere((prev) =>
        [...prev, spillerMedElo].sort((a, b) => (b.elo ?? 0) - (a.elo ?? 0))
      );
    }
    setSearch('');
  };

  const fjernSpiller = (visningsnavn: string) => {
    setValgteSpillere((prev) => prev.filter((s) => s.visningsnavn !== visningsnavn));
  };

  const toggleSlotForSpiller = (visningsnavn: string, slotId: number) => {
    if (slotMode === 'manual') return; // ingen toggles i manual
    const validIds = new Set(getSlotsByMode(slotMode).map((s) => s.id));
    setValgteSpillere((prev) =>
      prev.map((s) => {
        if (s.visningsnavn !== visningsnavn) return s;
        const curr = new Set<number>((s.slots && s.slots.length ? s.slots : getSlotsByMode(slotMode).map((x) => x.id)).filter((id) => validIds.has(id)));
        if (curr.has(slotId)) curr.delete(slotId);
        else curr.add(slotId);
        const next = [...curr].sort((a, b) => a - b);
        return { ...s, slots: next.length ? next : [getSlotsByMode(slotMode)[0].id] };
      })
    );
  };

  const moveSpillerUp = (index: number) => {
    if (index === 0) return;
    setValgteSpillere((prev) => {
      const arr = [...prev];
      [arr[index - 1], arr[index]] = [arr[index], arr[index - 1]];
      return arr;
    });
  };

  // === Kampe ===
  const slotCfgById = (id: number) => getSlotsByMode(slotMode).find((s) => s.id === id) || getSlotsByMode(slotMode)[0];

  const lavEventFraSpillere = () => {
    const activeSlotIds = getSlotsByMode(slotMode).map((s) => s.id);

    const getSpillerSlots = (navn: string) => {
      const sp = valgteSpillere.find((v) => v.visningsnavn === navn);
      const raw = sp?.slots && sp.slots.length ? sp.slots : activeSlotIds;
      return raw.filter((id) => activeSlotIds.includes(id));
    };

    const commonSlots = (names: string[]) => {
      const asSets = names.map((n) => new Set(getSpillerSlots(n)));
      return activeSlotIds.filter((id) => asSets.every((s) => s.has(id)));
    };

    const chooseSlot = (names: string[]) => {
      const inter = commonSlots(names);
      if (inter.length) return inter[0];
      const scored = activeSlotIds
        .map((id) => ({ id, c: names.filter((n) => getSpillerSlots(n).includes(id)).length }))
        .sort((a, b) => b.c - a.c || a.id - b.id);
      return scored[0]?.id ?? activeSlotIds[0];
    };

    const nyeKampe: Kamp[] = [];

    for (let i = 0; i < valgteSpillere.length; i += 4) {
      const gruppe = valgteSpillere.slice(i, i + 4);
      if (gruppe.length < 4) continue;

      const [p1, p2, p3, p4] = gruppe.map((s) => s.visningsnavn);

      const courtIndex = Math.floor(i / 4);
      const baneNavn = COURTS[courtIndex] ?? COURTS[COURTS.length - 1];

      if (slotMode === 'manual') {
        // Ingen slots – brug manuelle tider (tom som udgangspunkt)
        nyeKampe.push({
          id: `kamp${i / 4 + 1}`,
          bane: baneNavn,
          slot: 1,
          starttid: '',
          sluttid: '',
          sæt: [
            { holdA1: p1, holdA2: p2, holdB1: p3, holdB2: p4, scoreA: 0, scoreB: 0 },
            { holdA1: p1, holdA2: p3, holdB1: p2, holdB2: p4, scoreA: 0, scoreB: 0 },
            { holdA1: p1, holdA2: p4, holdB1: p2, holdB2: p3, scoreA: 0, scoreB: 0 },
          ],
        });
      } else {
        const slotId = chooseSlot([p1, p2, p3, p4]);
        const cfg = slotCfgById(slotId);
        nyeKampe.push({
          id: `kamp${i / 4 + 1}`,
          bane: baneNavn,
          slot: slotId,
          starttid: cfg.start,
          sluttid: cfg.end,
          sæt: [
            { holdA1: p1, holdA2: p2, holdB1: p3, holdB2: p4, scoreA: 0, scoreB: 0 },
            { holdA1: p1, holdA2: p3, holdB1: p2, holdB2: p4, scoreA: 0, scoreB: 0 },
            { holdA1: p1, holdA2: p4, holdB1: p2, holdB2: p3, scoreA: 0, scoreB: 0 },
          ],
        });
      }
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
        date: '2025-01-01',
        finish,
        event: true,
        tiebreak: 'false',
      };
    })
  );

  const { eloChanges } = beregnEloForKampe(sætMedId, eloMap);

  const samletDiff: Record<string, number> = {};
  sætMedId.forEach((sæt) => {
    if (sæt.scoreA === 0 && sæt.scoreB === 0) return;
    const ændringer = eloChanges[sæt.id];
    if (!ændringer) return;
    Object.entries(ændringer).forEach(([navn, change]: any) => {
      samletDiff[navn] = (samletDiff[navn] ?? 0) + change.diff;
    });
  });

  const visPoint = (id: number) => {
    const ændringer = eloChanges[id];
    if (!ændringer) return null;
    const score = sætMedId.find((s) => s.id === id);
    if (!score || (score.scoreA === 0 && score.scoreB === 0)) return null;
    const positives = Object.values(ændringer).map((e: any) => e.diff).filter((v: number) => v > 0);
    const max = positives.length ? Math.max(...positives) : 0;
    return max > 0 ? `+${max.toFixed(1)}` : null;
  };

  // ======== Draft: GEM / HENT ========
  const saveDraft = async () => {
    setBusy('saving');
    try {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;
      if (!user) {
        alert('❌ Du skal være logget ind for at gemme kladden.');
        return;
      }
      const { data: profil } = await supabase
        .from('profiles')
        .select('visningsnavn')
        .eq('id', user.id)
        .maybeSingle<ProfileNameRow>();

      const vn = (profil?.visningsnavn || '').trim();
      if (!vn) {
        alert('❌ Kunne ikke finde dit visningsnavn.');
        return;
      }

      const ids = getSlotsByMode(slotMode).map((s) => s.id);
      const cfgByIdSave = (id: number) => getSlotsByMode(slotMode).find((s) => s.id === id) ?? getSlotsByMode(slotMode)[0];

      // Normalisér: spillere + kampe til aktive slots, men bevar manuelle tider
      const normSpillere = valgteSpillere.map((v) => {
        if (slotMode === 'manual') return v; // slots irrelevant
        const filtered = (v.slots && v.slots.length ? v.slots : ids).filter((id) => ids.includes(id));
        return { ...v, slots: filtered.length ? filtered : [ids[0]] };
      });

      const normKampe = kampe.map((k) => {
        if (slotMode === 'manual') return k; // behold manuelle tider
        const validSlot = ids.includes(k.slot) ? k.slot : ids[0];
        const cfg = cfgByIdSave(validSlot);
        return { ...k, slot: validSlot, starttid: cfg.start, sluttid: cfg.end };
      });

      const payload: DraftPayload = {
        valgteSpillere: normSpillere,
        kampe: normKampe,
        savedAt: new Date().toISOString(),
        eventDato,
        slotMode,
      };

      const qb = supabase.from('event_drafts') as any;
      const { error } = await qb.upsert(
        [{ visningsnavn: vn, draft_key: DRAFT_KEY, payload }],
        { onConflict: 'visningsnavn, draft_key' }
      );

      if (error) throw error;

      localStorage.setItem('event_draft_sundays', JSON.stringify(payload));
      setLastSavedAt(payload.savedAt);
      alert('💾 Søndagskladde gemt!');
    } catch (e) {
      console.error(e);
      alert('❌ Kunne ikke gemme kladden.');
    } finally {
      setBusy(null);
    }
  };

  const loadDraft = async () => {
    setBusy('loading');
    try {
      let loaded: DraftPayload | null = null;

      // 0) Identificér mig (for at hente KUN min kladde)
      const { data: auth } = await supabase.auth.getUser();
      const me = auth?.user ?? null;
      let myName: string | null = null;
      if (me) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('visningsnavn')
          .eq('id', me.id)
          .maybeSingle<ProfileNameRow>();
        myName = (prof?.visningsnavn || '').trim() || null;
      }

      // 1) Hent MIN nyeste kladde for 'sundays'
      if (myName) {
        const { data: mine } = await supabase
          .from('event_drafts')
          .select('payload, updated_at')
          .eq('draft_key', DRAFT_KEY)
          .eq('visningsnavn', myName)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle<{ payload: DraftPayload }>();

        if (mine?.payload) loaded = mine.payload as DraftPayload;
      }

      // 2) Fallback til localStorage
      if (!loaded) {
        const raw = localStorage.getItem('event_draft_sundays');
        if (raw) loaded = JSON.parse(raw) as DraftPayload;
      }

      if (!loaded) {
        alert('Ingen søndagskladde fundet.');
        return;
      }

      const loadedMode: SlotMode = loaded.slotMode ?? 'standard';
      setSlotMode(loadedMode); // triggere slots-opdatering

      // Normalisér til de slots, som hører til kladdens mode; bevar manuelle tider
      const ids = getSlotsByMode(loadedMode).map((s) => s.id);
      const cfgByIdLoad = (id: number) => getSlotsByMode(loadedMode).find((s) => s.id === id) ?? getSlotsByMode(loadedMode)[0];

      const normSpillere = (loaded.valgteSpillere ?? []).map((v) => {
        if (loadedMode === 'manual') return v;
        const filtered = (v.slots && v.slots.length ? v.slots : ids).filter((id) => ids.includes(id));
        return { ...v, slots: filtered.length ? filtered : [ids[0]] };
      });

      const sameDate = loaded.eventDato && loaded.eventDato === eventDato;
      const normKampe = sameDate
        ? (loaded.kampe ?? []).map((k) => {
            if (loadedMode === 'manual') return k; // behold manuelle tider
            const validSlot = ids.includes(k.slot) ? k.slot : ids[0];
            const cfg = cfgByIdLoad(validSlot);
            return { ...k, slot: validSlot, starttid: cfg.start, sluttid: cfg.end } as Kamp;
          })
        : [];

      setValgteSpillere(normSpillere);
      setKampe(normKampe);
      setLastSavedAt(loaded.savedAt ?? null);

      alert('📥 Søndagskladde indlæst!');
    } catch (e) {
      console.error(e);
      alert('❌ Kunne ikke indlæse kladden.');
    } finally {
      setBusy(null);
    }
  };

  // Valgfri: Autosave (lokalt) når spillere/kampe/dato ændres
  useEffect(() => {
    const payload: DraftPayload = {
      valgteSpillere,
      kampe,
      savedAt: new Date().toISOString(),
      eventDato,
      slotMode,
    };
    localStorage.setItem('event_draft_sundays', JSON.stringify(payload));
  }, [valgteSpillere, kampe, eventDato, slotMode]);

  const publicerEventPlan = async () => {
    const ok = window.confirm('Publicér søndagsplanen så spillerne kan se deres kampe?');
    if (!ok) return;

    const eventDatoISO = eventDato;

    const cfgByIdPub = (id: number) => getSlotsByMode(slotMode).find((s) => s.id === id) ?? getSlotsByMode(slotMode)[0];
    const rows = kampe.flatMap((kamp, kampIndex) =>
      kamp.sæt.map((sæt, sætIndex) => {
        const cfg = cfgByIdPub(kamp.slot);
        const start = slotMode === 'manual' ? kamp.starttid : (kamp.starttid && kamp.starttid.includes(':') ? kamp.starttid : cfg.start);
        const slut = slotMode === 'manual' ? kamp.sluttid : (kamp.sluttid && kamp.sluttid.includes(':') ? kamp.sluttid : cfg.end);
        return {
          event_dato: eventDatoISO,
          kamp_nr: kampIndex + 1,
          saet_nr: sætIndex + 1,
          bane: kamp.bane,
          starttid: start,
          sluttid: slut,
          holda1: sæt.holdA1,
          holda2: sæt.holdA2,
          holdb1: sæt.holdB1,
          holdb2: sæt.holdB2,
        };
      })
    );

    if (!rows.length) {
      alert('Ingen kampe at publicere.');
      return;
    }
    const { error: deleteError } = await (supabase.from('event_sets') as any).delete().eq('event_dato', eventDatoISO);
    if (deleteError) {
      alert('❌ Kunne ikke publicere planen: ' + deleteError.message);
      return;
    }

    const { error } = await (supabase.from('event_sets') as any).insert(rows);
    if (error) {
      alert('❌ Kunne ikke publicere planen: ' + error.message);
      return;
    }
    const pushSummary = await legacyProgramPushSummary(eventDatoISO);
    alert('📢 Plan publiceret – spillerne kan nu se deres kampe!' + pushSummary);
  };

  const sendEventResultater = async () => {
    const ok = window.confirm(
      `Er du sikker på, at du vil indsende alle resultater?

Dette vil slette event-data og indsende alle sæt permanent til ranglisten.`
    );
    if (!ok) return;

    const { data: auth, error: userError } = await supabase.auth.getUser();
    const user = auth?.user;

    if (userError || !user) {
      alert('❌ Du skal være logget ind for at indsende resultater.');
      return;
    }

    const { data: profil, error: profilError } = await supabase
      .from('profiles')
      .select('visningsnavn')
      .eq('id', user.id)
      .maybeSingle<ProfileNameRow>();

    if (profilError || !profil?.visningsnavn) {
      alert('❌ Kunne ikke finde dit brugernavn.');
      return;
    }

    const visningsnavn = (profil.visningsnavn || '').trim();

    const { data: maxData } = await supabase
      .from('newresults')
      .select('kampid')
      .not('kampid', 'is', null)
      .order('kampid', { ascending: false })
      .limit(1);

    const startKampid = ((maxData as any)?.[0]?.kampid || 0) + 1;

    // Fladgør sæt (ignorer 0-0)
    const alleSaet = kampe.flatMap((kamp) =>
      kamp.sæt
        .filter((s) => !(s.scoreA === 0 && s.scoreB === 0))
        .map((sæt) => {
          const score = [sæt.scoreA, sæt.scoreB];
          const finish = score[0] === 0 && score[1] === 0 ? false : erFærdigtSæt(score[0], score[1]);
          return {
            ...sæt,
            finish,
            date: new Date().toISOString().split('T')[0],
            event: true,
            tiebreak: 'false',
          };
        })
    );

    // Gruppér sæt pr. kamp (samme 4 spillere)
    const grupper: Record<string, any[]> = {};
    for (const sæt of alleSaet) {
      const key = [sæt.holdA1, sæt.holdA2, sæt.holdB1, sæt.holdB2].sort().join('-');
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

    const { error } = await (supabase.from('newresults') as any).insert(resultater);

    if (error) {
      alert('❌ Noget gik galt: ' + error.message);
    } else {
      alert('✅ Resultaterne er indsendt! 🎉');
      setKampe([]);
      setValgteSpillere([]);
    }
  };

  // UI helpers
  const eventDatoLabel = useMemo(() => {
    try {
      return new Date(eventDato + 'T00:00:00').toLocaleDateString('da-DK', {
        weekday: 'long',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    } catch {
      return eventDato;
    }
  }, [eventDato]);

  const slotCounts = slots.reduce<Record<number, number>>((acc, s) => {
    acc[s.id] = valgteSpillere.filter((v) => (v.slots ?? slots.map((x) => x.id)).includes(s.id)).length;
    return acc;
  }, {} as Record<number, number>);

  // ======== RENDER ========
  return (
    <div className="flex gap-4 p-4 h-screen overflow-auto bg-white text-black dark:bg-zinc-900 dark:text-white">
      {/* Venstre kolonne */}
      <div className="w-1/5 p-3 rounded shadow bg-zinc-100 dark:bg-zinc-800">
        <h1 className="font-bold mb-1">🌞 Søndagsrangliste</h1>
        <p className="text-[11px] text-zinc-500 mb-2">Næste event: {eventDatoLabel}</p>

        <div className="mb-2 text-[11px] text-zinc-600 dark:text-zinc-300">
          <span className="font-medium mr-1">Tilstand:</span>
          <div className="mt-1 space-y-1">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="radio"
                name="slotmode"
                value="standard"
                checked={slotMode === 'standard'}
                onChange={() => setSlotMode('standard')}
              />
              <span>3 slots (13:00–14:40, 14:40–16:20, 16:20–18:00)</span>
            </label>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="radio"
                name="slotmode"
                value="two"
                checked={slotMode === 'two'}
                onChange={() => setSlotMode('two')}
              />
              <span>2 slots (15:00–16:30, 16:30–18:00)</span>
            </label>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="radio"
                name="slotmode"
                value="manual"
                checked={slotMode === 'manual'}
                onChange={() => setSlotMode('manual')}
              />
              <span>Manuel indtastning</span>
            </label>
          </div>

          {slotMode !== 'manual' && (
            <div className="mt-2">
              <span className="font-medium mr-1">Aktive slots:</span>
              {getSlotsByMode(slotMode).map((s) => (
                <span key={s.id} className="mr-2">
                  {s.id}: {s.label}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Overblik over tilmeldinger pr. slot */}
        {slotMode !== 'manual' && (
          <div className="mb-3 p-2 rounded bg-zinc-50 dark:bg-zinc-700">
            <h3 className="font-semibold text-sm mb-1">🕒 Tilmeldinger pr. slot</h3>
            {slots.map((s) => (
              <div key={s.id} className="flex justify-between text-xs">
                <span>{`Slot ${s.id} (${s.label})`}</span>
                <span>{slotCounts[s.id] ?? 0}</span>
              </div>
            ))}
          </div>
        )}

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

        <div className="mt-3">
          {valgteSpillere.map((spiller, idx) => (
            <React.Fragment key={spiller.visningsnavn}>
              <div className="bg-pink-100 dark:bg-zinc-700 rounded px-2 py-1 text-xs mb-1">
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
                      title="Fjern spiller"
                    >
                      🗑
                    </button>
                  </div>
                </div>

                {/* Slot toggles (kun i non-manual) */}
                {slotMode !== 'manual' && (
                  <div className="mt-1 flex gap-1 flex-wrap">
                    {getSlotsByMode(slotMode).map((s) => {
                      const selected = (spiller.slots ?? getSlotsByMode(slotMode).map((x) => x.id)).includes(s.id);
                      return (
                        <button
                          key={s.id}
                          onClick={() => toggleSlotForSpiller(spiller.visningsnavn, s.id)}
                          title={`Slot ${s.id}: ${s.label}`}
                          className={`px-2 py-0.5 rounded text-[11px] border ${
                            selected
                              ? 'bg-green-600 text-white border-green-700'
                              : 'bg-zinc-300 dark:bg-zinc-600 text-zinc-900 dark:text-zinc-100 border-transparent'
                          }`}
                        >
                          {s.id}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

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
              ? 'bg-gray-400 text-white cursor-not-allowed'
              : 'bg-green-600 text-white hover:bg-green-700'
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
          const slotCfg = slotCfgById(kamp.slot);

          const utilgængelige = kampSpillere.filter((navn) => {
            if (slotMode === 'manual') return false;
            const sp = valgteSpillere.find((v) => v.visningsnavn === navn);
            const allowed = sp ? (sp.slots ?? getSlotsByMode(slotMode).map((x) => x.id)) : getSlotsByMode(slotMode).map((x) => x.id);
            return !allowed.includes(kamp.slot);
          });

          return (
            <div key={kamp.id} className="p-3 rounded bg-zinc-100 dark:bg-zinc-800">
              <div className="mb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {/* Bane */}
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
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>

                    {/* Slot eller frie tider */}
                    {slotMode === 'manual' ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="time"
                          value={kamp.starttid}
                          onChange={(e) => {
                            const updated = [...kampe];
                            updated[kampIndex].starttid = e.target.value;
                            setKampe(updated);
                          }}
                          className="text-sm border px-1 bg-white dark:bg-zinc-700 dark:text-white rounded"
                        />
                        <span>–</span>
                        <input
                          type="time"
                          value={kamp.sluttid}
                          onChange={(e) => {
                            const updated = [...kampe];
                            updated[kampIndex].sluttid = e.target.value;
                            setKampe(updated);
                          }}
                          className="text-sm border px-1 bg-white dark:bg-zinc-700 dark:text-white rounded"
                        />
                      </div>
                    ) : (
                      <>
                        <select
                          value={kamp.slot}
                          onChange={(e) => {
                            const newSlot = Number(e.target.value);
                            const cfg = slotCfgById(newSlot);
                            const updated = [...kampe];
                            updated[kampIndex].slot = newSlot;
                            updated[kampIndex].starttid = cfg.start;
                            updated[kampIndex].sluttid = cfg.end;
                            setKampe(updated);
                          }}
                          className="text-sm border px-1 bg-white dark:bg-zinc-700 dark:text-white rounded"
                        >
                          {getSlotsByMode(slotMode).map((s) => (
                            <option key={s.id} value={s.id}>{`Slot ${s.id}: ${s.label}`}</option>
                          ))}
                        </select>

                        <span className="text-[11px] text-zinc-500">
                          {slotCfg.start}–{slotCfg.end}
                        </span>
                      </>
                    )}
                  </div>

                  <button
                    onClick={() => moveKampUp(kampIndex)}
                    disabled={kampIndex === 0}
                    className="ml-3 inline-flex items-center rounded-xl border px-3 py-1 text-xs disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Ryk kampen én plads op"
                  >
                    ▲
                  </button>
                </div>

                {slotMode !== 'manual' && utilgængelige.length > 0 && (
                  <div className="mt-1 text-[11px] text-red-600">
                    ⚠️ Ikke tilmeldt i valgt slot: {utilgængelige.join(', ')}
                  </div>
                )}
              </div>

              {kamp.sæt.map((sæt, sætIndex) => {
                const sætId = 1_000_000 + kampIndex * 10 + sætIndex;
                return (
                  <div key={sætIndex} className="flex items-center gap-2 text-xs">
                    <div className="w-1/3 truncate">
                      {sæt.holdA1} & {sæt.holdA2}
                    </div>
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
                        } else if (e.target.value === '') {
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
                        } else if (e.target.value === '') {
                          updated[kampIndex].sæt[sætIndex].scoreB = 0;
                        }
                        setKampe(updated);
                      }}
                      className="w-8 border text-center text-xs bg-white dark:bg-zinc-700 dark:text-white"
                    />
                    <div className="w-1/3 truncate text-right">
                      {sæt.holdB1} & {sæt.holdB2}
                    </div>
                    <div className="text-pink-600 text-xs font-bold">{visPoint(sætId)}</div>
                  </div>
                );
              })}
              <button onClick={() => genererNæsteSæt(kampIndex)} className="mt-2 text-xs text-pink-600 hover:underline">
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
            const emoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : emojiForPluspoint(diff);
            const sizeClass =
              index === 0 ? 'text-base font-bold' : index === 1 ? 'text-sm font-semibold' : index === 2 ? 'text-sm' : 'text-xs';
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
            disabled={busy === 'saving'}
            className="bg-zinc-900/80 dark:bg-zinc-200 dark:text-zinc-900 text-white px-3 py-1 rounded text-sm hover:opacity-90 disabled:opacity-50"
          >
            {busy === 'saving' ? 'Gemmer...' : '💾 Gem søndagskladde'}
          </button>
          <button
            onClick={loadDraft}
            disabled={busy === 'loading'}
            className="bg-zinc-700/80 dark:bg-zinc-300 dark:text-zinc-900 text-white px-3 py-1 rounded text-sm hover:opacity-90 disabled:opacity-50"
          >
            {busy === 'loading' ? 'Henter...' : '📥 Hent søndagskladde'}
          </button>
          <button onClick={publicerEventPlan} className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700">
            📢 Publicér søndagsplan
          </button>
          {lastSavedAt && (
            <p className="text-[11px] text-zinc-500 mt-1">Sidst gemt: {new Date(lastSavedAt).toLocaleString('da-DK')}</p>
          )}
        </div>

        <div className="mt-4 text-center">
          <button onClick={sendEventResultater} className="bg-pink-600 text-white px-3 py-1 rounded text-sm hover:bg-pink-700">
            ✅ Indsend resultater
          </button>
        </div>
      </div>
    </div>
  );
}

