'use client';
export const dynamic = 'force-dynamic';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { PageShell } from '../components/ui';
import { supabase } from '@/lib/supabaseClient';

type EggRow = {
  visningsnavn: string;
  eggs: number;
  elo: number | null;
};

async function fetchAllNewresults(): Promise<any[]> {
  const PAGE_SIZE = 1000;
  let all: any[] = [];
  let page = 0;

  while (true) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, error } = await supabase
      .from('newresults')
      .select('*')
      .order('date', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to);

    if (error) {
      console.error('Fejl ved pagineret hentning af newresults (Æggejagten):', error);
      if (page === 0) throw error;
      break;
    }

    const batch = data ?? [];
    all = all.concat(batch);
    if (batch.length < PAGE_SIZE) break;
    page++;
  }

  return all;
}

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export default function AeggejagtenSide() {
  const [rows, setRows] = useState<EggRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [myName, setMyName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const user = auth?.user;
        if (user && !cancelled) {
          const { data: prof } = await supabase
            .from('profiles')
            .select('visningsnavn')
            .eq('id', user.id)
            .maybeSingle();
          if (!cancelled) {
            setMyName(
              (prof?.visningsnavn ?? (user.user_metadata as any)?.visningsnavn ?? '')?.toString().trim() || null
            );
          }
        }

        const kampe = await fetchAllNewresults();
        if (cancelled) return;

        const eggsMap = new Map<string, number>();

        const addEgg = (name?: string | null) => {
          if (!name) return;
          const key = name.toString().trim();
          if (!key) return;
          eggsMap.set(key, (eggsMap.get(key) ?? 0) + 1);
        };

        for (const k of kampe) {
          const finished = k.finish === true || k.finish === 'true' || k.finish === 1;
          if (!finished) continue;

          const ha1: string | undefined = k.holda1 ?? k.holdA1;
          const ha2: string | undefined = k.holda2 ?? k.holdA2;
          const hb1: string | undefined = k.holdb1 ?? k.holdB1;
          const hb2: string | undefined = k.holdb2 ?? k.holdB2;
          const rawA = k.scorea ?? k.scoreA;
          const rawB = k.scoreb ?? k.scoreB;

          const scoreA = typeof rawA === 'number' ? rawA : parseInt(rawA ?? '0', 10);
          const scoreB = typeof rawB === 'number' ? rawB : parseInt(rawB ?? '0', 10);
          if (isNaN(scoreA) || isNaN(scoreB)) continue;

          if (scoreA === 6 && scoreB === 0) {
            addEgg(ha1);
            addEgg(ha2);
          } else if (scoreB === 6 && scoreA === 0) {
            addEgg(hb1);
            addEgg(hb2);
          }
        }

        const res = await fetch('/api/rangliste', { cache: 'no-store' });
        const rangData = (await res.json()) as any[];
        const eloMap = new Map<string, number>();

        for (const r of rangData ?? []) {
          const navn = (r?.visningsnavn ?? '').toString().trim();
          const elo = Number(r?.elo ?? 0);
          if (!navn || !Number.isFinite(elo)) continue;
          eloMap.set(navn.toLowerCase(), elo);
        }

        const rowsArr: EggRow[] = Array.from(eggsMap.entries())
          .map(([visningsnavn, eggs]) => ({
            visningsnavn,
            eggs,
            elo: eloMap.get(visningsnavn.toLowerCase()) ?? null,
          }))
          .filter((row) => row.eggs > 0)
          .sort((a, b) => {
            if (b.eggs !== a.eggs) return b.eggs - a.eggs;
            const eloA = a.elo ?? 0;
            const eloB = b.elo ?? 0;
            if (eloB !== eloA) return eloB - eloA;
            return a.visningsnavn.localeCompare(b.visningsnavn, 'da');
          });

        if (!cancelled) setRows(rowsArr);
      } catch (e) {
        console.error('Fejl i Æggejagten:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const currentTime = new Intl.DateTimeFormat('da-DK', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date());

  return (
    <PageShell className="bg-[#1a1a2e] px-0 py-0 md:px-6 md:py-6">
      <div className="mx-auto flex min-h-screen w-full max-w-[820px] flex-col overflow-hidden bg-[#f4f5f7] md:min-h-[min(100vh,980px)] md:rounded-[34px] md:border md:border-white/10 md:shadow-[0_28px_80px_rgba(0,0,0,0.35)]">
        <header className="bg-gradient-to-br from-[#f01f78] to-[#c0135a] px-4 pb-5 pt-4 text-white md:px-6">
          <div className="mb-4 flex items-center justify-between text-[11px] font-semibold opacity-90">
            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined') window.history.back();
              }}
              className="inline-flex items-center rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-white/25"
            >
              ← Tilbage
            </button>
            <span>{currentTime}</span>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/75">Ranglister</p>
              <h1 className="mt-1 text-2xl font-black tracking-tight">Æggejagten</h1>
            </div>
            <Link
              href={myName ? `/profil/${encodeURIComponent(myName)}` : '/startside'}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#ffd44d] text-xs font-black text-[#463018]"
            >
              {initials(myName || 'Spiller')}
            </Link>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded-[18px] bg-white/14 px-3 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">Spillere</p>
              <p className="mt-1 text-xl font-black">{rows.length}</p>
            </div>
            <div className="rounded-[18px] bg-white/14 px-3 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">Flest æg</p>
              <p className="mt-1 text-xl font-black">{rows[0]?.eggs ?? '–'}</p>
            </div>
            <div className="rounded-[18px] bg-white/14 px-3 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">Fører</p>
              <p className="mt-1 truncate text-sm font-black">{rows[0]?.visningsnavn ?? '–'}</p>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 pb-28 pt-4 md:px-6">
          <div className="space-y-4">
            {loading ? (
              <section className="rounded-[20px] bg-white p-4 text-sm text-[#6d7280] shadow-[0_2px_12px_rgba(0,0,0,0.07)]">Indlæser…</section>
            ) : rows.length === 0 ? (
              <section className="rounded-[20px] bg-white p-4 text-sm text-[#6d7280] shadow-[0_2px_12px_rgba(0,0,0,0.07)]">
                Der er endnu ikke givet nogen æg (6-0) i systemet.
              </section>
            ) : (
              <EggList rows={rows} />
            )}
          </div>
        </div>

        <nav className="absolute inset-x-0 bottom-0 flex justify-around border-t border-black/5 bg-white px-2 pb-5 pt-3 md:static md:pb-4">
          {[
            { href: '/startside', icon: '🏠', label: 'Hjem' },
            { href: '/ranglister', icon: '📊', label: 'Rangliste' },
            { href: '/kommende', icon: '📅', label: 'Events' },
            { href: myName ? `/profil/${encodeURIComponent(myName)}` : '/startside', icon: '🧑‍🎾', label: 'Profil' },
          ].map((item) => (
            <Link key={item.href} href={item.href} className="flex min-w-16 flex-col items-center gap-1 text-[#7b8190]">
              <span className="text-lg">{item.icon}</span>
              <span className="text-[11px] font-semibold">{item.label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </PageShell>
  );
}

function EggList({ rows }: { rows: EggRow[] }) {
  const [q, setQ] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const itemRefs = useRef<Record<string, HTMLLIElement | null>>({});

  const norm = (s?: string | null) => (s ?? '').trim().toLowerCase();
  const matches = useMemo(() => {
    if (!q) return [];
    const nq = norm(q);
    const starts = rows.filter((r) => norm(r.visningsnavn).startsWith(nq));
    const inc = rows.filter((r) => !starts.includes(r) && norm(r.visningsnavn).includes(nq));
    return [...starts, ...inc].slice(0, 8);
  }, [q, rows]);

  function jumpTo(name: string) {
    const el = itemRefs.current[name];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlighted(name);
      window.setTimeout(() => setHighlighted((prev) => (prev === name ? null : prev)), 2500);
    }
  }

  return (
    <section className="rounded-[20px] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.07)]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.12em] text-[#2d3340]">Hele listen</h2>
        <button type="button" onClick={() => setSearchOpen((v) => !v)} className="rounded-full bg-[#fff0f5] px-3 py-1 text-[11px] font-bold text-[#f01f78]">
          🔎 Søg
        </button>
      </div>

      {searchOpen ? (
        <div className="mb-3 rounded-[16px] border border-[#ececf1] bg-[#fbfbfc] p-3">
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Søg visningsnavn…"
            className="w-full rounded-xl border border-[#e6e7eb] bg-white px-3 py-2 text-sm text-[#1f2430] outline-none focus:ring-2 focus:ring-pink-500/30"
          />
          {matches.length ? (
            <ul className="mt-2 space-y-1">
              {matches.map((m) => (
                <li key={m.visningsnavn}>
                  <button type="button" onClick={() => { jumpTo(m.visningsnavn); setSearchOpen(false); }} className="w-full rounded-[14px] px-3 py-2 text-left text-sm text-[#1f2430] hover:bg-white">
                    {m.visningsnavn}
                    <span className="ml-2 text-xs text-[#8a8f9c]">#{rows.findIndex((r) => r.visningsnavn === m.visningsnavn) + 1} • {m.eggs} æg</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <ol className="space-y-2.5">
        {rows.map((spiller, index) => (
          <li
            key={spiller.visningsnavn}
            ref={(el) => { itemRefs.current[spiller.visningsnavn] = el; }}
            className={[
              'rounded-[18px] border px-4 py-3',
              index === 0 ? 'bg-gradient-to-r from-[#ffcf4a] to-[#f01f78] text-white border-transparent' : 'border-[#ececf1] bg-[#fbfbfc] text-[#1f2430]',
              highlighted === spiller.visningsnavn ? 'ring-2 ring-[#f01f78]' : '',
            ].join(' ')}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex items-center gap-2">
                <span className={index === 0 ? 'text-sm font-black text-white' : 'text-sm font-black text-[#f01f78]'}>#{index + 1}</span>
                <Link href={`/profil/${encodeURIComponent(spiller.visningsnavn)}`} className="truncate text-sm font-bold">
                  {spiller.visningsnavn}
                </Link>
              </div>
              <span className={index === 0 ? 'text-sm font-bold text-white' : 'text-sm font-bold text-[#1f2430]'}>
                🥚 {spiller.eggs}
              </span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
