'use client';
export const dynamic = 'force-dynamic';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { PageShell } from '../components/ui';
import { supabase } from '@/lib/supabaseClient';
import { notifyUser } from '@/lib/notify';

type Spiller = { visningsnavn: string; elo: number; koen: string | null };

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export default function NyRanglisteSide() {
  const [rows, setRows] = useState<Spiller[]>([]);
  const [bestMand, setBestMand] = useState<string | null>(null);
  const [bestKvinde, setBestKvinde] = useState<string | null>(null);
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

        const { data: activeProfiles, error: activeErr } = await (supabase.from('profiles') as any)
          .select('visningsnavn')
          .eq('status', 'active');

        if (!activeErr && Array.isArray(activeProfiles)) {
          const activeSet = new Set(
            activeProfiles
              .map((profile: any) => (profile?.visningsnavn ?? '').toString().trim().toLowerCase())
              .filter(Boolean)
          );
          list = list.filter((row) => activeSet.has(row.visningsnavn.toLowerCase()));
        }

        setRows(list);
        setBestMand(
          list.find((spiller) => (spiller.koen ?? '').toString().toLowerCase() === 'mand')?.visningsnavn ??
            null
        );
        setBestKvinde(
          list.find((spiller) => (spiller.koen ?? '').toString().toLowerCase() === 'kvinde')?.visningsnavn ??
            null
        );
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

      const { data: prof } = await (supabase.from('profiles') as any)
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

  if (loading) {
    return (
      <PageShell className="bg-[#1a1a2e] px-0 py-0 md:px-6 md:py-6">
        <div className="mx-auto flex min-h-screen w-full max-w-[820px] items-center justify-center bg-[#f4f5f7] p-6 md:min-h-[min(100vh,980px)] md:rounded-[34px] md:border md:border-white/10 md:shadow-[0_28px_80px_rgba(0,0,0,0.35)]">
          <div className="rounded-[20px] bg-white p-6 text-center shadow-[0_2px_12px_rgba(0,0,0,0.07)]">
            <h1 className="text-2xl font-black text-[#1f2430]">Ranglisten</h1>
            <p className="mt-2 text-sm text-[#6d7280]">Indlæser…</p>
          </div>
        </div>
      </PageShell>
    );
  }

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
              <h1 className="mt-1 text-2xl font-black tracking-tight">Ranglisten</h1>
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
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">Aktive</p>
              <p className="mt-1 text-xl font-black">{rows.length}</p>
            </div>
            <div className="rounded-[18px] bg-white/14 px-3 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">Fører</p>
              <p className="mt-1 truncate text-sm font-black">{rows[0]?.visningsnavn ?? '–'}</p>
            </div>
            <div className="rounded-[18px] bg-white/14 px-3 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">Din Elo</p>
              <p className="mt-1 text-xl font-black">{typeof myElo === 'number' ? Math.round(myElo) : '–'}</p>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 pb-28 pt-4 md:px-6">
          <div className="space-y-4">
            {rows.length === 0 ? (
              <section className="rounded-[20px] bg-white p-4 text-sm text-[#6d7280] shadow-[0_2px_12px_rgba(0,0,0,0.07)]">
                Ingen spillere i ranglisten.
              </section>
            ) : (
              <RanglisteList
                rows={rows}
                bedsteMand={bestMand}
                bedsteKvinde={bestKvinde}
                myName={myName}
                myElo={myElo}
              />
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
    <>
      <section className="rounded-[20px] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.07)]">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-[13px] font-bold uppercase tracking-[0.12em] text-[#2d3340]">
            Hele ranglisten
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
            const erKonge = spiller.visningsnavn === bedsteMand;
            const erDronning = spiller.visningsnavn === bedsteKvinde;
            const isMe = !!myName && spiller.visningsnavn === myName;
            const isHighlighted = highlighted === spiller.visningsnavn;

            return (
              <li
                key={spiller.visningsnavn}
                ref={(el) => {
                  itemRefs.current[spiller.visningsnavn] = el;
                }}
                className={[
                  'rounded-[18px] border px-4 py-3 transition',
                  isMe ? 'border-[#f7a9c8] bg-[#fff0f5]' : 'border-[#ececf1] bg-[#fbfbfc]',
                  isHighlighted ? 'ring-2 ring-[#f01f78]' : '',
                ].join(' ')}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black text-[#f01f78]">#{index + 1}</span>
                      <Link
                        href={`/profil/${encodeURIComponent(spiller.visningsnavn)}`}
                        className="truncate text-sm font-bold text-[#1f2430]"
                      >
                        {spiller.visningsnavn} {erKonge ? '👑' : erDronning ? '👸' : ''}
                      </Link>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Udfordring recipient={spiller.visningsnavn} recipientElo={spiller.elo} myName={myName} myElo={myElo} />
                    <span className="text-sm font-bold text-[#1f2430]">🎾 {Math.round(spiller.elo)}</span>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </section>
    </>
  );
}

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

  if (isSelf || !hasMyElo || !inRange) return null;

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

      const { data: rec, error: recErr } = await (supabase.from('profiles') as any)
        .select('id, visningsnavn')
        .eq('visningsnavn', recipient)
        .maybeSingle();

      if (recErr || !rec) {
        alert('Kunne ikke finde spilleren.');
        return;
      }

      const senderName = ((user.user_metadata as any)?.visningsnavn ?? 'Ukendt spiller')?.toString().trim();

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
        className="rounded-full bg-white px-3 py-1 text-[11px] font-bold text-[#1f2430] shadow-[0_1px_4px_rgba(0,0,0,0.08)]"
      >
        🥊
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full rounded-2xl bg-white p-4 shadow-xl sm:max-w-md sm:p-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">
                Udfordr <span className="text-pink-600">{recipient}</span>
              </h2>
              <button className="text-gray-500 hover:text-gray-700" onClick={() => setOpen(false)} aria-label="Luk">
                ✖
              </button>
            </div>

            <label className="mb-2 block text-sm">Besked</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              className="w-full rounded-xl border border-gray-300 bg-white p-3 outline-none focus:ring-2 focus:ring-pink-500"
              placeholder="Skriv din udfordring…"
            />

            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-gray-300 px-4 py-2">
                Annullér
              </button>
              <button
                type="button"
                onClick={sendMessage}
                disabled={sending || !body.trim()}
                className="rounded-xl bg-pink-600 px-4 py-2 text-white disabled:opacity-60"
              >
                {sending ? 'Sender…' : 'Send udfordring'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
