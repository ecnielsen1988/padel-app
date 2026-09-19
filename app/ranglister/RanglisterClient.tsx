"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { LoadingState, LoggedOutState, PageShell } from "../components/ui";

type UserProfile = {
  visningsnavn: string;
  rolle: string | null;
  torsdagspadel: boolean | null;
};

type PreviewRow = {
  visningsnavn: string;
  elo?: number;
  pluspoint?: number;
  sæt?: number;
};

type RankingOverview = {
  rangliste: PreviewRow[];
  monthly: PreviewRow[];
  active: PreviewRow[];
  women: PreviewRow[];
  eggs: PreviewRow[];
  winStreak: PreviewRow[];
  playStreak: PreviewRow[];
};

type PreviewSection = {
  href: string;
  icon: string;
  title: string;
  subtitle: string;
  accentClass: string;
  metric: "elo" | "pluspoint" | "sets";
  rows: PreviewRow[];
};

const EMPTY_OVERVIEW: RankingOverview = {
  rangliste: [], monthly: [], active: [], women: [], eggs: [], winStreak: [], playStreak: [],
};

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "").join("");
}

function buildDisplayRows(rows: PreviewRow[], myName: string | null) {
  const topThree = rows.slice(0, 3);
  if (!myName) return topThree;
  const myIndex = rows.findIndex(
    (row) => row.visningsnavn.toLowerCase() === myName.trim().toLowerCase()
  );
  if (myIndex === -1) return topThree;

  const merged = [...topThree, ...rows.slice(Math.max(0, myIndex - 1), myIndex + 2)];
  const seen = new Set<string>();
  return merged.filter((row) => {
    const key = row.visningsnavn.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sectionsFromOverview(data: RankingOverview): PreviewSection[] {
  return [
    { href: "/nyrangliste", icon: "🥇", title: "Ranglisten", subtitle: "Den samlede Elo-top", accentClass: "bg-[#fff0f5]", metric: "elo", rows: data.rangliste },
    { href: "/monthly", icon: "🌟", title: "Månedens spiller", subtitle: "Mest fremgang denne måned", accentClass: "bg-[#fff8e8]", metric: "pluspoint", rows: data.monthly },
    { href: "/active", icon: "🏃‍♂️", title: "Mest aktive", subtitle: "Flest spillede sæt", accentClass: "bg-[#eefaf4]", metric: "sets", rows: data.active },
    { href: "/women", icon: "👸", title: "GirlPower Listen", subtitle: "Kvinderanglistens top 3", accentClass: "bg-[#fff0f5]", metric: "elo", rows: data.women },
    { href: "/egg", icon: "🥚", title: "Æggejagten", subtitle: "De største bagels", accentClass: "bg-[#fff8e8]", metric: "pluspoint", rows: data.eggs },
    { href: "/winstreak", icon: "🔥", title: "Win-Streak", subtitle: "De længste sejrsserier", accentClass: "bg-[#fff0f5]", metric: "pluspoint", rows: data.winStreak },
    { href: "/playstreak", icon: "📆", title: "5 Games Streak", subtitle: "Uger med masser af spil", accentClass: "bg-[#eefaf4]", metric: "pluspoint", rows: data.playStreak },
  ];
}

export default function RanglisterClient() {
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [previewSections, setPreviewSections] = useState<PreviewSection[]>([]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        if (!user) {
          if (mounted) setLoggedIn(false);
          return;
        }

        const [profileResult, overviewResponse] = await Promise.all([
          (supabase.from("profiles") as any)
            .select("visningsnavn, rolle, torsdagspadel")
            .eq("id", user.id)
            .maybeSingle(),
          fetch("/api/ranking-overview"),
        ]);
        const overview: RankingOverview = overviewResponse.ok
          ? await overviewResponse.json()
          : EMPTY_OVERVIEW;
        if (!mounted) return;

        const p = profileResult.data;
        setLoggedIn(true);
        setProfile({
          visningsnavn: String(p?.visningsnavn ?? (user.user_metadata as any)?.visningsnavn ?? user.email ?? "Spiller"),
          rolle: p?.rolle ?? null,
          torsdagspadel: !!p?.torsdagspadel,
        });
        setPreviewSections(sectionsFromOverview(overview));
      } catch (error) {
        console.error("Kunne ikke hente ranglisteoversigten", error);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void load();
    return () => { mounted = false; };
  }, []);

  if (loading) return <LoadingState />;
  if (!loggedIn || !profile) {
    return <LoggedOutState title="Du er ikke logget ind" description="Log ind for at se ranglister og følge udviklingen på tværs af huset." />;
  }

  const topLinks = [
    { href: "/startside", icon: "🏠", label: "Hjem" },
    { href: "/ranglister", icon: "📊", label: "Rangliste" },
    { href: "/kommende", icon: "📅", label: "Events" },
    { href: `/profil/${encodeURIComponent(profile.visningsnavn)}`, icon: "🧑‍🎾", label: "Profil" },
  ];

  return (
    <PageShell className="bg-[#1a1a2e] px-0 py-0 md:px-6 md:py-6">
      <div className="mx-auto flex min-h-screen w-full max-w-[820px] flex-col overflow-hidden bg-[#f4f5f7] md:min-h-[min(100vh,980px)] md:rounded-[34px] md:border md:border-white/10 md:shadow-[0_28px_80px_rgba(0,0,0,0.35)]">
        <header className="bg-gradient-to-br from-[#f01f78] to-[#c0135a] px-4 pb-5 pt-4 text-white md:px-6">
          <div className="mb-4 flex items-center justify-between text-[11px] font-semibold opacity-90">
            <span>Padelhuset</span>
            <span>{new Intl.DateTimeFormat("da-DK", { hour: "2-digit", minute: "2-digit" }).format(new Date())}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/75">Overblik</p>
              <h1 className="mt-1 text-2xl font-black tracking-tight">Ranglister</h1>
            </div>
            <Link href={`/profil/${encodeURIComponent(profile.visningsnavn)}`} className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#ffd44d] text-xs font-black text-[#463018]" aria-label="Min profil">
              {initials(profile.visningsnavn)}
            </Link>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 pb-28 pt-4 md:px-6">
          <div className="space-y-4">
            <section className="rounded-[20px] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.07)]">
              <div className="mb-3">
                <h2 className="text-[13px] font-bold uppercase tracking-[0.12em] text-[#2d3340]">Top 3 lige nu</h2>
              </div>
              <div className="space-y-3">
                {previewSections.map((item) => {
                  const displayRows = buildDisplayRows(item.rows, profile.visningsnavn);
                  return (
                    <Link key={item.href} href={item.href} className="block rounded-[18px] bg-[#fbfbfc] px-4 py-4 shadow-[0_1px_8px_rgba(0,0,0,0.04)] transition hover:-translate-y-0.5">
                      <div className="mb-3 flex items-center gap-3">
                        <span className={`inline-flex h-11 w-11 items-center justify-center rounded-full text-[22px] ${item.accentClass}`}>{item.icon}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-extrabold text-[#1f2430]">{item.title}</p>
                          <p className="text-xs text-[#838999]">{item.subtitle}</p>
                        </div>
                        <span className="text-sm font-bold text-[#f01f78]">Se</span>
                      </div>
                      <div className="space-y-2">
                        {displayRows.length > 0 ? displayRows.map((row) => {
                          const placement = item.rows.findIndex((entry) => entry.visningsnavn.toLowerCase() === row.visningsnavn.toLowerCase()) + 1;
                          const isMe = row.visningsnavn.toLowerCase() === profile.visningsnavn.trim().toLowerCase();
                          return (
                            <div key={`${item.href}-${row.visningsnavn}`} className={["flex items-center gap-3 rounded-[12px] px-3 py-2", isMe ? "bg-[#fff3f8]" : "bg-white"].join(" ")}>
                              <span className="w-5 text-center text-sm font-black text-[#505767]">{placement}</span>
                              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#eceef2] text-[11px] font-black text-[#656b79]">{initials(row.visningsnavn)}</span>
                              <span className="min-w-0 flex-1 truncate text-sm font-bold text-[#1f2430]">{row.visningsnavn}</span>
                              <span className="text-xs font-bold text-[#f01f78]">
                                {item.metric === "sets" ? `${row.sæt ?? 0} sæt` : item.metric === "elo" ? `${Math.round(row.elo ?? 0)}` : `${Math.round(row.pluspoint ?? 0)}`}
                              </span>
                            </div>
                          );
                        }) : (
                          <div className="rounded-[12px] bg-white px-3 py-2 text-xs text-[#8b92a0]">Ingen data endnu.</div>
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
            <Link key={item.href} href={item.href} className={["flex min-w-16 flex-col items-center gap-1", item.href === "/ranglister" ? "text-[#f01f78]" : "text-[#7b8190]"].join(" ")}>
              <span className="text-lg">{item.icon}</span>
              <span className="text-[11px] font-semibold">{item.label}</span>
            </Link>
          ))}
        </nav>
      </div>
    </PageShell>
  );
}
