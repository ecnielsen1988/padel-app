'use client';

export const dynamic = 'force-dynamic';

import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';

type PlayerRow = {
  visningsnavn: string;
};

type WinnerRow = {
  event_date: string; // YYYY-MM-DD
  placement: number; // 1..5
  visningsnavn: string;
  points: number;
};

const pointsForPlacement = (placement: number) => {
  if (placement === 1) return 10;
  if (placement === 2) return 5;
  if (placement === 3) return 3;
  if (placement === 4) return 2;
  return 1; // 5
};

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** Simple “typeahead dropdown” optimized for mobile */
function PlayerSelect({
  label,
  value,
  onChange,
  options,
  disabled,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  disabled?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);

  useEffect(() => setQuery(value), [value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, 25);
    return options.filter((n) => n.toLowerCase().includes(q)).slice(0, 25);
  }, [query, options]);

  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
        {label}
      </div>

      <div className="relative">
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            // vi ændrer ikke den “valgte” før user trykker på et navn,
            // så man ikke gemmer halv-tekst ved en fejl
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // lille delay så click på dropdown når at registrere
            setTimeout(() => setOpen(false), 150);
          }}
          disabled={disabled}
          placeholder={placeholder || 'Skriv navn…'}
          className="w-full rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-zinc-900 px-4 py-3 text-base text-zinc-900 dark:text-zinc-100 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:opacity-60"
        />

        {open && !disabled && (
          <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-zinc-900 shadow-lg">
            {filtered.length === 0 ? (
              <div className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-300">
                Ingen match…
              </div>
            ) : (
              <div className="max-h-64 overflow-auto">
                {filtered.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onChange(name);
                      setQuery(name);
                      setOpen(false);
                    }}
                    className="w-full text-left px-4 py-3 text-base text-zinc-900 dark:text-zinc-100 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}

            <div className="border-t border-emerald-100 dark:border-emerald-900/40 px-4 py-2 text-xs text-zinc-500 dark:text-zinc-400">
              Tip: skriv et par bogstaver og tryk på navnet.
            </div>
          </div>
        )}
      </div>

      {value && (
        <div className="text-xs text-zinc-600 dark:text-zinc-400">
          Valgt: <span className="font-semibold">{value}</span>
        </div>
      )}
    </div>
  );
}

export default function ThursdayWinnerAdminPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [eventDate, setEventDate] = useState<string>(toISODate(new Date()));

  const [players, setPlayers] = useState<string[]>([]);
  const [existing, setExisting] = useState<WinnerRow[]>([]);

  // top 5 inputs
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [p3, setP3] = useState('');
  const [p4, setP4] = useState('');
  const [p5, setP5] = useState('');

  const selected = useMemo(() => [p1, p2, p3, p4, p5], [p1, p2, p3, p4, p5]);

  const duplicateNames = useMemo(() => {
    const cleaned = selected.map((x) => x.trim()).filter(Boolean);
    const set = new Set<string>();
    const dups = new Set<string>();
    for (const n of cleaned) {
      const key = n.toLowerCase();
      if (set.has(key)) dups.add(n);
      set.add(key);
    }
    return Array.from(dups);
  }, [selected]);

  const allValid = useMemo(() => {
    // vi kræver at alle 5 er sat og findes i listen
    const opts = new Set(players.map((x) => x.toLowerCase()));
    const filled = selected.every((x) => x.trim().length > 0);
    if (!filled) return false;
    if (duplicateNames.length > 0) return false;
    return selected.every((x) => opts.has(x.trim().toLowerCase()));
  }, [players, selected, duplicateNames]);

  // Load eligible players once
  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);

        const { data: auth } = await supabase.auth.getUser();
        if (!auth?.user) {
          setPlayers([]);
          return;
        }

        // Kun torsdagspadel spillere
        const resp = await (supabase.from('profiles') as any)
          .select('visningsnavn')
          .eq('torsdagspadel', true)
          .not('visningsnavn', 'is', null)
          .order('visningsnavn', { ascending: true });

        if (resp?.error) {
          console.error('Fejl ved hentning af profiles:', resp.error);
          setPlayers([]);
          return;
        }

        const rows = (resp?.data ?? []) as PlayerRow[];
        setPlayers(rows.map((r) => r.visningsnavn).filter(Boolean));
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  // Load existing winners whenever date changes (and prefill)
  useEffect(() => {
    const loadExisting = async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) return;

      const resp = await (supabase.from('torsdag_winners') as any)
        .select('event_date, placement, visningsnavn, points')
        .eq('event_date', eventDate)
        .order('placement', { ascending: true });

      if (resp?.error) {
        console.error('Fejl ved hentning af torsdag_winners:', resp.error);
        setExisting([]);
        return;
      }

      const rows = (resp?.data ?? []) as WinnerRow[];
      setExisting(rows);

      // prefill top 5 (hvis der ligger data)
      const byPlacement = new Map<number, string>();
      rows.forEach((r) => byPlacement.set(r.placement, r.visningsnavn));

      setP1(byPlacement.get(1) ?? '');
      setP2(byPlacement.get(2) ?? '');
      setP3(byPlacement.get(3) ?? '');
      setP4(byPlacement.get(4) ?? '');
      setP5(byPlacement.get(5) ?? '');
    };

    loadExisting();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventDate]);

  const save = async () => {
    if (!allValid) return;
    setSaving(true);

    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) return;

      // 1) delete eksisterende for dato (så du altid kan “overskrive”)
      const delResp = await (supabase.from('torsdag_winners') as any)
        .delete()
        .eq('event_date', eventDate);

      if (delResp?.error) {
        console.error('Fejl ved delete:', delResp.error);
        return;
      }

      // 2) insert top5
      const payload = [
        { event_date: eventDate, placement: 1, visningsnavn: p1.trim(), points: pointsForPlacement(1) },
        { event_date: eventDate, placement: 2, visningsnavn: p2.trim(), points: pointsForPlacement(2) },
        { event_date: eventDate, placement: 3, visningsnavn: p3.trim(), points: pointsForPlacement(3) },
        { event_date: eventDate, placement: 4, visningsnavn: p4.trim(), points: pointsForPlacement(4) },
        { event_date: eventDate, placement: 5, visningsnavn: p5.trim(), points: pointsForPlacement(5) },
      ];

      const insResp = await (supabase.from('torsdag_winners') as any).insert(payload);

      if (insResp?.error) {
        console.error('Fejl ved insert:', insResp.error);
        return;
      }

      // refresh view
      const refresh = await (supabase.from('torsdag_winners') as any)
        .select('event_date, placement, visningsnavn, points')
        .eq('event_date', eventDate)
        .order('placement', { ascending: true });

      if (!refresh?.error) setExisting((refresh?.data ?? []) as WinnerRow[]);
    } finally {
      setSaving(false);
    }
  };

  const usedLower = useMemo(() => new Set(selected.map((x) => x.trim().toLowerCase()).filter(Boolean)), [selected]);
  const availableOptions = (currentValue: string) => {
    // så du ikke kan vælge samme spiller to gange:
    // behold dog currentValue selv om den allerede er “used”
    const cur = currentValue.trim().toLowerCase();
    return players.filter((n) => {
      const key = n.toLowerCase();
      if (key === cur) return true;
      return !usedLower.has(key);
    });
  };

  if (loading) {
    return (
      <div className="max-w-xl mx-auto p-6 text-center text-zinc-700 dark:text-zinc-100">
        Indlæser…
      </div>
    );
  }

  return (
    <main className="max-w-xl mx-auto p-4 sm:p-6 pb-24 text-zinc-900 dark:text-white">
      {/* Header */}
      <div className="mb-4 rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-zinc-900/60 shadow-sm overflow-hidden">
        <div className="h-2 bg-gradient-to-r from-emerald-600 via-green-500 to-emerald-600" />
        <div className="p-4 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-xl sm:text-2xl font-bold">🏆 Torsdags Winner Admin</h1>
            <span className="text-xs px-3 py-1 rounded-full border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-200">
              Top 5
            </span>
          </div>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            Vælg dato og udfyld top 5. Kun torsdagspadel-spillere kan vælges.
          </p>
        </div>
      </div>

      {/* Date */}
      <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-zinc-900/60 p-4 space-y-3">
        <div className="text-sm font-semibold text-emerald-900 dark:text-emerald-100">
          📅 Dato (torsdagen)
        </div>
        <input
          type="date"
          value={eventDate}
          onChange={(e) => setEventDate(e.target.value)}
          className="w-full rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-zinc-900 px-4 py-3 text-base shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
        />

        {existing.length > 0 && (
          <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/10 p-3">
            <div className="text-xs font-semibold text-emerald-900 dark:text-emerald-100 mb-2">
              Allerede gemt for denne dato:
            </div>
            <div className="space-y-1 text-sm">
              {existing.map((r) => (
                <div key={`${r.event_date}-${r.placement}`} className="flex items-center justify-between">
                  <span>
                    {r.placement === 1 ? '🥇' : r.placement === 2 ? '🥈' : r.placement === 3 ? '🥉' : r.placement === 4 ? '4️⃣' : '5️⃣'}{' '}
                    {r.visningsnavn}
                  </span>
                  <span className="text-zinc-600 dark:text-zinc-300">{r.points}p</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Inputs */}
      <div className="mt-4 space-y-4 rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-white dark:bg-zinc-900/60 p-4">
        {duplicateNames.length > 0 && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            Du har valgt den samme spiller flere gange. Vælg 5 forskellige.
          </div>
        )}

        <PlayerSelect
          label="🥇 1. plads (10 point)"
          value={p1}
          onChange={setP1}
          options={availableOptions(p1)}
          placeholder="Søg spiller…"
        />

        <PlayerSelect
          label="🥈 2. plads (5 point)"
          value={p2}
          onChange={setP2}
          options={availableOptions(p2)}
          placeholder="Søg spiller…"
        />

        <PlayerSelect
          label="🥉 3. plads (3 point)"
          value={p3}
          onChange={setP3}
          options={availableOptions(p3)}
          placeholder="Søg spiller…"
        />

        <PlayerSelect
          label="4️⃣ 4. plads (2 point)"
          value={p4}
          onChange={setP4}
          options={availableOptions(p4)}
          placeholder="Søg spiller…"
        />

        <PlayerSelect
          label="5️⃣ 5. plads (1 point)"
          value={p5}
          onChange={setP5}
          options={availableOptions(p5)}
          placeholder="Søg spiller…"
        />
      </div>

      {/* Sticky actions for mobile */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-emerald-200 dark:border-emerald-900 bg-white/95 dark:bg-zinc-950/90 backdrop-blur">
        <div className="max-w-xl mx-auto p-3 flex items-center gap-2">
          <Link
            href="/torsdagspadel"
            className="flex-1 text-center rounded-2xl border border-emerald-200 dark:border-emerald-800 px-4 py-3 text-sm font-semibold text-emerald-800 dark:text-emerald-200"
          >
            ← Tilbage
          </Link>

          <button
            onClick={save}
            disabled={!allValid || saving}
            className="flex-[1.2] rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed px-4 py-3 text-sm font-semibold text-white"
          >
            {saving ? 'Gemmer…' : '💾 Gem top 5'}
          </button>
        </div>

        <div className="max-w-xl mx-auto px-3 pb-2 text-xs text-zinc-600 dark:text-zinc-300">
          Tip: Du kan altid ændre og gemme igen — den overskriver dagens top 5.
        </div>
      </div>
    </main>
  );
}
