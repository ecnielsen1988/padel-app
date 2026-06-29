export const dynamic = "force-dynamic";

import Link from "next/link";
import { headers } from "next/headers";
import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { PageShell } from "../components/ui";
import { beregnEloÆndringerForIndeværendeMåned } from "@/lib/beregnEloMonthly";

type MånedensSpiller = {
  visningsnavn: string;
  pluspoint: number;
};

function emojiForPluspoint(p: number) {
  if (p >= 100) return "🍾";
  if (p >= 50) return "🏆";
  if (p >= 40) return "🏅";
  if (p >= 30) return "☄️";
  if (p >= 20) return "🚀";
  if (p >= 10) return "🔥";
  if (p >= 5) return "📈";
  if (p >= 0) return "💪";
  if (p > -5) return "🎲";
  if (p > -10) return "📉";
  if (p > -20) return "🧯";
  if (p > -30) return "🪂";
  if (p > -40) return "❄️";
  if (p > -50) return "🙈";
  if (p > -100) return "🥊";
  if (p > -150) return "💩";
  return "💩💩";
}

function formatSigned(value: number) {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}`;
}

export default async function MånedensSpillerSide() {
  const maanedens: MånedensSpiller[] = await beregnEloÆndringerForIndeværendeMåned();
  const supabase = createServerComponentClient<any>({ cookies });

  const h = headers() as any;
  const ref: string | null = typeof h.get === "function" ? h.get("referer") : null;

  let isAdmin = false;
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user?.id) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("rolle")
        .eq("id", user.id)
        .maybeSingle();
      isAdmin = (profile?.rolle ?? "") === "admin";
    }
  } catch {
    isAdmin = false;
  }

  let backHref = "/";
  if (ref) {
    try {
      const u = new URL(ref);
      backHref = (u.pathname || "/") + (u.search || "") + (u.hash || "");
    } catch {
      if (ref.startsWith("/")) backHref = ref;
    }
  }

  const currentTime = new Intl.DateTimeFormat("da-DK", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date());

  const topPlayer = maanedens[0] ?? null;

  return (
    <PageShell className="bg-[#1a1a2e] px-0 py-0 md:px-6 md:py-6">
      <div className="mx-auto flex min-h-screen w-full max-w-[820px] flex-col overflow-hidden bg-[#f4f5f7] md:min-h-[min(100vh,980px)] md:rounded-[34px] md:border md:border-white/10 md:shadow-[0_28px_80px_rgba(0,0,0,0.35)]">
        <header className="bg-gradient-to-br from-[#f01f78] to-[#c0135a] px-4 pb-5 pt-4 text-white md:px-6">
          <div className="mb-4 flex items-center justify-between text-[11px] font-semibold opacity-90">
            <Link
              href={backHref}
              aria-label="Tilbage"
              title="Tilbage"
              className="inline-flex items-center rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-white/25"
            >
              ← Tilbage
            </Link>
            <span>{currentTime}</span>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/75">
                Ranglister
              </p>
              <h1 className="mt-1 text-2xl font-black tracking-tight">
                Månedens spillere
              </h1>
            </div>

            {isAdmin ? (
              <Link
                href="/monthly/arkiv"
                className="inline-flex rounded-full bg-[#ffd44d] px-3 py-2 text-[11px] font-black text-[#463018]"
              >
                Arkiv
              </Link>
            ) : null}
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded-[18px] bg-white/14 px-3 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">
                Spillere
              </p>
              <p className="mt-1 text-xl font-black">{maanedens.length}</p>
            </div>
            <div className="rounded-[18px] bg-white/14 px-3 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">
                Fører
              </p>
              <p className="mt-1 truncate text-sm font-black">
                {topPlayer?.visningsnavn ?? "–"}
              </p>
            </div>
            <div className="rounded-[18px] bg-white/14 px-3 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">
                Bedste form
              </p>
              <p className="mt-1 text-xl font-black">
                {topPlayer ? formatSigned(topPlayer.pluspoint) : "–"}
              </p>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 pb-28 pt-4 md:px-6">
          <div className="space-y-4">
            <section className="rounded-[20px] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.07)]">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-[13px] font-bold uppercase tracking-[0.12em] text-[#2d3340]">
                  Månedens liste
                </h2>
                <span className="rounded-full bg-[#fff0f5] px-3 py-1 text-[11px] font-bold text-[#f01f78]">
                  Netto point
                </span>
              </div>

              {maanedens.length === 0 ? (
                <p className="text-sm text-[#6d7280]">
                  Ingen spillere har forbedret sig endnu i denne måned.
                </p>
              ) : (
                <ol className="space-y-2.5">
                  {maanedens.map((spiller, index) => {
                    const emoji = emojiForPluspoint(spiller.pluspoint);
                    const isTop = index === 0;
                    return (
                      <li
                        key={spiller.visningsnavn}
                        className={[
                          "rounded-[18px] px-4 py-3",
                          isTop
                            ? "bg-gradient-to-r from-[#f01f78] to-[#ff5b9b] text-white"
                            : "border border-[#ececf1] bg-[#fbfbfc] text-[#1f2430]",
                        ].join(" ")}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={isTop ? "text-sm font-black text-white" : "text-sm font-black text-[#f01f78]"}>
                                #{index + 1}
                              </span>
                              <span className="truncate text-sm font-bold">
                                {spiller.visningsnavn}
                              </span>
                            </div>
                          </div>

                          <span className={isTop ? "text-sm font-bold text-white" : "text-sm font-bold text-[#1f2430]"}>
                            {formatSigned(spiller.pluspoint)} {emoji}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>

            {isAdmin ? (
              <section className="rounded-[20px] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.07)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-[13px] font-bold uppercase tracking-[0.12em] text-[#2d3340]">
                      Tidligere måneder
                    </h2>
                    <p className="mt-1 text-sm text-[#6d7280]">
                      Se udviklingen måned for måned i arkivet.
                    </p>
                  </div>

                  <Link
                    href="/monthly/arkiv"
                    className="rounded-full bg-[#fff0f5] px-3 py-1.5 text-[11px] font-bold text-[#f01f78]"
                  >
                    Åbn arkiv
                  </Link>
                </div>
              </section>
            ) : null}
          </div>
        </div>

        <nav className="absolute inset-x-0 bottom-0 flex justify-around border-t border-black/5 bg-white px-2 pb-5 pt-3 md:static md:pb-4">
          {[
            { href: "/startside", icon: "🏠", label: "Hjem" },
            { href: "/ranglister", icon: "📊", label: "Rangliste" },
            { href: "/kommende", icon: "📅", label: "Events" },
            ...(isAdmin ? [{ href: "/monthly/arkiv", icon: "🗂️", label: "Arkiv" }] : []),
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "flex min-w-16 flex-col items-center gap-1",
                item.href === "/ranglister" ? "text-[#f01f78]" : "text-[#7b8190]",
              ].join(" ")}
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
