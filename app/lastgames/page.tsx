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

function issueText(count: number | undefined) {
  return count && count > 1
    ? `Resultatet er indrapporteret for fejl (${count} kommentarer).`
    : 'Resultatet er indrapporteret for fejl.';
}

export default function SenesteKampeSide() {
  const [kampGrupper, setKampGrupper] = useState<ResultMatchCard[]>([]);
  const [fejlIndrapporteret, setFejlIndrapporteret] = useState<Record<number, boolean>>({});
  const [forslag, setForslag] = useState<
    Record<number, { comment: string; sets: Record<number, { scoreA: string; scoreB: string }> }>
  >({});
  const [sendingKampid, setSendingKampid] = useState<number | null>(null);
  const [editingKampid, setEditingKampid] = useState<number | null>(null);
  const [visningsnavn, setVisningsnavn] = useState<string>('Spiller');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/results-feed?view=lastgames', { cache: 'no-store' });
      const data = await res.json();
      setVisningsnavn(typeof data?.visningsnavn === 'string' ? data.visningsnavn : 'Spiller');
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

  async function hentVisningsnavn(): Promise<string | null> {
    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;
    if (!user) return null;

    const profRes = await (supabase.from('profiles') as any)
      .select('visningsnavn')
      .eq('id', user.id)
      .maybeSingle();

    const profileData = (profRes?.data ?? null) as { visningsnavn?: string } | null;
    let navn = (profileData?.visningsnavn ?? '').toString().trim();
    if (!navn) navn = ((user.user_metadata as any)?.visningsnavn ?? '').toString().trim();
    if (!navn) {
      navn =
        ((user.user_metadata as any)?.name ?? '').toString().trim() ||
        (user.email ? user.email.split('@')[0] : '');
    }

    return navn || null;
  }

  function updateDraftScore(kampid: number, setId: number, field: 'scoreA' | 'scoreB', value: string) {
    setForslag((prev) => ({
      ...prev,
      [kampid]: {
        comment: prev[kampid]?.comment ?? '',
        sets: {
          ...(prev[kampid]?.sets ?? {}),
          [setId]: {
            scoreA: field === 'scoreA' ? value : prev[kampid]?.sets?.[setId]?.scoreA ?? '',
            scoreB: field === 'scoreB' ? value : prev[kampid]?.sets?.[setId]?.scoreB ?? '',
          },
        },
      },
    }));
  }

  function updateDraftComment(kampid: number, value: string) {
    setForslag((prev) => ({
      ...prev,
      [kampid]: {
        comment: value,
        sets: prev[kampid]?.sets ?? {},
      },
    }));
  }

  async function submitChangeRequest(kampid: number, sets: ResultMatchCard['sets']) {
    const navn = await hentVisningsnavn();
    if (!navn) {
      alert('Du skal være logget ind for at sende besked.');
      return;
    }

    const draft = forslag[kampid];
    const payloadSets = sets.map((set) => ({
      id: set.id,
      scoreA: Number(draft?.sets?.[set.id]?.scoreA ?? set.scoreA),
      scoreB: Number(draft?.sets?.[set.id]?.scoreB ?? set.scoreB),
    }));

    if (payloadSets.some((set) => !Number.isFinite(set.scoreA) || !Number.isFinite(set.scoreB))) {
      alert('Udfyld gyldige cifre for alle sæt.');
      return;
    }

    setSendingKampid(kampid);
    const res = await fetch('/api/result-change-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kampid,
        comment: draft?.comment ?? '',
        sets: payloadSets,
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      alert(data?.error || 'Kunne ikke sende ændringsforslag.');
      setSendingKampid(null);
      return;
    }

    alert('Ændringsforslag sendt til admin.');
    setFejlIndrapporteret((prev) => ({ ...prev, [kampid]: true }));
    setSendingKampid(null);
    setEditingKampid(null);
  }

  if (loading) return <LoadingState text="Indlæser seneste kampe..." />;

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
                Fælles overblik
              </p>
              <h1 className="mt-1 text-2xl font-black tracking-tight">
                Seneste kampe
              </h1>
            </div>

            <Link
              href={`/profil/${encodeURIComponent(visningsnavn)}`}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#ffd44d] text-xs font-black text-[#463018]"
              aria-label="Min profil"
            >
              {initials(visningsnavn)}
            </Link>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 pb-28 pt-4 md:px-6">
          <div className="space-y-3">
            <section className="rounded-[18px] bg-white p-3 shadow-[0_2px_12px_rgba(0,0,0,0.07)]">
              <div className="mb-2 flex items-center justify-between gap-3">
                <h2 className="text-[13px] font-bold uppercase tracking-[0.12em] text-[#2d3340]">
                  Seneste 50 kampe
                </h2>
                <span className="rounded-full bg-[#fff8e8] px-3 py-1 text-[11px] font-bold text-[#b36b00]">
                  {kampGrupper.length} kampe
                </span>
              </div>

              {kampGrupper.length === 0 ? (
                <div className="rounded-[14px] bg-[#fbfbfc] p-3 text-sm text-[#6d7280]">
                  Ingen kampe fundet endnu.
                </div>
              ) : (
                <div className="space-y-3">
                  {kampGrupper.map(
                    ({ kampid, sets, indberettetAf, eloSummary, date, adminIssueOpen, adminIssueCount }) => {
                    const canSuggest = sets.some((set) =>
                      [set.holdA1, set.holdA2, set.holdB1, set.holdB2].includes(visningsnavn)
                    );
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

                        {adminIssueOpen ? (
                          <div className="mb-3 rounded-[12px] border border-[#f8bfd0] bg-[#fff3f8] px-3 py-2 text-sm font-semibold text-[#c0135a]">
                            {issueText(adminIssueCount)} Afventer admin.
                          </div>
                        ) : null}

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

                        {canSuggest ? (
                        <div className="mt-3 rounded-[12px] bg-white p-2.5">
                          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-[#838999]">
                            Foreslå nyt resultat
                          </label>
                          {fejlIndrapporteret[kampid] || adminIssueOpen ? (
                            <div className="rounded-[10px] bg-[#fff3f8] px-3 py-2 text-sm font-semibold text-[#c0135a]">
                              {issueText(adminIssueCount)}
                            </div>
                          ) : (
                            <>
                              <button
                                onClick={() => setEditingKampid(kampid)}
                                className="inline-flex items-center justify-center rounded-full border-2 border-pink-500 bg-white px-3 py-1 text-xs font-semibold text-pink-600 shadow transition hover:bg-pink-50"
                              >
                                Ret resultat
                              </button>
                            </>
                          )}
                        </div>
                        ) : null}

                        {editingKampid === kampid ? (
                          <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-3 md:items-center">
                            <div className="w-full max-w-[520px] rounded-[24px] bg-white p-4 shadow-[0_28px_80px_rgba(0,0,0,0.35)]">
                              <div className="mb-3 flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#838999]">
                                    Kamp #{kampid}
                                  </p>
                                  <h3 className="text-lg font-black text-[#1f2430]">
                                    Foreslå nyt resultat
                                  </h3>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setEditingKampid(null)}
                                  className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#f4f5f7] text-[#5f6673]"
                                >
                                  ✕
                                </button>
                              </div>

                              <div className="space-y-2">
                                {sets.map((set, index) => (
                                  <div
                                    key={set.id}
                                    className="flex items-center justify-between gap-3 rounded-[12px] bg-[#fbfbfc] px-3 py-2"
                                  >
                                    <span className="text-xs font-bold uppercase tracking-[0.12em] text-[#838999]">
                                      Sæt {index + 1}
                                    </span>
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="number"
                                        min="0"
                                        inputMode="numeric"
                                        value={forslag[kampid]?.sets?.[set.id]?.scoreA ?? String(set.scoreA)}
                                        onChange={(e) =>
                                          updateDraftScore(kampid, set.id, 'scoreA', e.target.value)
                                        }
                                        className="h-10 w-16 rounded-[10px] border border-zinc-200 bg-white px-2 text-center text-sm font-bold text-[#1f2430] outline-none"
                                      />
                                      <span className="text-sm font-bold text-[#838999]">-</span>
                                      <input
                                        type="number"
                                        min="0"
                                        inputMode="numeric"
                                        value={forslag[kampid]?.sets?.[set.id]?.scoreB ?? String(set.scoreB)}
                                        onChange={(e) =>
                                          updateDraftScore(kampid, set.id, 'scoreB', e.target.value)
                                        }
                                        className="h-10 w-16 rounded-[10px] border border-zinc-200 bg-white px-2 text-center text-sm font-bold text-[#1f2430] outline-none"
                                      />
                                    </div>
                                  </div>
                                ))}
                              </div>

                              <textarea
                                placeholder="Kort note til admin (valgfrit)..."
                                value={forslag[kampid]?.comment ?? ''}
                                onChange={(e) => updateDraftComment(kampid, e.target.value)}
                                className="mb-3 mt-3 min-h-[90px] w-full rounded-[12px] border border-zinc-200 bg-[#fbfbfc] px-3 py-2 text-sm outline-none"
                              />

                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => setEditingKampid(null)}
                                  className="inline-flex items-center justify-center rounded-full bg-[#f4f5f7] px-4 py-2 text-sm font-semibold text-[#5f6673]"
                                >
                                  Annuller
                                </button>
                                <button
                                  onClick={() => submitChangeRequest(kampid, sets)}
                                  disabled={sendingKampid === kampid}
                                  className="inline-flex items-center justify-center rounded-full bg-[#f01f78] px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-[#d21869] disabled:opacity-60"
                                >
                                  {sendingKampid === kampid ? 'Sender...' : 'Send til admin'}
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : null}
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
            { href: `/profil/${encodeURIComponent(visningsnavn)}`, icon: '🧑‍🎾', label: 'Profil' },
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
