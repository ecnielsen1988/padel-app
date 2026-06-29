'use client';
export const dynamic = 'force-dynamic';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { PageShell } from '../components/ui';
import { supabase } from '@/lib/supabaseClient';

type Spiller = { visningsnavn: string; elo: number; koen: string | null };

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export default function GirlPowerRangliste() {
  const [rows, setRows] = useState<Spiller[]>([]);
  const [loading, setLoading] = useState(true);
  const [myName, setMyName] = useState<string | null>(null);
  const [myElo, setMyElo] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch('/api/rangliste', { cache: 'no-store' });
        const data = (await res.json()) as any[];
        if (cancelled) return;

        let list: Spiller[] = (data ?? [])
          .map((row) => ({
            visningsnavn: (row?.visningsnavn ?? '').toString().trim(),
            elo: Number(row?.elo ?? 0),
            koen: row?.koen ?? null,
          }))
          .filter((row) => !!row.visningsnavn && Number.isFinite(row.elo));

        const { data: womenProfiles, error: womenErr } = await supabase
          .from('profiles')
          .select('visningsnavn')
          .eq('status', 'active')
          .eq('koen', 'kvinde');

        if (womenErr) {
          console.error('Fejl ved hentning af kvindeprofiler:', womenErr);
          setRows([]);
          return;
        }

        const womenSet = new Set(
          (womenProfiles ?? [])
            .map((profile: any) => (profile?.visningsnavn ?? '').toString().trim().toLowerCase())
            .filter(Boolean)
        );

        list = list.filter((row) => womenSet.has(row.visningsnavn.toLowerCase()));
        setRows(list);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;
      if (!mounted) return;

      if (!user) {
        setMyName(null);
        setMyElo(null);
        return;
      }

      const { data: prof } = await supabase
        .from('profiles')
        .select('visningsnavn')
        .eq('id', user.id)
        .maybeSingle();

      const visningsnavn =
        (prof?.visningsnavn ?? (user.user_metadata as any)?.visningsnavn ?? '')?.toString().trim() || null;

      setMyName(visningsnavn);

      if (visningsnavn) {
        const me = rows.find((row) => row.visningsnavn.toLowerCase() === visningsnavn.toLowerCase());
        setMyElo(me ? me.elo : null);
      } else {
        setMyElo(null);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [rows]);

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
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/75">
                Ranglister
              </p>
              <h1 className="mt-1 text-2xl font-black tracking-tight">
                GirlPower Listen
              </h1>
            </div>

            <Link
              href={myName ? `/profil/${encodeURIComponent(myName)}` : '/startside'}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#ffd44d] text-xs font-black text-[#463018]"
              aria-label="Min profil"
            >
              {initials(myName || 'Spiller')}
            </Link>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded-[18px] bg-white/14 px-3 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">
                Spillere
              </p>
              <p className="mt-1 text-xl font-black">{rows.length}</p>
            </div>
            <div className="rounded-[18px] bg-white/14 px-3 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">
                Fører
              </p>
              <p className="mt-1 truncate text-sm font-black">{rows[0]?.visningsnavn ?? '–'}</p>
            </div>
            <div className="rounded-[18px] bg-white/14 px-3 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">
                Din Elo
              </p>
              <p className="mt-1 text-xl font-black">{typeof myElo === 'number' ? Math.round(myElo) : '–'}</p>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 pb-28 pt-4 md:px-6">
          <div className="space-y-4">
            {loading ? (
              <section className="rounded-[20px] bg-white p-4 text-sm text-[#6d7280] shadow-[0_2px_12px_rgba(0,0,0,0.07)]">
                Indlæser…
              </section>
            ) : rows.length === 0 ? (
              <section className="rounded-[20px] bg-white p-4 text-sm text-[#6d7280] shadow-[0_2px_12px_rgba(0,0,0,0.07)]">
                Ingen kvindelige spillere i ranglisten endnu.
              </section>
            ) : (
              <RanglisteList rows={rows} myName={myName} myElo={myElo} />
            )}
          </div>
        </div>

        <nav className="absolute inset-x-0 bottom-0 flex justify-around border-t border-black/5 bg-white px-2 pb-5 pt-3 md:static md:pb-4">
          {[
            { href: '/startside', icon: '🏠', label: 'Hjem' },
            { href: '/ranglister', icon: '📊', label: 'Rangliste' },
            { href: '/kommende', icon: '📅', label: 'Events' },
            {
              href: myName ? `/profil/${encodeURIComponent(myName)}` : '/startside',
              icon: '🧑‍🎾',
              label: 'Profil',
            },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex min-w-16 flex-col items-center gap-1 text-[#7b8190]"
            >
              <span className="text-lg">{item.icon}</span>
              <span className="text-[11px] font-semibold">{item.label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </PageShell>
  );
}

function RanglisteList({
  rows,
}: {
  rows: Spiller[];
  myName: string | null;
  myElo: number | null;
}) {
  const [q, setQ] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const itemRefs = useRef<Record<string, HTMLLIElement | null>>({});

  const norm = (s?: string | null) => (s ?? '').trim().toLowerCase();

  const matches = useMemo(() => {
    if (!q) return [];
    const nq = norm(q);
    const starts = rows.filter((row) => norm(row.visningsnavn).startsWith(nq));
    const inc = rows.filter((row) => !starts.includes(row) && norm(row.visningsnavn).includes(nq));
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!q) return;

    const exact = rows.find((row) => norm(row.visningsnavn) === norm(q));
    const target = exact?.visningsnavn ?? matches[0]?.visningsnavn;

    if (target) {
      jumpTo(target);
      setSearchOpen(false);
    }
  }

  return (
    <section className="rounded-[20px] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.07)]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[13px] font-bold uppercase tracking-[0.12em] text-[#2d3340]">
          Hele listen
        </h2>
        <button
          type="button"
          onClick={() => setSearchOpen((value) => !value)}
          className="rounded-full bg-[#fff0f5] px-3 py-1 text-[11px] font-bold text-[#f01f78]"
        >
          🔎 Søg
        </button>
      </div>

      {searchOpen ? (
        <div className="mb-3 rounded-[16px] border border-[#ececf1] bg-[#fbfbfc] p-3">
          <form onSubmit={handleSubmit}>
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Søg visningsnavn…"
              className="w-full rounded-xl border border-[#e6e7eb] bg-white px-3 py-2 text-sm text-[#1f2430] outline-none focus:ring-2 focus:ring-pink-500/30"
            />
          </form>

          {matches.length ? (
            <ul className="mt-2 space-y-1">
              {matches.map((match) => (
                <li key={match.visningsnavn}>
                  <button
                    type="button"
                    onClick={() => {
                      jumpTo(match.visningsnavn);
                      setSearchOpen(false);
                    }}
                    className="w-full rounded-[14px] px-3 py-2 text-left text-sm text-[#1f2430] hover:bg-white"
                  >
                    {match.visningsnavn}
                    <span className="ml-2 text-xs text-[#8a8f9c]">
                      #{rows.findIndex((row) => row.visningsnavn === match.visningsnavn) + 1} • {Math.round(match.elo)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <ol className="space-y-2.5">
        {rows.map((spiller, index) => {
          const isHighlighted = highlighted === spiller.visningsnavn;

          return (
            <li
              key={spiller.visningsnavn}
              ref={(el) => {
                itemRefs.current[spiller.visningsnavn] = el;
              }}
              className={[
                'rounded-[18px] border px-4 py-3',
                index === 0
                  ? 'bg-gradient-to-r from-[#f01f78] to-[#ff5b9b] text-white border-transparent'
                  : 'border-[#ececf1] bg-[#fbfbfc] text-[#1f2430]',
                isHighlighted ? 'ring-2 ring-[#f01f78]' : '',
              ].join(' ')}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={index === 0 ? 'text-sm font-black text-white' : 'text-sm font-black text-[#f01f78]'}>
                      #{index + 1}
                    </span>
                    <Link
                      href={`/profil/${encodeURIComponent(spiller.visningsnavn)}`}
                      className="truncate text-sm font-bold"
                    >
                      {spiller.visningsnavn} 👸
                    </Link>
                  </div>
                </div>

                <span className={index === 0 ? 'text-sm font-bold text-white' : 'text-sm font-bold text-[#1f2430]'}>
                  🎾 {Math.round(spiller.elo)}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
