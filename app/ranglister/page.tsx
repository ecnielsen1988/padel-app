'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { LoadingState, LoggedOutState, PageShell } from '../components/ui';

type UserProfile = {
  visningsnavn: string;
  rolle: string | null;
  torsdagspadel: boolean | null;
};

type RankLink = {
  href: string;
  icon: string;
  title: string;
  subtitle: string;
};

type PreviewRow = {
  visningsnavn: string;
  elo?: number;
  pluspoint?: number;
  sæt?: number;
};

type PreviewSection = {
  href: string;
  icon: string;
  title: string;
  subtitle: string;
  accentClass: string;
  metric: 'elo' | 'pluspoint' | 'sets';
  rows: PreviewRow[];
};

function extractArray(raw: unknown) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.data)) return obj.data;
    if (Array.isArray(obj.items)) return obj.items;
  }
  return [];
}

async function fetchAllNewresults() {
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

function buildDisplayRows(rows: PreviewRow[], myName: string | null) {
  const topThree = rows.slice(0, 3);
  if (!myName) return topThree;

  const myIndex = rows.findIndex(
    (row) => row.visningsnavn.toLowerCase() === myName.trim().toLowerCase()
  );

  if (myIndex === -1) return topThree;

  const extra = rows.slice(Math.max(0, myIndex - 1), myIndex + 2);
  const merged = [...topThree, ...extra];
  const seen = new Set<string>();

  return merged.filter((row) => {
    const key = row.visningsnavn.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default function RanglisterPage() {
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [previewSections, setPreviewSections] = useState<PreviewSection[]>([]);

  useEffect(() => {
    let mounted = true;

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;

      if (!user) {
        if (mounted) {
          setLoggedIn(false);
          setLoading(false);
        }
        return;
      }

      const { data: p } = await (supabase.from('profiles') as any)
        .select('visningsnavn, rolle, torsdagspadel')
        .eq('id', user.id)
        .maybeSingle();

      const [ranglisteRaw, monthlyRaw, allSets, womenProfiles] = await Promise.all([
        fetch('/api/rangliste', { cache: 'no-store' })
          .then((res) => res.json())
          .catch(() => []),
        fetch('/api/monthly', { cache: 'no-store' })
          .then((res) => res.json())
          .catch(() => ({ data: [] })),
        fetchAllNewresults().catch(() => []),
        supabase
          .from('profiles')
          .select('visningsnavn')
          .eq('status', 'active')
          .eq('koen', 'kvinde'),
      ]);

      if (!mounted) return;

      setLoggedIn(true);
      setProfile({
        visningsnavn: String(
          p?.visningsnavn ??
            (user.user_metadata as any)?.visningsnavn ??
            user.email ??
            'Spiller'
        ),
        rolle: p?.rolle ?? null,
        torsdagspadel: !!p?.torsdagspadel,
      });

      const rangliste = extractArray(ranglisteRaw)
        .map((row) => ({
          visningsnavn: String((row as { visningsnavn?: unknown }).visningsnavn ?? '').trim(),
          elo: Number((row as { elo?: unknown }).elo ?? 0),
        }))
        .filter((row) => row.visningsnavn && Number.isFinite(row.elo));

      const monthly = extractArray(monthlyRaw)
        .map((row) => ({
          visningsnavn: String((row as { visningsnavn?: unknown }).visningsnavn ?? '').trim(),
          pluspoint: Number((row as { pluspoint?: unknown }).pluspoint ?? 0),
        }))
        .filter((row) => row.visningsnavn && Number.isFinite(row.pluspoint));

      const eloMap = new Map(
        extractArray(ranglisteRaw)
          .map((row) => [
            String((row as { visningsnavn?: unknown }).visningsnavn ?? '').trim().toLowerCase(),
            Number((row as { elo?: unknown }).elo ?? 0),
          ] as const)
          .filter(([name, elo]) => name && Number.isFinite(elo))
      );

      const eggMap = new Map<string, number>();
      const winBestMap = new Map<string, number>();
      const playWeekMap = new Map<string, Map<string, number>>();
      const currentWinMap = new Map<string, number>();
      const activeSetCountMap = new Map<string, number>();

      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth();

      for (const k of allSets as any[]) {
        const finished = k.finish === true || k.finish === 'true' || k.finish === 1;
        if (!finished) continue;

        const ha1 = String(k.holda1 ?? k.holdA1 ?? '').trim();
        const ha2 = String(k.holda2 ?? k.holdA2 ?? '').trim();
        const hb1 = String(k.holdb1 ?? k.holdB1 ?? '').trim();
        const hb2 = String(k.holdb2 ?? k.holdB2 ?? '').trim();
        const players = [ha1, ha2, hb1, hb2].filter(Boolean);

        const rawA = k.scorea ?? k.scoreA;
        const rawB = k.scoreb ?? k.scoreB;
        const scoreA = typeof rawA === 'number' ? rawA : parseInt(rawA ?? '0', 10);
        const scoreB = typeof rawB === 'number' ? rawB : parseInt(rawB ?? '0', 10);
        if (!Number.isFinite(scoreA) || !Number.isFinite(scoreB) || scoreA === scoreB) continue;

        const dateStr = String(k.date ?? '');
        const dateObj = dateStr ? new Date(dateStr) : null;
        if (
          dateObj &&
          !Number.isNaN(dateObj.getTime()) &&
          dateObj.getFullYear() === year &&
          dateObj.getMonth() === month
        ) {
          for (const navn of players) {
            activeSetCountMap.set(navn, (activeSetCountMap.get(navn) ?? 0) + 1);
          }
        }

        if (scoreA === 6 && scoreB === 0) {
          [ha1, ha2].filter(Boolean).forEach((name) => {
            eggMap.set(name, (eggMap.get(name) ?? 0) + 1);
          });
        } else if (scoreB === 6 && scoreA === 0) {
          [hb1, hb2].filter(Boolean).forEach((name) => {
            eggMap.set(name, (eggMap.get(name) ?? 0) + 1);
          });
        }

        const aWon = scoreA > scoreB;
        for (const navn of players) {
          const isA = navn === ha1 || navn === ha2;
          const won = (isA && aWon) || (!isA && !aWon);
          const current = currentWinMap.get(navn) ?? 0;
          const next = won ? current + 1 : 0;
          currentWinMap.set(navn, next);
          if (next > (winBestMap.get(navn) ?? 0)) winBestMap.set(navn, next);
        }

        const dt = new Date(dateStr);
        if (!dateStr || Number.isNaN(dt.getTime())) continue;
        const weekday = (dt.getDay() + 6) % 7;
        const weekStart = new Date(dt);
        weekStart.setDate(dt.getDate() - weekday);
        weekStart.setHours(0, 0, 0, 0);
        const weekKey = weekStart.toISOString().slice(0, 10);

        for (const navn of players) {
          let weekCounts = playWeekMap.get(navn);
          if (!weekCounts) {
            weekCounts = new Map<string, number>();
            playWeekMap.set(navn, weekCounts);
          }
          weekCounts.set(weekKey, (weekCounts.get(weekKey) ?? 0) + 1);
        }
      }

      const eggRows = Array.from(eggMap.entries())
        .map(([visningsnavn, eggs]) => ({ visningsnavn, pluspoint: eggs }))
        .sort((a, b) => (b.pluspoint ?? 0) - (a.pluspoint ?? 0) || (eloMap.get(b.visningsnavn.toLowerCase()) ?? 0) - (eloMap.get(a.visningsnavn.toLowerCase()) ?? 0))

      const winRows = Array.from(winBestMap.entries())
        .map(([visningsnavn, streak]) => ({ visningsnavn, pluspoint: streak }))
        .filter((row) => (row.pluspoint ?? 0) > 0)
        .sort((a, b) => (b.pluspoint ?? 0) - (a.pluspoint ?? 0) || a.visningsnavn.localeCompare(b.visningsnavn, 'da'));

      const playRows = Array.from(playWeekMap.entries())
        .map(([visningsnavn, weeks]) => {
          const qualifying = Array.from(weeks.entries())
            .filter(([, count]) => count >= 5)
            .map(([week]) => week)
            .sort();

          let best = 0;
          let current = 0;
          let prev: string | null = null;
          for (const week of qualifying) {
            if (prev) {
              const diff =
                (new Date(week).getTime() - new Date(prev).getTime()) /
                (7 * 24 * 60 * 60 * 1000);
              current = diff === 1 ? current + 1 : 1;
            } else {
              current = 1;
            }
            if (current > best) best = current;
            prev = week;
          }

          return { visningsnavn, pluspoint: best };
        })
        .filter((row) => (row.pluspoint ?? 0) > 0)
        .sort((a, b) => (b.pluspoint ?? 0) - (a.pluspoint ?? 0) || a.visningsnavn.localeCompare(b.visningsnavn, 'da'));

      const monthlyPointsMap = new Map(
        monthly.map((row) => [row.visningsnavn, row.pluspoint ?? 0] as const)
      );

      const activeRows = Array.from(activeSetCountMap.entries())
        .map(([visningsnavn, sæt]) => ({
          visningsnavn,
          sæt,
          pluspoint: monthlyPointsMap.get(visningsnavn) ?? 0,
        }))
        .sort((a, b) => (b.sæt ?? 0) - (a.sæt ?? 0) || (b.pluspoint ?? 0) - (a.pluspoint ?? 0));

      const womenSet = new Set(
        ((womenProfiles.data as Array<{ visningsnavn: string | null }> | null) ?? [])
          .map((row) => String(row.visningsnavn ?? '').trim().toLowerCase())
          .filter(Boolean)
      );

      const womenRows = extractArray(ranglisteRaw)
        .map((row) => ({
          visningsnavn: String((row as { visningsnavn?: unknown }).visningsnavn ?? '').trim(),
          elo: Number((row as { elo?: unknown }).elo ?? 0),
        }))
        .filter(
          (row) =>
            row.visningsnavn &&
            Number.isFinite(row.elo) &&
            womenSet.has(row.visningsnavn.toLowerCase())
        );

      setPreviewSections([
        {
          href: '/nyrangliste',
          icon: '🥇',
          title: 'Ranglisten',
          subtitle: 'Den samlede Elo-top',
          accentClass: 'bg-[#fff0f5]',
          metric: 'elo',
          rows: rangliste,
        },
        {
          href: '/monthly',
          icon: '🌟',
          title: 'Månedens spiller',
          subtitle: 'Mest fremgang denne måned',
          accentClass: 'bg-[#fff8e8]',
          metric: 'pluspoint',
          rows: monthly,
        },
        {
          href: '/active',
          icon: '🏃‍♂️',
          title: 'Mest aktive',
          subtitle: 'Flest spillede sæt',
          accentClass: 'bg-[#eefaf4]',
          metric: 'sets',
          rows: activeRows,
        },
        {
          href: '/women',
          icon: '👸',
          title: 'GirlPower Listen',
          subtitle: 'Kvinderanglistens top 3',
          accentClass: 'bg-[#fff0f5]',
          metric: 'elo',
          rows: womenRows,
        },
        {
          href: '/egg',
          icon: '🥚',
          title: 'Æggejagten',
          subtitle: 'De største bagels',
          accentClass: 'bg-[#fff8e8]',
          metric: 'pluspoint',
          rows: eggRows,
        },
        {
          href: '/winstreak',
          icon: '🔥',
          title: 'Win-Streak',
          subtitle: 'De længste sejrsserier',
          accentClass: 'bg-[#fff0f5]',
          metric: 'pluspoint',
          rows: winRows,
        },
        {
          href: '/playstreak',
          icon: '📆',
          title: '5 Games Streak',
          subtitle: 'Uger med masser af spil',
          accentClass: 'bg-[#eefaf4]',
          metric: 'pluspoint',
          rows: playRows,
        },
      ]);
      setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return <LoadingState />;
  }

  if (!loggedIn || !profile) {
    return (
      <LoggedOutState
        title="Du er ikke logget ind"
        description="Log ind for at se ranglister og følge udviklingen på tværs af huset."
      />
    );
  }

  const topLinks = [
    { href: '/startside', icon: '🏠', label: 'Hjem' },
    { href: '/ranglister', icon: '📊', label: 'Rangliste' },
    { href: '/kommende', icon: '📅', label: 'Events' },
    {
      href: `/profil/${encodeURIComponent(profile.visningsnavn)}`,
      icon: '🧑‍🎾',
      label: 'Profil',
    },
  ];

  return (
    <PageShell className="bg-[#1a1a2e] px-0 py-0 md:px-6 md:py-6">
      <div className="mx-auto flex min-h-screen w-full max-w-[820px] flex-col overflow-hidden bg-[#f4f5f7] md:min-h-[min(100vh,980px)] md:rounded-[34px] md:border md:border-white/10 md:shadow-[0_28px_80px_rgba(0,0,0,0.35)]">
        <header className="bg-gradient-to-br from-[#f01f78] to-[#c0135a] px-4 pb-5 pt-4 text-white md:px-6">
          <div className="mb-4 flex items-center justify-between text-[11px] font-semibold opacity-90">
            <span>Padelhuset</span>
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
                Overblik
              </p>
              <h1 className="mt-1 text-2xl font-black tracking-tight">
                Ranglister
              </h1>
            </div>

            <Link
              href={`/profil/${encodeURIComponent(profile.visningsnavn)}`}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#ffd44d] text-xs font-black text-[#463018]"
              aria-label="Min profil"
            >
              {initials(profile.visningsnavn)}
            </Link>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 pb-28 pt-4 md:px-6">
          <div className="space-y-4">
            <section className="rounded-[20px] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.07)]">
              <div className="mb-3">
                <h2 className="text-[13px] font-bold uppercase tracking-[0.12em] text-[#2d3340]">
                  Top 3 lige nu
                </h2>
              </div>

              <div className="space-y-3">
                {previewSections.map((item) => {
                  const displayRows = buildDisplayRows(
                    item.rows,
                    profile.visningsnavn
                  );

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="block rounded-[18px] bg-[#fbfbfc] px-4 py-4 shadow-[0_1px_8px_rgba(0,0,0,0.04)] transition hover:-translate-y-0.5"
                    >
                      <div className="mb-3 flex items-center gap-3">
                        <span className={`inline-flex h-11 w-11 items-center justify-center rounded-full text-[22px] ${item.accentClass}`}>
                          {item.icon}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-extrabold text-[#1f2430]">
                            {item.title}
                          </p>
                          <p className="text-xs text-[#838999]">{item.subtitle}</p>
                        </div>
                        <span className="text-sm font-bold text-[#f01f78]">Se</span>
                      </div>

                      <div className="space-y-2">
                        {displayRows.length > 0 ? (
                          displayRows.map((row) => {
                            const originalIndex = item.rows.findIndex(
                              (entry) =>
                                entry.visningsnavn.toLowerCase() ===
                                row.visningsnavn.toLowerCase()
                            );
                            const placement = originalIndex + 1;
                            const isMe =
                              row.visningsnavn.toLowerCase() ===
                              profile.visningsnavn.trim().toLowerCase();

                            return (
                              <div
                                key={`${item.href}-${row.visningsnavn}`}
                                className={[
                                  'flex items-center gap-3 rounded-[12px] px-3 py-2',
                                  isMe ? 'bg-[#fff3f8]' : 'bg-white',
                                ].join(' ')}
                              >
                                <span className="w-5 text-center text-sm font-black text-[#505767]">
                                  {placement}
                                </span>
                                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#eceef2] text-[11px] font-black text-[#656b79]">
                                  {initials(row.visningsnavn)}
                                </span>
                                <span className="min-w-0 flex-1 truncate text-sm font-bold text-[#1f2430]">
                                  {row.visningsnavn}
                                </span>
                                <span className="text-xs font-bold text-[#f01f78]">
                                  {item.metric === 'sets'
                                    ? `${row.sæt ?? 0} sæt`
                                    : item.metric === 'elo'
                                      ? `${Math.round(row.elo ?? 0)}`
                                      : `${Math.round(row.pluspoint ?? 0)}`}
                                </span>
                              </div>
                            );
                          })
                        ) : (
                          <div className="rounded-[12px] bg-white px-3 py-2 text-xs text-[#8b92a0]">
                            Ingen data endnu.
                          </div>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          </div>
        </div>

        <nav className="absolute inset-x-0 bottom-0 flex justify-around border-t border-black/5 bg-white px-2 pb-5 pt-3 md:static md:pb-4">
          {topLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={[
                'flex min-w-16 flex-col items-center gap-1',
                item.href === '/ranglister' ? 'text-[#f01f78]' : 'text-[#7b8190]',
              ].join(' ')}
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
