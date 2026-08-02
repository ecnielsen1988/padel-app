"use client";

export const dynamic = "force-dynamic";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { LoadingState, LoggedOutState, PageShell } from "@/app/components/ui";
import { supabase } from "@/lib/supabaseClient";
import { formatOre } from "@/lib/torsdagEconomyV2";

type Bruger = {
  id: string;
  visningsnavn: string;
  torsdagspadel: boolean;
};

type Tilmelding = { kan_spille: boolean; tidligste_tid?: string | null } | null;

type EventRow = {
  id: string;
  name: string | null;
  date: string;
  start_time?: string | null;
  closed_group: boolean;
};

type RankingRow = {
  visningsnavn: string;
  elo: number;
};

type Holdkamp = {
  id: string;
  opponent: string;
  match_date: string | null;
  location: string | null;
  hold_teams?:
    | {
        name: string;
        division: string;
      }
    | {
        name: string;
        division: string;
      }[];
};

type HoldMatchPlayer = {
  visningsnavn: string | null;
};

type EventResultRow = {
  event_id: string | number;
  group_index: number;
  set_index: number;
  court_label: string | null;
  start_time: string | null;
  end_time: string | null;
  holdA1: string | null;
  holdA2: string | null;
  holdB1: string | null;
  holdB2: string | null;
  scoreA: number | null;
  scoreB: number | null;
};

type EventSet = {
  id: string;
  event_id: string | number;
  event_dato: string;
  kamp_nr: number;
  saet_nr: number;
  bane: string;
  starttid: string;
  sluttid: string;
  holda1: string;
  holda2: string;
  holdb1: string;
  holdb2: string;
  scoreA: number;
  scoreB: number;
};

function nowInCopenhagen(): Date {
  try {
    return new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Copenhagen" }));
  } catch {
    return new Date();
  }
}

function formatEventDate(isoDate: string) {
  const dt = new Date(`${isoDate}T00:00:00`);
  return dt.toLocaleDateString("da-DK", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Copenhagen",
  });
}

function formatMatchDate(dateString: string | null) {
  if (!dateString) return "Dato mangler";
  return new Intl.DateTimeFormat("da-DK", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateString));
}

function formatClock(value?: string | null) {
  return value ? value.slice(0, 5) : "";
}

function formatShortDate(dateString: string | null) {
  if (!dateString) return "—";
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("da-DK", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(date);
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function mapEventRowsToSets(rows: EventResultRow[], eventDate: string): EventSet[] {
  return rows.map((r) => ({
    id: `${r.event_id}-${r.group_index}-${r.set_index}`,
    event_id: r.event_id,
    event_dato: eventDate,
    kamp_nr: (r.group_index ?? 0) + 1,
    saet_nr: (r.set_index ?? 0) + 1,
    bane: (r.court_label ?? "") as string,
    starttid: (r.start_time ?? "").slice(0, 5),
    sluttid: (r.end_time ?? "").slice(0, 5),
    holda1: r.holdA1 ?? "",
    holda2: r.holdA2 ?? "",
    holdb1: r.holdB1 ?? "",
    holdb2: r.holdB2 ?? "",
    scoreA: Number(r.scoreA ?? 0),
    scoreB: Number(r.scoreB ?? 0),
  }));
}

function groupByMatch(rows: EventSet[]) {
  const map = new Map<string, EventSet[]>();
  for (const row of rows) {
    const key = `${row.event_id}#${row.kamp_nr}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(row);
  }
  for (const [key, arr] of map) {
    arr.sort((a, b) => a.saet_nr - b.saet_nr);
    map.set(key, arr);
  }
  return map;
}

function cardAccentClasses() {
  return "border-emerald-200/80 bg-white/92 shadow-[0_20px_60px_rgba(5,120,87,0.08)]";
}

function DashboardLinkCard({
  href,
  eyebrow,
  title,
  icon,
  body,
  footer,
}: {
  href: string;
  eyebrow: string;
  title: string;
  icon: string;
  body: ReactNode;
  footer: string;
}) {
  return (
    <Link
      href={href}
      className={`group rounded-[22px] border p-4 transition hover:-translate-y-0.5 hover:shadow-[0_28px_90px_rgba(5,120,87,0.14)] ${cardAccentClasses()}`}
    >
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700">{eyebrow}</p>
            <h2 className="text-lg font-black tracking-tight text-emerald-950">{title}</h2>
          </div>
          <span className="text-3xl leading-none" aria-hidden="true">
            {icon}
          </span>
        </div>
        <div className="min-h-[82px] text-sm leading-5 text-zinc-700">{body}</div>
        <div className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition group-hover:bg-emerald-700">
          {footer}
          <span aria-hidden="true">→</span>
        </div>
      </div>
    </Link>
  );
}

function DashboardButtonCard({
  onClick,
  eyebrow,
  title,
  icon,
  body,
  footer,
}: {
  onClick: () => void;
  eyebrow: string;
  title: string;
  icon: string;
  body: ReactNode;
  footer: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group w-full rounded-[22px] border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-[0_28px_90px_rgba(5,120,87,0.14)] ${cardAccentClasses()}`}
    >
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700">{eyebrow}</p>
            <h2 className="text-lg font-black tracking-tight text-emerald-950">{title}</h2>
          </div>
          <span className="text-3xl leading-none" aria-hidden="true">
            {icon}
          </span>
        </div>
        <div className="min-h-[82px] text-sm leading-5 text-zinc-700">{body}</div>
        <div className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white transition group-hover:bg-emerald-700">
          {footer}
          <span aria-hidden="true">→</span>
        </div>
      </div>
    </button>
  );
}

function SignupModal({
  open,
  onClose,
  events,
  tilmeldinger,
  editingEventDate,
  setEditingEventDate,
  sendTilmelding,
  savingDate,
}: {
  open: boolean;
  onClose: () => void;
  events: EventRow[];
  tilmeldinger: Record<string, Tilmelding>;
  editingEventDate: string | null;
  setEditingEventDate: Dispatch<SetStateAction<string | null>>;
  sendTilmelding: (eventDato: string, kanSpille: boolean, tidligsteTid?: string) => Promise<void>;
  savingDate: string | null;
}) {
  const standardTid = "17:00";
  const tider = ["17:00", "17:30", "18:40", "20:20"];

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-emerald-950/35 p-4" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-[32px] border border-emerald-200 bg-[#f7fbf7] p-5 shadow-[0_30px_100px_rgba(4,47,35,0.28)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700">Tilmelding</p>
            <h2 className="text-2xl font-black tracking-tight text-emerald-950">Næste 4 torsdagsevents</h2>
            <p className="mt-1 text-sm text-zinc-600">Svar hurtigt og juster tid.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-900"
          >
            Luk
          </button>
        </div>

        <div className="space-y-4">
          {events.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-emerald-300 bg-white/80 p-6 text-sm text-zinc-600">
              Der er endnu ikke oprettet kommende torsdags-events.
            </div>
          ) : (
            events.map((event) => {
              const t = tilmeldinger[event.date];
              const isSaving = savingDate === event.date;
              const isEditing = editingEventDate === event.date || !t;
              const valgtTid = t?.tidligste_tid || standardTid;

              return (
                <div key={event.id} className="rounded-[28px] border border-emerald-200 bg-white p-5 shadow-sm">
                  <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="text-lg font-bold text-emerald-950">{event.name || "Torsdagspadel"}</div>
                      <div className="text-sm text-zinc-600">
                        {formatEventDate(event.date)}
                        {formatClock(event.start_time) ? ` · ${formatClock(event.start_time)}` : ""}
                      </div>
                    </div>
                    <div className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
                      {!t ? "⏳ Intet svar" : t.kan_spille ? `✅ Tilmeldt${t.tidligste_tid ? ` · ${t.tidligste_tid}` : ""}` : "❌ Afbud"}
                    </div>
                  </div>

                  {isEditing ? (
                    !t ? (
                      <div className="flex flex-col gap-3 sm:flex-row">
                        <button
                          type="button"
                          onClick={() => void sendTilmelding(event.date, false)}
                          disabled={isSaving}
                          className="rounded-2xl bg-rose-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
                        >
                          Kan ikke
                        </button>
                        <button
                          type="button"
                          onClick={() => void sendTilmelding(event.date, true, standardTid)}
                          disabled={isSaving}
                          className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
                        >
                          Kan godt
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <button
                          type="button"
                          onClick={() => void sendTilmelding(event.date, false)}
                          disabled={isSaving}
                          className="rounded-2xl bg-rose-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
                        >
                          Meld afbud
                        </button>
                        <label className="flex items-center gap-2 text-sm text-zinc-700">
                          Tid:
                          <select
                            value={valgtTid}
                            onChange={(e) => void sendTilmelding(event.date, true, e.target.value)}
                            disabled={isSaving}
                            className="rounded-2xl border border-emerald-200 bg-emerald-600 px-4 py-3 font-bold text-white"
                          >
                            {tider.map((tid) => (
                              <option key={tid} value={tid}>
                                {tid}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    )
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEditingEventDate(event.date)}
                      className="text-sm font-semibold text-emerald-700 underline decoration-emerald-300 underline-offset-4"
                    >
                      Rediger
                    </button>
                  )}

                  {isSaving ? <p className="mt-3 text-xs text-zinc-500">Gemmer...</p> : null}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

export default function TorsdagStartside() {
  const [bruger, setBruger] = useState<Bruger | null>(null);
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [tilmeldinger, setTilmeldinger] = useState<Record<string, Tilmelding>>({});
  const [savingDate, setSavingDate] = useState<string | null>(null);
  const [editingEventDate, setEditingEventDate] = useState<string | null>(null);
  const [signupModalOpen, setSignupModalOpen] = useState(false);
  const [nextHoldkamp, setNextHoldkamp] = useState<Holdkamp | null>(null);
  const [nextHoldPlayers, setNextHoldPlayers] = useState<string[]>([]);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [rankingNeighbors, setRankingNeighbors] = useState<RankingRow[]>([]);
  const [economySummary, setEconomySummary] = useState({
    outstandingFineOre: 0,
    outstandingCreditOre: 0,
    beerPrizeCount: 0,
    sodaPrizeCount: 0,
  });
  const [mineEventSets, setMineEventSets] = useState<EventSet[]>([]);
  const [scoreBusy, setScoreBusy] = useState(false);
  const [scoreError, setScoreError] = useState<string | null>(null);

  useEffect(() => {
    const hentData = async () => {
      try {
        setLoading(true);
        const { data: auth } = await supabase.auth.getUser();
        const user = auth?.user;

        if (!user) {
          setBruger(null);
          return;
        }

        const profResp = await (supabase.from("profiles") as any)
          .select("id, visningsnavn, torsdagspadel")
          .eq("id", user.id)
          .maybeSingle();

        const profile = (profResp?.data ?? null) as Bruger | null;
        if (!profile?.torsdagspadel || !profile.visningsnavn) {
          setBruger(null);
          return;
        }

        setBruger(profile);

        const todayISO = nowInCopenhagen().toISOString().slice(0, 10);

        const [eventsResp, holdResp, rangResp, torsResp] = await Promise.all([
          (supabase.from("events") as any)
            .select("id, name, date, start_time, closed_group")
            .eq("closed_group", true)
            .gte("date", todayISO)
            .order("date", { ascending: true })
            .limit(4),
          supabase
            .from("hold_matches")
            .select(`
              id,
              opponent,
              match_date,
              location,
              hold_teams (
                name,
                division
              )
            `)
            .eq("status", "upcoming")
            .order("match_date", { ascending: true })
            .limit(1)
            .maybeSingle(),
          fetch("/api/rangliste", { cache: "no-store" }).then((res) => res.json()),
          (supabase.from("profiles") as any)
            .select("visningsnavn")
            .eq("torsdagspadel", true),
        ]);

        const nextEvents = (eventsResp?.data ?? []) as EventRow[];
        setEvents(nextEvents);

        if (nextEvents.length > 0) {
          const signupResp = await (supabase.from("event_signups") as any)
            .select("event_dato, kan_spille, tidligste_tid")
            .eq("visningsnavn", profile.visningsnavn)
            .in("event_dato", nextEvents.map((event) => event.date));

          const map: Record<string, Tilmelding> = {};
          for (const row of signupResp?.data ?? []) {
            map[row.event_dato] = {
              kan_spille: !!row.kan_spille,
              tidligste_tid: row.kan_spille ? row.tidligste_tid ?? "17:00" : null,
            };
          }
          setTilmeldinger(map);
        }

        setNextHoldkamp((holdResp?.data as Holdkamp | null) ?? null);

        if (holdResp?.data?.id) {
          const playersResp = await supabase
            .from("hold_match_players")
            .select("visningsnavn")
            .eq("match_id", holdResp.data.id)
            .eq("status", "tilmeldt");

          const names = ((playersResp.data ?? []) as HoldMatchPlayer[])
            .map((row) => (row.visningsnavn ?? "").trim())
            .filter(Boolean);
          setNextHoldPlayers(names);
        }

        const rangArray = Array.isArray(rangResp) ? rangResp : rangResp?.data ?? [];
        const torsNames = new Set(
          (((torsResp?.data ?? []) as Array<{ visningsnavn?: string | null }>)
            .map((row) => (row.visningsnavn ?? "").trim())
            .filter(Boolean))
        );
        const torsRanking = (rangArray as RankingRow[]).filter((row) =>
          torsNames.has((row.visningsnavn ?? "").trim())
        );
        const myIndex = torsRanking.findIndex(
          (row) => row.visningsnavn.trim() === profile.visningsnavn.trim()
        );
        setMyRank(myIndex >= 0 ? myIndex + 1 : null);
        if (myIndex >= 0) {
          setRankingNeighbors(torsRanking.slice(Math.max(0, myIndex - 1), Math.min(torsRanking.length, myIndex + 2)));
        } else {
          setRankingNeighbors(torsRanking.slice(0, 3));
        }

        const economyResp = await fetch("/api/torsdag/economy", { cache: "no-store" });
        const economyData = await economyResp.json();
        if (economyResp.ok) {
          setEconomySummary({
            outstandingFineOre: Number(economyData.outstandingFineOre ?? 0),
            outstandingCreditOre: Number(economyData.outstandingCreditOre ?? 0),
            beerPrizeCount: Number(economyData.beerPrizeCount ?? 0),
            sodaPrizeCount: Number(economyData.sodaPrizeCount ?? 0),
          });
        } else {
          setEconomySummary({
            outstandingFineOre: 0,
            outstandingCreditOre: 0,
            beerPrizeCount: 0,
            sodaPrizeCount: 0,
          });
        }

        const publishedEvents = ((eventsResp?.data ?? []) as EventRow[]).filter((event) => {
          return event.closed_group && event.date >= todayISO;
        });

        if (publishedEvents.length > 0) {
          const eventIds = publishedEvents.map((event) => event.id);
          const dateByEvent = new Map(
            publishedEvents.map((event) => [String(event.id), event.date] as const)
          );

          const { data: eventResultData } = await (supabase.from("event_result") as any)
            .select("*")
            .in("event_id", eventIds)
            .order("group_index", { ascending: true })
            .order("set_index", { ascending: true });

          const allSets = mapEventRowsToSets(
            (eventResultData as EventResultRow[] | null) ?? [],
            todayISO
          ).map((row) => ({
            ...row,
            event_dato: dateByEvent.get(String(row.event_id)) ?? todayISO,
          }));

          const lowerName = profile.visningsnavn.trim().toLowerCase();
          setMineEventSets(
            allSets.filter((row) =>
              [row.holda1, row.holda2, row.holdb1, row.holdb2]
                .map((name) => name.trim().toLowerCase())
                .includes(lowerName)
            )
          );
        } else {
          setMineEventSets([]);
        }
      } finally {
        setLoading(false);
      }
    };

    void hentData();
  }, []);

  async function sendTilmelding(eventDato: string, kanSpille: boolean, tidligsteTid?: string) {
    if (!bruger) return;
    setSavingDate(eventDato);

    const payload = {
      visningsnavn: bruger.visningsnavn,
      event_dato: eventDato,
      kan_spille: kanSpille,
      tidligste_tid: kanSpille ? tidligsteTid || "17:00" : null,
    };

    const upResp = await (supabase.from("event_signups") as any).upsert(payload, {
      onConflict: "visningsnavn,event_dato",
    });

    if (!upResp?.error) {
      setTilmeldinger((prev) => ({
        ...prev,
        [eventDato]: { kan_spille: kanSpille, tidligste_tid: kanSpille ? tidligsteTid || "17:00" : null },
      }));
      setEditingEventDate(null);
    }

    setSavingDate(null);
  }

  const nextEvent = events[0] ?? null;
  const nextSignup = nextEvent ? tilmeldinger[nextEvent.date] : null;
  const holdTeam = Array.isArray(nextHoldkamp?.hold_teams) ? nextHoldkamp?.hold_teams[0] : nextHoldkamp?.hold_teams;
  const mineMatches = useMemo(
    () =>
      Array.from(groupByMatch(mineEventSets).values())
        .sort((a, b) => {
          const aDate = `${a[0]?.event_dato ?? ""}T${a[0]?.starttid ?? "00:00"}`;
          const bDate = `${b[0]?.event_dato ?? ""}T${b[0]?.starttid ?? "00:00"}`;
          return aDate.localeCompare(bDate);
        })
        .slice(0, 2),
    [mineEventSets]
  );

  async function reloadEventSets(eventId: string | number, eventDate: string) {
    const { data } = await (supabase.from("event_result") as any)
      .select("*")
      .eq("event_id", eventId)
      .order("group_index", { ascending: true })
      .order("set_index", { ascending: true });

    const rows = mapEventRowsToSets((data as EventResultRow[] | null) ?? [], eventDate);
    const lowerName = bruger?.visningsnavn.trim().toLowerCase() ?? "";
    setMineEventSets((prev) => {
      const rest = prev.filter((row) => String(row.event_id) !== String(eventId));
      const mine = rows.filter((row) =>
        [row.holda1, row.holda2, row.holdb1, row.holdb2]
          .map((name) => name.trim().toLowerCase())
          .includes(lowerName)
      );
      return [...rest, ...mine];
    });
  }

  async function saveSetScore(setRow: EventSet, scoreA: number, scoreB: number) {
    setScoreBusy(true);
    setScoreError(null);
    try {
      const res = await fetch("/api/event-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateScore",
          eventId: setRow.event_id,
          groupIndex: setRow.kamp_nr - 1,
          setIndex: setRow.saet_nr - 1,
          scoreA,
          scoreB,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Kunne ikke gemme sættet.");
      await reloadEventSets(setRow.event_id, setRow.event_dato);
    } catch (error: any) {
      setScoreError(error?.message ?? "Kunne ikke gemme sættet.");
    } finally {
      setScoreBusy(false);
    }
  }

  async function addExtraSet(matchRows: EventSet[]) {
    const first = matchRows[0];
    if (!first) return;
    setScoreBusy(true);
    setScoreError(null);
    try {
      const res = await fetch("/api/event-score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "addSet",
          eventId: first.event_id,
          groupIndex: first.kamp_nr - 1,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Kunne ikke tilføje et nyt sæt.");
      await reloadEventSets(first.event_id, first.event_dato);
    } catch (error: any) {
      setScoreError(error?.message ?? "Kunne ikke tilføje et nyt sæt.");
    } finally {
      setScoreBusy(false);
    }
  }

  if (loading) return <LoadingState text="Indlæser torsdagspadel..." />;

  if (!bruger) {
    return (
      <LoggedOutState
        title="Du har ikke adgang til torsdagspadel"
        description="Siden er kun for spillere med torsdagspadel-adgang."
      />
    );
  }

  return (
    <PageShell className="bg-[#16211d] px-0 py-0 md:px-6 md:py-6">
      <div className="mx-auto flex min-h-screen w-full max-w-[820px] flex-col overflow-hidden bg-[#f4f5f7] md:min-h-[min(100vh,980px)] md:rounded-[34px] md:border md:border-white/10 md:shadow-[0_28px_80px_rgba(0,0,0,0.35)]">
        <header className="bg-gradient-to-br from-[#0b6b3a] via-[#0f8a4b] to-[#10a15b] px-4 pb-5 pt-4 text-white md:px-6">
          <div className="mb-4 flex items-center justify-between text-[11px] font-semibold opacity-90">
            <span>Padelhuset</span>
            <span>{new Intl.DateTimeFormat("da-DK", { hour: "2-digit", minute: "2-digit" }).format(new Date())}</span>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/75">
                Torsdagspadel
              </p>
              <h1 className="mt-1 text-2xl font-black tracking-tight">
                Hej {bruger.visningsnavn}
              </h1>
              <p className="mt-2 max-w-[240px] text-sm text-white/80">
                Torsdagen samlet et sted.
              </p>
            </div>

            <Link
              href="/profil"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#d8ffe8] text-xs font-black text-[#0b6b3a]"
              aria-label="Min profil"
            >
              {initials(bruger.visningsnavn)}
            </Link>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 pb-28 pt-4 md:px-6">
          <div className="space-y-4">
            <section className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-[#0b6b3a] to-[#10884d] px-5 py-5 text-white shadow-[0_18px_40px_rgba(11,107,58,0.26)]">
              <div className="absolute right-4 top-1/2 -translate-y-1/2 text-6xl opacity-10">
                🏋️
              </div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/75">
                Overblik
              </p>
              <div className="mt-2 text-2xl font-black tracking-tight">
                {nextEvent ? `Næste torsdag: ${formatEventDate(nextEvent.date)}` : "Ingen kommende event endnu"}
              </div>
              <p className="mt-3 max-w-[280px] text-sm text-white/80">
                📅 🧾 📊 💸 🍺 📘
              </p>
            </section>

            <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <DashboardButtonCard
                onClick={() => setSignupModalOpen(true)}
                eyebrow="1. Tilmelding"
                title="Kommende events"
                icon="📅"
                body={
                  nextEvent ? (
                    <>
                      <p className="font-semibold text-emerald-900">{nextEvent.name || "Torsdagspadel"}</p>
                      <p className="text-xs text-zinc-500">{formatEventDate(nextEvent.date)}</p>
                      <p className="mt-2 rounded-2xl bg-emerald-50 px-3 py-2 font-medium text-emerald-900">
                        {nextSignup?.kan_spille
                          ? `✅ Tilmeldt${nextSignup.tidligste_tid ? ` · ${nextSignup.tidligste_tid}` : ""}`
                          : nextSignup
                            ? "❌ Afbud"
                            : "⏳ Intet svar"}
                      </p>
                    </>
                  ) : (
                    <p>⏳ Ingen ny torsdag endnu.</p>
                  )
                }
                footer="Åbn oversigt"
              />

              <DashboardLinkCard
                href="/holdkampe"
                eyebrow="2. Holdkampe"
                title="Næste holdkamp"
                icon="🧾"
                body={
                  nextHoldkamp ? (
                    <>
                      <p className="font-semibold text-emerald-900">
                        {holdTeam?.name ?? "Holdkamp"} vs. {nextHoldkamp.opponent}
                      </p>
                      <p className="text-xs text-zinc-500">{formatMatchDate(nextHoldkamp.match_date)}</p>
                      <p className="mt-2 text-sm text-zinc-700">
                        {nextHoldPlayers.length > 0
                          ? `👥 ${nextHoldPlayers.slice(0, 3).join(", ")}${nextHoldPlayers.length > 3 ? " +" : ""}`
                          : "👥 Ingen tilmeldt endnu"}
                      </p>
                    </>
                  ) : (
                    <p>🏟 Ingen kommende holdkamp.</p>
                  )
                }
                footer="Se holdkampe"
              />

              <DashboardLinkCard
                href="/torsdagspadel/rangliste"
                eyebrow="3. Rangliste"
                title="Din placering"
                icon="📊"
                body={
                  <>
                    <p className="text-4xl font-black text-emerald-900">#{myRank ?? "—"}</p>
                    <div className="mt-2 space-y-1.5 text-sm">
                      {rankingNeighbors.map((row, index) => {
                        const absoluteRank = myRank != null && rankingNeighbors.length === 3
                          ? myRank - 1 + index
                          : index + 1;
                        const isMe = row.visningsnavn === bruger.visningsnavn;
                        return (
                          <div key={`${row.visningsnavn}-${absoluteRank}`} className={`flex items-center justify-between rounded-2xl px-3 py-1.5 ${isMe ? "bg-emerald-50 font-bold text-emerald-900" : "bg-zinc-50"}`}>
                            <span>#{absoluteRank} {row.visningsnavn}</span>
                            <span>{Math.round(Number(row.elo ?? 0))}</span>
                          </div>
                        );
                      })}
                    </div>
                  </>
                }
                footer="Se ranglisten"
              />

              <DashboardLinkCard
                href="/torsdagspadel/boedekasse"
                eyebrow="4. Bødekassen"
                title="Dit udestående"
                icon="💸"
                body={
                  <>
                    <p className="text-4xl font-black text-emerald-900">{formatOre(economySummary.outstandingFineOre)}</p>
                    <p className="mt-2 font-semibold text-zinc-800">
                      {economySummary.outstandingFineOre > 0 ? "Du skylder penge" : "Du har opført dig pænt"}
                    </p>
                    <p className="mt-2 text-4xl leading-none">💰</p>
                  </>
                }
                footer="Se bødelisten"
              />

              <DashboardLinkCard
                href="/torsdagspadel/praemieliste"
                eyebrow="5. Præmielisten"
                title="Det du har til gode"
                icon="🍺"
                body={
                  <div className="space-y-2">
                    <div className="flex items-center justify-between rounded-2xl bg-zinc-50 px-3 py-2">
                      <span className="text-2xl">🍺</span>
                      <span className="font-black text-emerald-900">{economySummary.beerPrizeCount}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-2xl bg-zinc-50 px-3 py-2">
                      <span className="text-2xl">🥤</span>
                      <span className="font-black text-emerald-900">{economySummary.sodaPrizeCount}</span>
                    </div>
                  </div>
                }
                footer="Se præmielisten"
              />

              <DashboardLinkCard
                href="/torsdagspadel/reglement"
                eyebrow="6. Reglement"
                title="Sådan fungerer det"
                icon="📘"
                body={
                  <>
                    <p className="font-semibold text-zinc-800">📖 Alle skal have læst reglementet</p>
                    <p className="mt-2 text-3xl leading-none">✅</p>
                  </>
                }
                footer="Læs reglementet"
              />
            </section>

            <section className="rounded-[20px] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.07)]">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-[13px] font-bold uppercase tracking-[0.12em] text-[#2d3340]">
                  Dine kampe
                </h2>
                <Link href="/kommende" className="text-xs font-bold text-[#0b6b3a]">
                  Se alle
                </Link>
              </div>

              {mineMatches.length > 0 ? (
                <div className="space-y-3">
                  {mineMatches.map((sets) => {
                    const meta = sets[0];
                    return (
                      <div
                        key={`${meta.event_id}-${meta.kamp_nr}`}
                        className="rounded-[18px] bg-[#fbfbfc] p-4 shadow-[0_1px_8px_rgba(0,0,0,0.04)]"
                      >
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-extrabold text-[#1f2430]">
                              Kamp #{meta.kamp_nr}
                            </p>
                            <p className="mt-1 text-xs text-[#838999]">
                              {formatShortDate(meta.event_dato)} · {formatClock(meta.starttid)}–{formatClock(meta.sluttid)} · {meta.bane}
                            </p>
                          </div>
                          <span className="rounded-full bg-[#ecfdf5] px-2.5 py-1 text-[10px] font-bold text-[#0b6b3a]">
                            {sets.length} sæt
                          </span>
                        </div>

                        <div className="space-y-2 text-sm text-[#414754]">
                          {sets.map((row) => (
                            <TorsdagScoreEntryCard
                              key={row.id}
                              row={row}
                              saving={scoreBusy}
                              onSave={saveSetScore}
                            />
                          ))}
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => void addExtraSet(sets)}
                            disabled={
                              scoreBusy ||
                              (sets[sets.length - 1]?.scoreA === 0 &&
                                sets[sets.length - 1]?.scoreB === 0)
                            }
                            className="inline-flex items-center justify-center rounded-full border-2 border-emerald-500 bg-white px-3 py-1.5 text-sm font-semibold text-emerald-700 shadow transition hover:bg-emerald-50"
                          >
                            + Tilføj sæt
                          </button>
                          <Link
                            href="/kommende"
                            className="inline-flex items-center justify-center rounded-full border-2 border-emerald-500 bg-white px-3 py-1.5 text-sm font-semibold text-emerald-700 shadow transition hover:bg-emerald-50"
                          >
                            📋 Se i events
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                  {scoreError ? (
                    <div className="rounded-[14px] bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                      {scoreError}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-[18px] bg-[#fbfbfc] p-4 text-sm text-[#6d7280]">
                  Ingen publicerede kampe til dig endnu.
                </div>
              )}
            </section>
          </div>
        </div>

        <nav className="absolute inset-x-0 bottom-0 flex justify-around border-t border-black/5 bg-white px-2 pb-5 pt-3 md:static md:pb-4">
          {[
            { href: "/startside", icon: "🏠", label: "Hjem" },
            { href: "/torsdagspadel/rangliste", icon: "📊", label: "Rangliste" },
            { href: "/torsdagspadel", icon: "🏋️", label: "Torsdag" },
            { href: "/profil", icon: "🧑‍🎾", label: "Profil" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-w-16 flex-col items-center gap-1 ${
                item.href === "/torsdagspadel" ? "text-[#0b6b3a]" : "text-[#7b8190]"
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              <span className="text-[11px] font-semibold">{item.label}</span>
            </Link>
          ))}
        </nav>
      </div>

      <SignupModal
        open={signupModalOpen}
        onClose={() => {
          setSignupModalOpen(false);
          setEditingEventDate(null);
        }}
        events={events}
        tilmeldinger={tilmeldinger}
        editingEventDate={editingEventDate}
        setEditingEventDate={setEditingEventDate}
        sendTilmelding={sendTilmelding}
        savingDate={savingDate}
      />
    </PageShell>
  );
}

function TorsdagScoreEntryCard({
  row,
  saving,
  onSave,
}: {
  row: EventSet;
  saving: boolean;
  onSave: (row: EventSet, scoreA: number, scoreB: number) => Promise<void>;
}) {
  const [scoreA, setScoreA] = useState(String(row.scoreA));
  const [scoreB, setScoreB] = useState(String(row.scoreB));
  const firstSyncDone = useRef(false);

  useEffect(() => {
    setScoreA(String(row.scoreA));
    setScoreB(String(row.scoreB));
    firstSyncDone.current = true;
  }, [row.id, row.scoreA, row.scoreB]);

  function sanitize(value: string) {
    const trimmed = value.replace(/\D/g, "").slice(0, 1);
    return trimmed === "" ? "0" : trimmed;
  }

  useEffect(() => {
    if (!firstSyncDone.current) return;

    const nextA = Number(scoreA);
    const nextB = Number(scoreB);
    if (nextA === row.scoreA && nextB === row.scoreB) return;

    const timeout = window.setTimeout(() => {
      void onSave(row, nextA, nextB);
    }, 450);

    return () => window.clearTimeout(timeout);
  }, [onSave, row, scoreA, scoreB]);

  return (
    <div className="rounded-[18px] bg-[#fbfbfc] p-4 shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
      <div className="grid grid-cols-[1fr_auto] items-start gap-3">
        <div className="min-w-0">
          <p className="text-sm font-extrabold text-[#1f2430]">Sæt {row.saet_nr}</p>
          <p className="mt-1 text-xs text-[#838999]">
            🏟 {row.bane} · ⏱ {formatClock(row.starttid)}–{formatClock(row.sluttid)}
          </p>
        </div>
        <div className="flex items-center gap-2 justify-self-end">
          <input
            value={scoreA}
            onChange={(e) => setScoreA(sanitize(e.target.value))}
            inputMode="numeric"
            disabled={saving}
            className="h-10 w-10 rounded-[10px] border border-zinc-200 bg-white px-2 py-1.5 text-center text-sm font-black text-[#1f2430] outline-none disabled:opacity-70"
          />
          <span className="text-sm font-bold text-[#838999]">-</span>
          <input
            value={scoreB}
            onChange={(e) => setScoreB(sanitize(e.target.value))}
            inputMode="numeric"
            disabled={saving}
            className="h-10 w-10 rounded-[10px] border border-zinc-200 bg-white px-2 py-1.5 text-center text-sm font-black text-[#1f2430] outline-none disabled:opacity-70"
          />
        </div>
      </div>

      <div className="mt-3 text-sm leading-tight text-[#414754]">
        {row.holda1} & {row.holda2} <span className="opacity-60">vs</span>
        <br />
        {row.holdb1} & {row.holdb2}
      </div>
    </div>
  );
}
