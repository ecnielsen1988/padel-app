'use client';
export const dynamic = 'force-dynamic';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { ResultMatchCard } from '@/lib/resultsFeed';
import { LoadingState, PageShell } from '../components/ui';

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function formatShortDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('da-DK', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function MineKampeSide() {
  const [kampGrupper, setKampGrupper] = useState<ResultMatchCard[]>([]);
  const [kommentarer, setKommentarer] = useState<Record<number, string>>({});
  const [fejlIndrapporteret, setFejlIndrapporteret] = useState<Record<number, boolean>>({});
  const [mitNavn, setMitNavn] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/results-feed?view=mine', { cache: 'no-store' });
      const data = await res.json();
      setMitNavn(typeof data?.visningsnavn === 'string' ? data.visningsnavn : null);
      setKampGrupper(Array.isArray(data?.matches) ? data.matches : []);
      setLoading(false);
    })();
  }, []);

  function getEmojiForEloDiff(diff: number): string {
    if (diff >= 100) return '🍾';
    if (diff >= 50) return '🏆';
    if (diff >= 40) return '🏅';
    if (diff >= 30) return '☄️';
    if (diff >= 20) return '🚀';
    if (diff >= 10) return '🔥';
    if (diff >= 5) return '📈';
    if (diff >= 0) return '💪';
    if (diff > -5) return '🎲';
    if (diff > -10) return '📉';
    if (diff > -20) return '🧯';
    if (diff > -30) return '🪂';
    if (diff > -40) return '❄️';
    if (diff > -50) return '🙈';
    if (diff > -100) return '🥊';
    if (diff > -150) return '💩';
    return '💩💩';
  }

  async function sendBeskedTilAdmin(kampid: number) {
    const raw = kommentarer[kampid];
    const besked = (raw ?? '').toString().trim();
    if (!besked) {
      alert('Skriv hvad der er forkert, før du sender.');
      return;
    }

    if (!mitNavn) {
      alert('Du skal være logget ind for at sende besked.');
      return;
    }

    const insertRes = await (supabase.from('admin_messages') as any).insert([
      {
        kampid,
        besked,
        tidspunkt: new Date().toISOString(),
        visningsnavn: mitNavn,
      },
    ]);
    const error = insertRes?.error as any;

    if (error) {
      alert('Kunne ikke sende besked: ' + error.message);
    } else {
      alert('Besked sendt til admin.');
      setKommentarer((prev) => ({ ...prev, [kampid]: '' }));
      setFejlIndrapporteret((prev) => ({ ...prev, [kampid]: true }));
    }
  }

  if (loading && !mitNavn) {
    return <LoadingState text="Indlæser dine kampe..." />;
  }

  if (!mitNavn) {
    return (
      <PageShell className="bg-[#1a1a2e] px-0 py-0 md:px-6 md:py-6">
        <div className="mx-auto flex min-h-screen w-full max-w-[820px] items-center justify-center bg-[#f4f5f7] p-6 md:min-h-[min(100vh,980px)] md:rounded-[34px] md:border md:border-white/10 md:shadow-[0_28px_80px_rgba(0,0,0,0.35)]">
          <div className="rounded-[20px] bg-white p-6 text-center shadow-[0_2px_12px_rgba(0,0,0,0.07)]">
            <h1 className="text-2xl font-black text-[#1f2430]">Dine seneste kampe</h1>
            <p className="mt-2 text-sm text-[#6d7280]">
              Du skal være logget ind for at se dine kampe.
            </p>
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
                if (typeof window !== 'undefined') window.history.back()
              }}
              className="inline-flex items-center rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-bold text-white backdrop-blur transition hover:bg-white/25"
            >
              ← Tilbage
            </button>
            <span>
              {new Intl.DateTimeFormat('da-DK', {
                hour: '2-digit',
                minute: '2-digit',
              }).format(new Date())}
            </span>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/75">
                Personligt overblik
              </p>
              <h1 className="mt-1 text-2xl font-black tracking-tight">
                Mine resultater
              </h1>
            </div>

            <Link
              href={`/profil/${encodeURIComponent(mitNavn)}`}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#ffd44d] text-xs font-black text-[#463018]"
              aria-label="Min profil"
            >
              {initials(mitNavn)}
            </Link>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 pb-28 pt-4 md:px-6">
          <div className="space-y-3">
            <section className="rounded-[18px] bg-white p-3 shadow-[0_2px_12px_rgba(0,0,0,0.07)]">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h2 className="text-[13px] font-bold uppercase tracking-[0.12em] text-[#2d3340]">
                  Dine seneste 20 kampe
                </h2>
                <span className="rounded-full bg-[#fff0f5] px-3 py-1 text-[11px] font-bold text-[#f01f78]">
                  {kampGrupper.length} kampe
                </span>
              </div>

              {kampGrupper.length === 0 ? (
                <div className="rounded-[14px] bg-[#fbfbfc] p-3 text-sm text-[#6d7280]">
                  Ingen kampe fundet endnu.
                </div>
              ) : (
                <div className="space-y-3">
                  {kampGrupper.map(({ kampid, sets, indberettetAf, eloSummary, date }) => {
                    return (
                      <article
                        key={kampid}
                        className="rounded-[16px] bg-[#fbfbfc] p-3 shadow-[0_1px_8px_rgba(0,0,0,0.04)]"
                      >
                        <div className="mb-2 flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-extrabold text-[#1f2430]">
                              Kamp #{kampid}
                            </p>
                            <p className="text-xs text-[#838999]">
                              {formatShortDate(date)}
                            </p>
                          </div>
                          {(indberettetAf ?? '').toString().trim() ? (
                            <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-semibold text-[#7a808c]">
                              {(indberettetAf ?? '').toString().trim()}
                            </span>
                          ) : null}
                        </div>

                        <div className="space-y-1">
                          {sets.map((kamp) => {
                            return (
                              <div
                                key={kamp.id}
                                className="rounded-[10px] bg-white px-2.5 py-1.5 text-[13px] text-[#414754]"
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div className="min-w-0 flex-1 truncate">
                                    <span className="font-semibold text-[#1f2430]">
                                      {kamp.holdA1} & {kamp.holdA2}
                                    </span>
                                    <span className="mx-1 opacity-60">vs</span>
                                    <span className="font-semibold text-[#1f2430]">
                                      {kamp.holdB1} & {kamp.holdB2}
                                    </span>
                                  </div>
                                  <div className="shrink-0 text-right">
                                    <div className="flex items-center gap-2">
                                      <span className="text-[13px] font-black text-[#1f2430]">
                                        {kamp.scoreA} - {kamp.scoreB}
                                      </span>
                                      <span className="text-[11px] font-semibold text-[#1f7a5a]">
                                        +{kamp.setElo.toFixed(1)}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div className="mt-3 space-y-1 rounded-[12px] bg-white p-2.5">
                          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#838999]">
                            Elo før og efter kampen
                          </p>
                          {eloSummary.map((elo) => (
                            <div
                              key={elo.navn}
                              className="flex items-center justify-between gap-3 text-[12px]"
                            >
                              <div className="min-w-0">
                                <span className="mr-1.5">{getEmojiForEloDiff(elo.diff)}</span>
                                <span className="font-bold text-[#1f2430]">{elo.navn}</span>
                              </div>
                              <div
                                className={[
                                  'shrink-0 text-right text-[11px] font-semibold',
                                  elo.diff > 0
                                    ? 'text-[#1f7a5a]'
                                    : elo.diff < 0
                                      ? 'text-[#c62828]'
                                      : 'text-[#7a808c]',
                                ].join(' ')}
                              >
                                <span className="text-[#1f2430]">
                                  {elo.before.toFixed(1)} → {elo.after.toFixed(1)}
                                </span>{' '}
                                <span>
                                  ({elo.diff > 0 ? '+' : ''}
                                  {elo.diff.toFixed(1)})
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="mt-3 rounded-[12px] bg-white p-2.5">
                          <label
                            className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-[#838999]"
                          >
                            Indberet fejl i kampen
                          </label>
                          {fejlIndrapporteret[kampid] ? (
                            <div className="rounded-[10px] bg-[#fff3f8] px-3 py-2 text-sm font-semibold text-[#c0135a]">
                              Resultatet er indrapporteret for fejl.
                            </div>
                          ) : (
                            <>
                              <textarea
                                placeholder="Skriv hvad der er forkert..."
                                value={kommentarer[kampid] || ''}
                                onChange={(e) =>
                                  setKommentarer((prev) => ({
                                    ...prev,
                                    [kampid]: e.target.value,
                                  }))
                                }
                                className="mb-2.5 min-h-[68px] w-full rounded-[10px] border border-zinc-200 bg-[#fbfbfc] px-3 py-2 text-sm outline-none"
                              />
                              <button
                                onClick={() => sendBeskedTilAdmin(kampid)}
                                className="inline-flex items-center justify-center rounded-full border-2 border-pink-500 bg-white px-3 py-1 text-xs font-semibold text-pink-600 shadow transition hover:bg-pink-50"
                              >
                                📩 Send besked
                              </button>
                            </>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </div>

        <nav className="absolute inset-x-0 bottom-0 flex justify-around border-t border-black/5 bg-white px-2 pb-5 pt-3 md:static md:pb-4">
          {[
            { href: '/startside', icon: '🏠', label: 'Hjem' },
            { href: '/ranglister', icon: '📊', label: 'Rangliste' },
            { href: '/kommende', icon: '📅', label: 'Events' },
            { href: `/profil/${encodeURIComponent(mitNavn)}`, icon: '🧑‍🎾', label: 'Profil' },
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
