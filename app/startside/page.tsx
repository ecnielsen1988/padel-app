"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { LoadingState, PageShell } from "../components/ui";
import {
  formatResultChangeSetSummary,
  getResultChangeReviewStatus,
  parseResultChangeRequest,
} from "@/lib/resultChangeRequests";

type Bruger = {
  visningsnavn: string;
  rolle: string;
  torsdagspadel: boolean;
  status: "active" | "sleep" | "inactive" | null;
};

type RankingRow = {
  visningsnavn: string;
  elo: number;
};

type EventPreview = {
  id: string | number;
  name: string | null;
  date: string | null;
  start_time: string | null;
  location: string | null;
  status?: string | null;
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

type MessagePreview = {
  id: string;
  sender_id: string;
  sender_visningsnavn: string;
  recipient_id: string;
  recipient_visningsnavn: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

type AdminMessagePreview = {
  id: string | number;
  kampid: number | null;
  besked: string;
  tidspunkt: string;
  visningsnavn: string;
  læst?: boolean | null;
  read?: boolean | null;
};

function extractArray(raw: unknown) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.data)) return obj.data;
    if (Array.isArray(obj.items)) return obj.items;
  }
  return [];
}

function formatShortDate(date: string | null) {
  if (!date) return "Ukendt dato";
  const parsed = new Date(`${date}T12:00:00`);
  return new Intl.DateTimeFormat("da-DK", {
    day: "numeric",
    month: "short",
  }).format(parsed);
}

function formatWeekday(date: string | null) {
  if (!date) return "";
  const parsed = new Date(`${date}T12:00:00`);
  return new Intl.DateTimeFormat("da-DK", {
    weekday: "short",
  }).format(parsed);
}

function formatRelativeRank(rank: number | null) {
  if (!rank) return "Ikke placeret endnu";
  if (rank === 1) return "Du fører ranglisten";
  if (rank <= 3) return "Du ligger i top 3";
  if (rank <= 10) return "Du er med helt i toppen";
  return `Plads ${rank} lige nu`;
}

function formatTimeAgo(value: string) {
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.max(1, Math.floor(diffMs / 60000));
  if (minutes < 60) return `${minutes} min siden`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} t siden`;
  const days = Math.floor(hours / 24);
  return `${days} d siden`;
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

function formatTime(value: string | null | undefined) {
  return value ? value.slice(0, 5) : "";
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

async function fetchUnreadAdminCount(supabase: any) {
  const primary = await supabase
    .from("admin_messages")
    .select("*", { count: "exact", head: true })
    .eq("læst", false);

  if (!primary?.error) {
    return primary.count ?? 0;
  }

  const fallback = await supabase
    .from("admin_messages")
    .select("*", { count: "exact", head: true })
    .eq("read", false);

  return fallback.count ?? 0;
}

async function fetchLatestAdminMessages(supabase: any) {
  const primary = await supabase
    .from("admin_messages")
    .select("id, kampid, besked, tidspunkt, visningsnavn, læst")
    .eq("læst", false)
    .order("tidspunkt", { ascending: false })
    .limit(5);

  if (!primary?.error) {
    return (primary.data as AdminMessagePreview[] | null) ?? [];
  }

  const fallback = await supabase
    .from("admin_messages")
    .select("id, kampid, besked, tidspunkt, visningsnavn, read")
    .eq("read", false)
    .order("tidspunkt", { ascending: false })
    .limit(5);

  return (fallback.data as AdminMessagePreview[] | null) ?? [];
}

export default function StartSide() {
  const router = useRouter();

  const [bruger, setBruger] = useState<Bruger | null>(null);
  const [loading, setLoading] = useState(true);
  const [ulæsteDM, setUlæsteDM] = useState<number>(0);
  const [ulæsteAdmin, setUlæsteAdmin] = useState<number>(0);
  const [myElo, setMyElo] = useState<number | null>(null);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [topPlayers, setTopPlayers] = useState<RankingRow[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<EventPreview[]>([]);
  const [latestMessages, setLatestMessages] = useState<MessagePreview[]>([]);
  const [latestAdminMessages, setLatestAdminMessages] = useState<AdminMessagePreview[]>([]);
  const [adminBusyId, setAdminBusyId] = useState<string | number | null>(null);
  const [mineEventSets, setMineEventSets] = useState<EventSet[]>([]);
  const [scoreBusy, setScoreBusy] = useState(false);
  const [scoreError, setScoreError] = useState<string | null>(null);

  async function håndterAdminBesked(
    id: string | number,
    action: "approve" | "reject" | "dismiss"
  ) {
    setAdminBusyId(id);
    const res = await fetch("/api/result-change-request", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId: id, action }),
    });
    const data = await res.json();

    if (!res.ok) {
      setAdminBusyId(null);
      alert(data?.error || "Kunne ikke håndtere ændringen lige nu.");
      return;
    }

    setLatestAdminMessages((prev) => prev.filter((message) => String(message.id) !== String(id)));
    setUlæsteAdmin((prev) => Math.max(0, prev - 1));
    setAdminBusyId(null);
  }

  useEffect(() => {
    let mounted = true;

    const håndhævRegelOgHent = async () => {
      // 1) Session
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;

      // Ikke logget ind → /login
      if (!user) {
        router.replace("/login");
        return;
      }

      // 2) Tjek om der findes en profilrække (så er brugeren reelt registreret)
      const { count: profileCount, error: profileErr } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("id", user.id);

      // Brug profil-eksistens som primær sandhed, fald tilbage til user_metadata.registered
      const isRegistered =
        (!profileErr && (profileCount ?? 0) > 0) ||
        !!user.user_metadata?.registered;

      if (!isRegistered) {
        router.replace("/registrer");
        return;
      }

      // 3) Hent profil-data til UI
      const { data: profile } = await supabase
        .from("profiles")
        .select("visningsnavn, rolle, torsdagspadel, status")
        .eq("id", user.id)
        .maybeSingle();

      const rolle = profile?.rolle ?? "bruger";
      const initBruger: Bruger = {
        visningsnavn:
          profile?.visningsnavn ??
          (user.user_metadata?.visningsnavn || "Ukendt"),
        rolle,
        torsdagspadel: !!profile?.torsdagspadel,
        status: profile?.status ?? null,
      };
      if (mounted) setBruger(initBruger);

      const today = new Date().toLocaleDateString("sv-SE", {
        timeZone: "Europe/Copenhagen",
      });

      const [
        dmResponse,
        adminResponse,
        rankingResponse,
        activeProfilesResponse,
        upcomingResponse,
        latestMessagesResponse,
        latestAdminMessagesResponse,
        mineEventsResponse,
      ] = await Promise.all([
        supabase
          .from("beskeder")
          .select("*", { count: "exact", head: true })
          .eq("recipient_id", user.id)
          .is("read_at", null),
        rolle === "admin"
          ? fetchUnreadAdminCount(supabase)
          : Promise.resolve(0),
        fetch("/api/rangliste", { cache: "no-store" })
          .then((res) => res.json())
          .catch(() => []),
        supabase
          .from("profiles")
          .select("visningsnavn")
          .eq("status", "active"),
        supabase
          .from("events")
          .select("id, name, date, start_time, location, status")
          .gte("date", today)
          .order("date", { ascending: true })
          .limit(3),
        supabase
          .from("beskeder")
          .select(
            "id, sender_id, sender_visningsnavn, recipient_id, recipient_visningsnavn, body, created_at, read_at"
          )
          .or(`recipient_id.eq.${user.id},sender_id.eq.${user.id}`)
          .order("created_at", { ascending: false })
          .limit(3),
        rolle === "admin"
          ? fetchLatestAdminMessages(supabase)
          : Promise.resolve([]),
        supabase
          .from("events")
          .select("id, date, status")
          .gte("date", today)
          .lte(
            "date",
            new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toLocaleDateString("sv-SE", {
              timeZone: "Europe/Copenhagen",
            })
          ),
      ]);

      if (!mounted) return;

      setUlæsteDM(dmResponse.count ?? 0);
      setUlæsteAdmin(typeof adminResponse === "number" ? adminResponse : 0);

      const rankingList = extractArray(rankingResponse)
        .map((row) => ({
          visningsnavn: String(
            (row as { visningsnavn?: unknown }).visningsnavn ?? ""
          ).trim(),
          elo: Number((row as { elo?: unknown }).elo ?? 0),
        }))
        .filter((row) => row.visningsnavn && Number.isFinite(row.elo))
        .sort((a, b) => b.elo - a.elo);

      const activeProfiles = activeProfilesResponse.data ?? [];

      const activeNames = new Set(
        ((activeProfiles as Array<{ visningsnavn: string | null }> | null) ?? [])
          .map((row) => String(row.visningsnavn ?? "").trim().toLowerCase())
          .filter(Boolean)
      );

      const activeRankingList = rankingList.filter((row) =>
        activeNames.has(row.visningsnavn.toLowerCase())
      );

      setTopPlayers(activeRankingList);

      const myIndex = activeRankingList.findIndex(
        (row) =>
          row.visningsnavn.toLowerCase() ===
          initBruger.visningsnavn.trim().toLowerCase()
      );
      setMyRank(myIndex >= 0 ? myIndex + 1 : null);
      const myOverallRow = rankingList.find(
        (row) =>
          row.visningsnavn.toLowerCase() ===
          initBruger.visningsnavn.trim().toLowerCase()
      );
      setMyElo(myOverallRow?.elo ?? null);

      setUpcomingEvents((upcomingResponse.data as EventPreview[] | null) ?? []);
      setLatestMessages(
        (latestMessagesResponse.data as MessagePreview[] | null) ?? []
      );
      setLatestAdminMessages(
        Array.isArray(latestAdminMessagesResponse) ? latestAdminMessagesResponse : []
      );

      const publishedEvents = (((mineEventsResponse.data as Array<{ id: string | number; date: string | null; status?: string | null }> | null) ?? [])
        .filter((event) => (event.status ?? "").toLowerCase() === "published"));

      if (publishedEvents.length > 0) {
        const eventIds = publishedEvents.map((event) => event.id);
        const dateByEvent = new Map(
          publishedEvents.map((event) => [String(event.id), event.date ?? today] as const)
        );

        const { data: eventResultData } = await (supabase.from("event_result") as any)
          .select("*")
          .in("event_id", eventIds)
          .order("group_index", { ascending: true })
          .order("set_index", { ascending: true });

        const allSets = mapEventRowsToSets(
          (eventResultData as EventResultRow[] | null) ?? [],
          today
        ).map((row) => ({
          ...row,
          event_dato: dateByEvent.get(String(row.event_id)) ?? today,
        }));

        const lowerName = initBruger.visningsnavn.trim().toLowerCase();
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

      setLoading(false);
    };

    håndhævRegelOgHent();

    // Lyt til auth-ændringer (fx login/logout i andre faner)
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user;
      if (!user) {
        router.replace("/registrer");
      } else {
        håndhævRegelOgHent();
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase, router]);

  const logUd = async () => {
    await supabase.auth.signOut();
    router.replace("/registrer"); // efter logout ⇒ reglen
  };

  const brugerNavn = bruger?.visningsnavn ?? "";
  const harTorsdagspadel = !!bruger?.torsdagspadel;
  const erAdmin = bruger?.rolle === "admin";
  const adminIssuesSection = erAdmin ? (
    <section className="rounded-[20px] border border-[#ffd58d] bg-gradient-to-br from-[#fff6dc] via-[#fff2c8] to-[#ffe7a8] p-4 shadow-[0_10px_28px_rgba(219,157,18,0.16)]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[#9a5d00]">
            Admin
          </p>
          <h2 className="text-[13px] font-bold uppercase tracking-[0.12em] text-[#2d3340]">
            Fejlmeldte resultater
          </h2>
        </div>
        <Link href="/admin/beskeder" className="text-xs font-bold text-[#f01f78]">
          Se alle
        </Link>
      </div>
      <div className="space-y-2">
        {latestAdminMessages.length > 0 ? (
          latestAdminMessages.map((message) => (
            <div
              key={String(message.id)}
              className="rounded-[14px] border border-[#ffe0a3] bg-white/85 p-3"
            >
              {(() => {
                const parsed = parseResultChangeRequest(message.besked);
                const status = getResultChangeReviewStatus(parsed);
                return (
                  <>
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <p className="text-sm font-bold text-[#232833]">
                        {message.visningsnavn || "Ukendt spiller"}
                      </p>
                      <span className="text-[11px] font-semibold text-[#8b92a0]">
                        {formatTimeAgo(message.tidspunkt)}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-[#f01f78]">
                      Kamp #{message.kampid ?? "?"}
                    </p>
                    {parsed ? (
                      <>
                        <p className="mt-1 text-sm font-semibold text-[#232833]">
                          Foreslaet resultat: {formatResultChangeSetSummary(parsed.sets)}
                        </p>
                        {parsed.comment ? (
                          <p className="mt-1 text-sm text-[#5f6673]">{parsed.comment}</p>
                        ) : null}
                      </>
                    ) : (
                      <p className="mt-1 text-sm text-[#5f6673]">{message.besked}</p>
                    )}
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <span className="rounded-full bg-[#fff3f8] px-2.5 py-1 text-[10px] font-bold text-[#c0135a]">
                        {status === "pending" ? "Anfægtet" : status}
                      </span>
                      <div className="flex items-center gap-2">
                        {!parsed ? (
                          <button
                            type="button"
                            onClick={() => håndterAdminBesked(message.id, "dismiss")}
                            disabled={adminBusyId === message.id}
                            className="inline-flex items-center justify-center rounded-full bg-[#a1a7b1] px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-[#8d94a0] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {adminBusyId === message.id ? "Gemmer..." : "Marker håndteret"}
                          </button>
                        ) : null}
                        {parsed ? (
                          <button
                            type="button"
                            onClick={() => håndterAdminBesked(message.id, "reject")}
                            disabled={adminBusyId === message.id}
                            className="inline-flex items-center justify-center rounded-full bg-[#8f96a3] px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-[#7c8492] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {adminBusyId === message.id ? "Gemmer..." : "Afvis ændring"}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() =>
                            håndterAdminBesked(message.id, parsed ? "approve" : "dismiss")
                          }
                          disabled={adminBusyId === message.id}
                          className="inline-flex items-center justify-center rounded-full bg-[#f01f78] px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-[#d21869] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {adminBusyId === message.id
                            ? "Gemmer..."
                            : parsed
                              ? "Godkend ændring"
                              : "Luk"}
                        </button>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          ))
        ) : (
          <p className="text-sm text-[#8b92a0]">
            Ingen fejlmeldinger lige nu.
          </p>
        )}
      </div>
    </section>
  ) : null;
  const soverPaaRanglisten = bruger?.status === "sleep";
  const erInaktiv = bruger?.status === "inactive";

  const primaryActions = [
    {
      href: "/newscore",
      icon: "➕",
      title: "Indtast resultat",
      subtitle: "Registrer nye sæt",
    },
    {
      href: "/resultater",
      icon: "🧾",
      title: "Resultater",
      subtitle: "Se seneste kampe",
    },
    {
      href: "/ranglister",
      icon: "📊",
      title: "Ranglister",
      subtitle: "Toplister og form",
    },
    {
      href: "/kommende",
      icon: "📅",
      title: "Events",
      subtitle: "Kommende aktiviteter",
    },
    ...(harTorsdagspadel
      ? [
          {
            href: "/torsdagspadel",
            icon: "🏋️",
            title: "Torsdagspadel",
            subtitle: "Rangliste og info",
          },
        ]
      : []),
    ...(erAdmin
      ? [
          {
            href: "/admin",
            icon: "🛠",
            title: "Admin",
            subtitle: "Events og styring",
          },
        ]
      : []),
  ];

  const rankingPreview = useMemo(() => {
    if (!bruger) return topPlayers;

    if (soverPaaRanglisten || erInaktiv || !myRank) {
      return topPlayers.slice(0, 5);
    }

    const topThree = topPlayers.slice(0, 3);
    const nearbyPlayers = topPlayers.filter((player, index) => {
      const placement = index + 1;
      return placement >= myRank - 1 && placement <= myRank + 1;
    });

    const merged = [...topThree, ...nearbyPlayers];
    const seen = new Set<string>();

    return merged.filter((player) => {
      const key = player.visningsnavn.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [bruger, erInaktiv, myRank, soverPaaRanglisten, topPlayers]);

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
    const lowerName = brugerNavn.trim().toLowerCase();
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

  if (loading) {
    return <LoadingState />;
  }

  // Brugeren er garanteret logget ind + registreret her (ellers var der redirect)
  if (!bruger) return null;

  return (
    <PageShell className="bg-[#1a1a2e] px-0 py-0 md:px-6 md:py-6">
      <div className="mx-auto flex min-h-screen w-full max-w-[820px] flex-col overflow-hidden bg-[#f4f5f7] md:min-h-[min(100vh,980px)] md:rounded-[34px] md:border md:border-white/10 md:shadow-[0_28px_80px_rgba(0,0,0,0.35)]">
        <header className="bg-gradient-to-br from-[#f01f78] to-[#c0135a] px-4 pb-5 pt-4 text-white md:px-6">
          <div className="mb-4 flex items-center justify-between text-[11px] font-semibold opacity-90">
            <span>Padelhuset</span>
            <span>{new Intl.DateTimeFormat("da-DK", { hour: "2-digit", minute: "2-digit" }).format(new Date())}</span>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/75">
                Dashboard
              </p>
              <h1 className="mt-1 text-2xl font-black tracking-tight">
                Hej {bruger.visningsnavn}
              </h1>
            </div>

            <div className="flex items-center gap-3">
              <Link
                href="/beskeder"
                className="relative inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/18 text-lg backdrop-blur"
                aria-label="Beskeder"
              >
                💬
                {ulæsteDM > 0 ? (
                  <span className="absolute -right-1 -top-1 inline-flex min-w-4 justify-center rounded-full bg-[#ffd44d] px-1 text-[10px] font-black text-[#4f3410]">
                    {ulæsteDM}
                  </span>
                ) : null}
              </Link>
              <Link
                href={`/profil/${encodeURIComponent(bruger.visningsnavn)}`}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#ffd44d] text-xs font-black text-[#463018]"
                aria-label="Min profil"
              >
                {initials(bruger.visningsnavn)}
              </Link>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 pb-28 pt-4 md:px-6">
          <div className="space-y-4">
            <p className="text-sm text-[#6d7280]">
              {soverPaaRanglisten
                ? "Du er ikke på ranglisten lige nu, "
                : erInaktiv
                  ? "Din profil er inaktiv på ranglisten."
                  : "Klar til kamp. "}
              <span className="font-bold text-[#f01f78]">
                {soverPaaRanglisten
                  ? "fordi du ikke har indrapporteret et resultat i 3 mdr."
                  : erInaktiv
                    ? "Aktivér profilen for at få en placering igen."
                    : formatRelativeRank(myRank)}
              </span>
            </p>

            <Link
              href={`/profil/${encodeURIComponent(bruger.visningsnavn)}`}
              className="relative block overflow-hidden rounded-[24px] bg-gradient-to-br from-[#f01f78] to-[#c0135a] px-5 py-5 text-white shadow-[0_18px_40px_rgba(232,25,106,0.32)]"
            >
              <div className="absolute right-4 top-1/2 -translate-y-1/2 text-6xl opacity-15">
                🎾
              </div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/75">
                Din Elo
              </p>
              <div className="mt-1 text-5xl font-black leading-none">
                {myElo !== null ? Math.round(myElo) : "—"}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded-full bg-white/18 px-3 py-1 font-semibold">
                  {soverPaaRanglisten
                    ? "Sover på ranglisten"
                    : erInaktiv
                      ? "Ikke aktiv på ranglisten"
                      : `#${myRank ?? "—"} i huset`}
                </span>
              </div>
            </Link>

            <section className="grid grid-cols-2 gap-3">
              {primaryActions.map((action) => (
                <Link
                  key={action.href}
                  href={action.href}
                  className="rounded-[18px] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.07)] transition hover:-translate-y-0.5"
                >
                  <div className="mb-3 text-[22px]">{action.icon}</div>
                  <p className="text-sm font-extrabold text-[#1f2430]">
                    {action.title}
                  </p>
                  <p className="mt-1 text-xs text-[#838999]">{action.subtitle}</p>
                </Link>
              ))}
            </section>

            {adminIssuesSection}

            <section className="rounded-[20px] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.07)]">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-[13px] font-bold uppercase tracking-[0.12em] text-[#2d3340]">
                  Dine kampe
                </h2>
                <Link href="/kommende" className="text-xs font-bold text-[#f01f78]">
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
                              {formatShortDate(meta.event_dato)} · {formatTime(meta.starttid)}–{formatTime(meta.sluttid)} · {meta.bane}
                            </p>
                          </div>
                          <span className="rounded-full bg-[#fff0f5] px-2.5 py-1 text-[10px] font-bold text-[#f01f78]">
                            {sets.length} sæt
                          </span>
                        </div>

                        <div className="space-y-2 text-sm text-[#414754]">
                          {sets.map((row) => (
                            <StartsideScoreEntryCard
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
                            className="inline-flex items-center justify-center rounded-full border-2 border-pink-500 bg-white px-3 py-1.5 text-sm font-semibold text-pink-600 shadow transition hover:bg-pink-50"
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

            <section className="rounded-[20px] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.07)]">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-[13px] font-bold uppercase tracking-[0.12em] text-[#2d3340]">
                  Ranglisten
                </h2>
                <Link href="/ranglister" className="text-xs font-bold text-[#f01f78]">
                  Se alle
                </Link>
              </div>
              <div className="space-y-1">
                {rankingPreview.map((player, index) => {
                  const isMe =
                    player.visningsnavn.toLowerCase() ===
                    bruger.visningsnavn.trim().toLowerCase();
                  const placement =
                    topPlayers.findIndex(
                      (entry) =>
                        entry.visningsnavn.toLowerCase() ===
                        player.visningsnavn.toLowerCase()
                    ) + 1;

                  return (
                    <Link
                      key={`${player.visningsnavn}-${placement}`}
                      href={`/profil/${encodeURIComponent(player.visningsnavn)}`}
                      className={[
                        "flex items-center gap-3 rounded-[12px] px-2 py-2",
                        isMe ? "bg-[#fff3f8]" : "",
                      ].join(" ")}
                    >
                      <span className="w-6 text-center text-sm font-black text-[#505767]">
                        {placement}
                      </span>
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#eceef2] text-[11px] font-black text-[#656b79]">
                        {initials(player.visningsnavn)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-[#1f2430]">
                          {player.visningsnavn}
                        </p>
                      </div>
                      <span className="text-sm font-black text-[#f01f78]">
                        {Math.round(player.elo)}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>

            <section className="rounded-[20px] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.07)]">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-[13px] font-bold uppercase tracking-[0.12em] text-[#2d3340]">
                  Kommende events
                </h2>
                <Link href="/kommende" className="text-xs font-bold text-[#f01f78]">
                  Se alle
                </Link>
              </div>
              <div className="space-y-2">
                {upcomingEvents.length > 0 ? (
                  upcomingEvents.map((event) => (
                    <Link
                      key={String(event.id)}
                      href="/kommende"
                      className="flex items-center gap-3 rounded-[14px] py-1"
                    >
                      <div className="flex h-11 w-11 flex-col items-center justify-center rounded-[12px] bg-[#f01f78] text-white">
                        <span className="text-base font-black leading-none">
                          {formatShortDate(event.date).split(" ")[0]}
                        </span>
                        <span className="text-[9px] uppercase tracking-[0.08em] text-white/75">
                          {formatWeekday(event.date)}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-[#232833]">
                          {event.name || "Event"}
                        </p>
                        <p className="truncate text-xs text-[#8b92a0]">
                          {[event.start_time?.slice(0, 5), event.location]
                            .filter(Boolean)
                            .join(" • ") || "Tid kommer snart"}
                        </p>
                      </div>
                      <span className="rounded-full bg-[#fff0f5] px-2 py-1 text-[10px] font-bold text-[#f01f78]">
                        {(event.status || "åben").toLowerCase()}
                      </span>
                    </Link>
                  ))
                ) : (
                  <p className="text-sm text-[#8b92a0]">
                    Ingen kommende events fundet lige nu.
                  </p>
                )}
              </div>
            </section>

            <section className="rounded-[20px] bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.07)]">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-[13px] font-bold uppercase tracking-[0.12em] text-[#2d3340]">
                  Nyeste beskeder
                </h2>
                <Link href="/beskeder" className="text-xs font-bold text-[#f01f78]">
                  Se alle
                </Link>
              </div>
              <div className="space-y-1">
                {latestMessages.length > 0 ? (
                  latestMessages.map((message) => {
                    const fromMe = message.sender_visningsnavn === bruger.visningsnavn;
                    const counterpart = fromMe
                      ? message.recipient_visningsnavn
                      : message.sender_visningsnavn;
                    const unread = !fromMe && !message.read_at;

                    return (
                      <Link
                        key={message.id}
                        href="/beskeder"
                        className="flex items-start gap-3 border-b border-[#f1f2f5] py-2 last:border-b-0"
                      >
                        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#f01f78] to-[#9b59b6] text-xs font-black text-white">
                          {initials(counterpart)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <p className="truncate text-sm font-bold text-[#232833]">
                              {counterpart}
                            </p>
                            <span className="shrink-0 text-[11px] text-[#a1a7b1]">
                              {formatTimeAgo(message.created_at)}
                            </span>
                          </div>
                          <p className="truncate text-xs text-[#8b92a0]">
                            {message.body}
                          </p>
                        </div>
                        {unread ? (
                          <span className="mt-1 h-2 w-2 rounded-full bg-[#f01f78]" />
                        ) : null}
                      </Link>
                    );
                  })
                ) : (
                  <p className="text-sm text-[#8b92a0]">Ingen beskeder endnu.</p>
                )}
              </div>
            </section>
          </div>
        </div>

        <nav className="absolute inset-x-0 bottom-0 flex justify-around border-t border-black/5 bg-white px-2 pb-5 pt-3 md:static md:pb-4">
          {[
            { href: "/startside", icon: "🏠", label: "Hjem" },
            { href: "/ranglister", icon: "📊", label: "Rangliste" },
            { href: "/kommende", icon: "📅", label: "Events" },
            { href: `/profil/${encodeURIComponent(bruger.visningsnavn)}`, icon: "🧑‍🎾", label: "Profil" },
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
          <button
            onClick={logUd}
            className="flex min-w-16 flex-col items-center gap-1 text-[#7b8190]"
          >
            <span className="text-lg">↪</span>
            <span className="text-[11px] font-semibold">Log ud</span>
          </button>
        </nav>
      </div>
    </PageShell>
  );
}

function StartsideScoreEntryCard({
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
            🏟 {row.bane} · ⏱ {formatTime(row.starttid)}–{formatTime(row.sluttid)}
          </p>
        </div>
        <div className="flex items-center gap-2 justify-self-end">
          <input
            value={scoreA}
            onChange={(e) => setScoreA(sanitize(e.target.value))}
            inputMode="numeric"
            className="h-10 w-10 rounded-[10px] border border-zinc-200 bg-white px-2 py-1.5 text-center text-sm font-black text-[#1f2430] outline-none"
          />
          <span className="text-sm font-bold text-[#838999]">-</span>
          <input
            value={scoreB}
            onChange={(e) => setScoreB(sanitize(e.target.value))}
            inputMode="numeric"
            className="h-10 w-10 rounded-[10px] border border-zinc-200 bg-white px-2 py-1.5 text-center text-sm font-black text-[#1f2430] outline-none"
          />
        </div>
      </div>

      <div className="mt-3 text-sm leading-tight text-[#414754]">
        {row.holda1} & {row.holda2} <span className="opacity-60">vs</span><br />
        {row.holdb1} & {row.holdb2}
      </div>

      <div className="mt-3 min-h-[20px] text-right text-xs font-semibold text-[#838999]">
        {saving ? "Gemmer..." : ""}
      </div>
    </div>
  );
}
