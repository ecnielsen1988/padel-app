'use client';
export const dynamic = 'force-dynamic';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { notifyUser } from '@/lib/notify';

type Spiller = { visningsnavn: string; elo: number; koen: string | null };

export default function NyRanglisteSide() {
  const [rows, setRows] = useState<Spiller[]>([]);
  const [bestMand, setBestMand] = useState<string | null>(null);
  const [bestKvinde, setBestKvinde] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Min profil (til udfordringsknappen)
  const [myName, setMyName] = useState<string | null>(null);
  const [myElo, setMyElo] = useState<number | null>(null);

  // Hent ranglisten (via din eksisterende API) + filtrér på profiles.active = true
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch('/api/rangliste', { cache: 'no-store' });
        const data = (await res.json()) as any[];
        if (cancelled) return;

        let list: Spiller[] = (data ?? [])
          .map((r) => ({
            visningsnavn: (r?.visningsnavn ?? '').toString().trim(),
            elo: Number(r?.elo ?? 0),
            koen: r?.koen ?? null,
          }))
          .filter((r) => !!r.visningsnavn && Number.isFinite(r.elo));

        // Hent aktive profiler og filtrér
        const { data: activeProfiles, error: activeErr } = await (supabase
          .from('profiles') as any)
          .select('visningsnavn')
          .eq('active', true);

        if (!activeErr && Array.isArray(activeProfiles)) {
          const activeSet = new Set(
            activeProfiles
              .map((p: any) => (p?.visningsnavn ?? '').toString().trim().toLowerCase())
              .filter(Boolean)
          );
          list = list.filter((r) => activeSet.has(r.visningsnavn.toLowerCase()));
        }

        setRows(list);

        const bedsteMand =
          list.find((s) => (s.koen ?? '').toString().toLowerCase() === 'mand')?.visningsnavn ??
          null;
        const bedsteKvinde =
          list.find((s) => (s.koen ?? '').toString().toLowerCase() === 'kvinde')?.visningsnavn ??
          null;

        setBestMand(bedsteMand);
        setBestKvinde(bedsteKvinde);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Hent mit visningsnavn + Elo (afhænger af rows)
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

      const { data: prof } = await (supabase
        .from('profiles') as any)
        .select('visningsnavn')
        .eq('id', user.id)
        .maybeSingle();

      const visningsnavn =
        (prof?.visningsnavn ?? (user.user_metadata as any)?.visningsnavn ?? '')?.toString().trim() ||
        null;

      setMyName(visningsnavn);

      if (visningsnavn) {
        const me = rows.find(
          (r) => r.visningsnavn.toLowerCase() === visningsnavn.toLowerCase(),
        );
        setMyElo(me ? me.elo : null);
      } else {
        setMyElo(null);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [rows]);

  if (loading) {
    return (
      <main className="min-h-screen py-10 px-4 sm:px-8 md:px-16 bg-white dark:bg-[#1e1e1e] text-gray-900 dark:text-white">
        <h1 className="text-2xl sm:text-4xl font-bold text-center text-pink-600 mb-6">📋 Ranglisten</h1>
        <p className="text-center opacity-70">Indlæser…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen py-10 px-4 sm:px-8 md:px-16 bg-white dark:bg-[#1e1e1e] text-gray-900 dark:text-white font-sans">
      <TopBar />

      <h1 className="text-2xl sm:text-4xl font-bold text-center text-pink-600 mb-10">
        📋 Ranglisten
      </h1>

      {rows.length === 0 ? (
        <p className="text-center text-gray-500 dark:text-gray-400">Ingen spillere i ranglisten</p>
      ) : (
        <RanglisteList rows={rows} bedsteMand={bestMand} bedsteKvinde={bestKvinde} myName={myName} myElo={myElo} />
      )}
    </main>
  );
}

/* ───────── UI: top HØJRE – tilbage ───────── */

function TopBar() {
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col items-end gap-2">
      <Link
        href="/startside"
        aria-label="Tilbage"
        title="Tilbage"
        className="px-3 py-1.5 rounded-full border-2 border-pink-500 text-pink-600 bg-white/90 dark:bg-[#2a2a2a]/90 shadow hover:bg-pink-50 dark:hover:bg-pink-900/20 transition"
      >
        Tilbage →
      </Link>
    </div>
  );
}

/* ───────── Liste + søgning/scroll ───────── */

function RanglisteList({
  rows,
  bedsteMand,
  bedsteKvinde,
  myName,
  myElo,
}: {
  rows: Spiller[];
  bedsteMand: string | null;
  bedsteKvinde: string | null;
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!q) return;
    const exact = rows.find((r) => norm(r.visningsnavn) === norm(q));
    const target = exact?.visningsnavn ?? matches[0]?.visningsnavn;
    if (target) {
      jumpTo(target);
      setSearchOpen(false);
    }
  }

  return (
    <>
      {/* Toggle søgning (kan blive til højre senere hvis du ønsker) */}
      <button
        type="button"
        onClick={() => setSearchOpen((v) => !v)}
        className="fixed top-4 left-4 translate-x-8 text-2xl leading-none hover:scale-110 transition z-50"
        title={searchOpen ? 'Luk søgning' : 'Søg spiller'}
        aria-label="Søg spiller"
      >
        🔎
      </button>

      {/* Søg-boks */}
      <div
        className={`fixed top-[52px] left-4 z-50 origin-top-left transition-all duration-200 ${
          searchOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'
        }`}
      >
        <div className="mt-2 w-[240px] rounded-xl border border-pink-200 dark:border-pink-900/50 bg-white/90 dark:bg-[#2a2a2a]/90 shadow-lg backdrop-blur p-2">
          <form onSubmit={handleSubmit}>
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Søg visningsnavn…"
              className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1e1e1e] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-pink-500"
            />
          </form>

          {!!matches.length && (
            <ul className="mt-2 max-h-60 overflow-auto">
              {matches.map((m) => (
                <li key={m.visningsnavn}>
                  <button
                    type="button"
                    onClick={() => {
                      jumpTo(m.visningsnavn);
                      setSearchOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-pink-50 dark:hover:bg-pink-900/20 text-sm"
                  >
                    {m.visningsnavn}
                    <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                      #{rows.findIndex((r) => r.visningsnavn === m.visningsnavn) + 1} •{' '}
                      {Math.round(m.elo)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-2 flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400">
            <span>↵ for at gå til første match</span>
            <button
              type="button"
              onClick={() => setSearchOpen(false)}
              className="px-2 py-1 rounded border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-[#1e1e1e]"
            >
              Luk
            </button>
          </div>
        </div>
      </div>

      {/* Selve ranglisten */}
      <ol className="space-y-4 max-w-2xl mx-auto">
        {rows.map((spiller, index) => {
          const erKonge = spiller.visningsnavn === bedsteMand;
          const erDronning = spiller.visningsnavn === bedsteKvinde;
          const isHighlighted = highlighted === spiller.visningsnavn;

          return (
            <li
              key={spiller.visningsnavn}
              ref={(el) => {
                itemRefs.current[spiller.visningsnavn] = el;
              }}
              className={[
                'flex items-center justify-between rounded-2xl px-6 py-4 shadow transition-all',
                index === 0
                  ? 'bg-gradient-to-r from-pink-500 to-pink-400 text-white scale-[1.03]'
                  : index === 1
                  ? 'bg-pink-100 dark:bg-pink-900/30'
                  : index === 2
                  ? 'bg-pink-50 dark:bg-pink-800/20'
                  : 'bg-white dark:bg-[#2a2a2a]',
                isHighlighted ? 'ring-2 ring-pink-500 animate-pulse' : '',
              ].join(' ')}
            >
              {/* Venstre: placering + navn */}
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <span className="text-base sm:text-xl font-bold text-pink-600 dark:text-pink-400">
                  #{index + 1}
                </span>
                <span className="text-sm sm:text-lg font-medium truncate">
                  {spiller.visningsnavn} {erKonge ? '👑' : erDronning ? '👸' : ''}
                </span>
              </div>

              {/* Højre: 🥊 + Elo */}
              <div className="flex items-center gap-2 sm:gap-3">
                <Udfordring
                  recipient={spiller.visningsnavn}
                  recipientElo={spiller.elo}
                  myName={myName}
                  myElo={myElo}
                />
                <span className="text-sm sm:text-base font-semibold whitespace-nowrap tabular-nums">
                  🎾: {Math.round(spiller.elo)}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}

/* ───────── Udfordring (TS-safe Supabase-kald) ───────── */

function Udfordring({
  recipient,
  recipientElo,
  myName,
  myElo,
}: {
  recipient: string;
  recipientElo: number;
  myName: string | null;
  myElo: number | null;
}) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  const isSelf = !!myName && recipient === myName;
  const hasMyElo = typeof myElo === 'number' && !Number.isNaN(myElo);
  const inRange = hasMyElo ? Math.abs((myElo as number) - recipientElo) <= 250 : false;

  if (isSelf) return null;
  if (!hasMyElo) return null;
  if (!inRange) return null;

  function handleOpen(e: React.MouseEvent) {
    e.stopPropagation();
    setBody(`Hej ${recipient}! Frisk på en padelkamp? 🎾.`);
    setOpen(true);
  }

  async function sendMessage() {
    if (sending) return;
    setSending(true);
    try {
      if (isSelf || !hasMyElo || !inRange) throw new Error('not-allowed');

      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;
      if (!user) {
        alert('Du skal være logget ind for at udfordre.');
        return;
      }

      const { data: rec, error: recErr } = await (supabase
        .from('profiles') as any)
        .select('id, visningsnavn')
        .eq('visningsnavn', recipient)
        .maybeSingle();

      if (recErr || !rec) {
        alert('Kunne ikke finde spilleren.');
        return;
      }

      const senderName =
        ((user.user_metadata as any)?.visningsnavn ?? 'Ukendt spiller')?.toString().trim();

      const row = {
        sender_id: user.id,
        sender_visningsnavn: senderName,
        recipient_id: rec.id,
        recipient_visningsnavn: rec.visningsnavn,
        body: body.trim(),
      };

      const { error: insErr } = await (supabase.from('beskeder') as any).insert(row);
      if (insErr) throw insErr;

      try {
        await notifyUser({
          user_id: rec.id,
          title: 'Ny udfordring',
          body: `${senderName}: ${body.trim()}`,
          url: '/beskeder',
        });
      } catch (e) {
        console.warn('Kunne ikke sende push (udfordring):', e);
      }

      setOpen(false);
      setBody('');
      alert('Udfordring sendt!');
    } catch (e: any) {
      if (e?.message === 'not-allowed') {
        alert('Du kan kun udfordre spillere inden for ±250 Elo og ikke dig selv.');
      } else {
        console.error(e);
        alert('Noget gik galt. Prøv igen.');
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        title={`Udfordr ${recipient}`}
        aria-label={`Udfordr ${recipient}`}
        onClick={handleOpen}
        className="ml-1 shrink-0 text-xl leading-none hover:scale-110 transition"
      >
        🥊
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-3"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full sm:max-w-md bg-white dark:bg-[#2a2a2a] rounded-2xl shadow-xl p-4 sm:p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">
                Udfordr <span className="text-pink-600">{recipient}</span>
              </h2>
              <button
                className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                onClick={() => setOpen(false)}
                aria-label="Luk"
              >
                ✖
              </button>
            </div>

            <label className="block text-sm mb-2">Besked</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white/70 dark:bg-[#1e1e1e] p-3 outline-none focus:ring-2 focus:ring-pink-500"
              placeholder="Skriv din udfordring…"
            />

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-700"
              >
                Annullér
              </button>
              <button
                type="button"
                onClick={sendMessage}
                disabled={sending || !body.trim()}
                className="px-4 py-2 rounded-xl bg-pink-600 hover:bg-pink-700 text-white disabled:opacity-60"
              >
                {sending ? 'Sender…' : 'Send udfordring'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

