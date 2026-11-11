"use client";

import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/lib/supabaseClient";
import type { TvRankingData } from "@/lib/rankingOverview";
import { DEFAULT_WEEK_PROGRAM, WEEKDAYS, type WeekSession } from "@/lib/tvWeekProgram";
import styles from "./tv.module.css";

type TvSlide = {
  id: string;
  title: string;
  file_url: string;
  file_type: "pdf" | "image";
  start_date: string | null;
  end_date: string | null;
  duration_seconds: number;
};

type RankingColumn = {
  start: number;
  rows: TvRankingData["rangliste"];
  metric: string;
  format: Intl.NumberFormat;
  heading?: { title: string; detail?: string; color: "gold" | "lilac" | "lime" };
};

type RankingSlide = {
  id: string;
  kind: "ranking";
  title: string;
  subtitle?: string;
  columns: RankingColumn[];
  duration: number;
};

type MediaSlide = TvSlide & { kind: "media"; duration: number };

const SIGNUP_URL = "https://padelhuset-app.netlify.app/signup";
const TV_VERSION = process.env.NEXT_PUBLIC_TV_VERSION;
const POINTS = new Intl.NumberFormat("da-DK", { maximumFractionDigits: 0 });
const MONTHLY_POINTS = new Intl.NumberFormat("da-DK", {
  maximumFractionDigits: 1,
  signDisplay: "exceptZero",
});
const MONTH = new Intl.DateTimeFormat("da-DK", {
  timeZone: "Europe/Copenhagen",
  month: "long",
  year: "numeric",
});

const ROWS_PER_COLUMN = 20;
const COLUMNS_PER_PAGE = 3;
const WEEK_SLIDE = { id: "week-program", kind: "week", title: "Ugens spil", duration: 30 } as const;

function buildRankingSlides(data: TvRankingData): RankingSlide[] {
  const pageSize = ROWS_PER_COLUMN * COLUMNS_PER_PAGE;
  const rankingPages: RankingSlide[] = Array.from(
    { length: Math.max(1, Math.ceil(data.rangliste.length / pageSize)) },
    (_, index) => {
      const start = index * pageSize;
      const rows = data.rangliste.slice(start, start + pageSize);
      const columns = Array.from(
        { length: Math.ceil(rows.length / ROWS_PER_COLUMN) },
        (_, column) => {
          const offset = column * ROWS_PER_COLUMN;
          return {
            start: start + offset,
            rows: rows.slice(offset, offset + ROWS_PER_COLUMN),
            metric: "Elo-point",
            format: POINTS,
          };
        }
      );
      return {
        id: `ranking-${index}`,
        kind: "ranking",
        title: "Ranglisten",
        subtitle: rows.length ? `Placering ${start + 1}–${start + rows.length}` : "Den samlede rangliste",
        columns,
        duration: 24,
      };
    }
  );

  return [
    ...rankingPages,
    {
      id: "top-twenty",
      kind: "ranking",
      title: "Top 20",
      duration: 24,
      columns: [
        {
          start: 0,
          heading: { title: "Månedens Spiller", detail: MONTH.format(new Date()), color: "gold" },
          metric: "Netto Elo",
          rows: data.monthly.slice(0, ROWS_PER_COLUMN),
          format: MONTHLY_POINTS,
        },
        {
          start: 0,
          heading: { title: "Girlpower-listen", color: "lilac" },
          metric: "Elo-point",
          rows: data.women.slice(0, ROWS_PER_COLUMN),
          format: POINTS,
        },
        {
          start: 0,
          heading: { title: "Æggejagten", detail: "Sæt vundet 6–0", color: "lime" },
          metric: "Æg",
          rows: data.eggs.slice(0, ROWS_PER_COLUMN),
          format: POINTS,
        },
      ],
    },
  ];
}

function RankingTables({ slide }: { slide: RankingSlide }) {
  if (slide.columns.length === 0) {
    return <p className={styles.status}>Ingen resultater endnu.</p>;
  }

  return (
    <div className={styles.tables}>
      {slide.columns.map(({ start, rows, metric, format, heading }) => (
        <section className={styles.table} key={heading?.title ?? start} data-color={heading?.color}>
          <header>
            {heading && (
              <div className={styles.category}>
                <h2>{heading.title}</h2>
                {heading.detail && <p>{heading.detail}</p>}
              </div>
            )}
            <div className={styles.tableHead}>
              <span>#</span><span>Spiller</span><span>{metric}</span>
            </div>
          </header>
          {rows.length > 0 ? (
            <ol className={styles.rows} start={start + 1}>
              {rows.map((row, index) => {
                const position = start + index + 1;
                return (
                  <li
                    className={`${styles.row} ${position <= 3 ? styles.podium : ""}`}
                    key={position}
                  >
                    <span className={styles.position}>{position}</span>
                    <span className={styles.player}>{row.visningsnavn}</span>
                    <span className={styles.points}>{format.format(row.elo ?? row.pluspoint ?? 0)}</span>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className={styles.emptyColumn}>Ingen resultater endnu.</p>
          )}
        </section>
      ))}
    </div>
  );
}

const WEEK_OFFER_ART = [
  { match: /americano/i, file: "morgenbroed.jpg", title: "Morgen Americano", original: "Formiddags Americano" },
  { match: /torsdags?\s*tøser/i, file: "torsdagstoeserne.jpg", title: "TorsdagsTøserne", original: "Rangliste TorsdagsTøserne" },
  { match: /fredags\s*fun/i, file: "fredags-fun.jpg", title: "Fredags Fun", original: "Rangliste Fredags Fun" },
  { match: /sunday\s*social/i, file: "sunday-social.jpg", title: "Sunday Social", original: "Rangliste Sunday Social" },
];

function WeekProgram({ program }: { program: WeekSession[] }) {
  const days = WEEKDAYS.flatMap((day) => {
    const sessions = program.filter((entry) => entry.day === day);
    if (!sessions.length) return [];

    const offers: { title: string; sessions: WeekSession[] }[] = [];
    for (const session of sessions) {
      const previous = offers[offers.length - 1];
      if (previous?.title === session.title) previous.sessions.push(session);
      else offers.push({ title: session.title, sessions: [session] });
    }
    return [{ day, sessions, offers }];
  });
  const columns = Math.min(days.length, Math.max(2, Math.ceil(days.length / 2)));

  return (
    <div className={styles.weekGrid} data-columns={columns}>
      {days.map(({ day, sessions, offers }) => (
        <section className={styles.weekDay} key={day} data-compact={sessions.length > 3 || undefined}>
          <h2>{day}</h2>
          <div className={styles.weekOffers} data-single={offers.length === 1 || undefined}>
            {offers.map((offer, index) => {
              const art = WEEK_OFFER_ART.find(({ match }) => match.test(offer.title));
              const title = art?.original === offer.title ? art.title : offer.title;
              return (
                <article className={styles.weekOffer} key={index} data-photo={!!art || undefined}>
                  {art && (
                    <div className={styles.weekPhoto}>
                      <img src={`/tv/ugeprogram/${art.file}`} alt="" />
                    </div>
                  )}
                  <div className={styles.weekOfferText}>
                    <h3>{title}</h3>
                    {offer.sessions.map((entry, sessionIndex) => (
                      <div className={styles.weekSlot} key={sessionIndex}>
                        <p className={styles.weekTime}>Kl. {entry.starts}–{entry.ends} i {entry.place}</p>
                        <p className={styles.weekLevel}>
                          {entry.level}
                          {entry.minPoints !== "" && (
                            <span> · {POINTS.format(Number(entry.minPoints))}–{POINTS.format(Number(entry.maxPoints))} point</span>
                          )}
                        </p>
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

export default function TvPage() {
  const [rankings, setRankings] = useState<TvRankingData | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [media, setMedia] = useState<MediaSlide[]>([]);
  const [activeId, setActiveId] = useState("ranking-0");
  const [weekProgram, setWeekProgram] = useState(DEFAULT_WEEK_PROGRAM);
  const [weekOnly, setWeekOnly] = useState<boolean | null>(null);

  useEffect(() => {
    setWeekOnly(new URLSearchParams(window.location.search).get("visning") === "ugeprogram");
    const controller = new AbortController();
    let refreshing = false;

    async function refresh() {
      if (refreshing) return;
      refreshing = true;
      try {
        const response = await fetch("/api/tv/ugeprogram", { signal: controller.signal });
        if (!response.ok) return;
        const { program, version }: { program: WeekSession[]; version?: string } = await response.json();
        if (controller.signal.aborted) return;
        setWeekProgram(program);

        if (TV_VERSION && version && version !== TV_VERSION) {
          const url = new URL(window.location.href);
          // Try a fresh URL once per deployment if an edge still serves old HTML.
          if (url.searchParams.get("tv-version") !== version) {
            url.searchParams.set("tv-version", version);
            window.location.replace(url.toString());
          }
        }
      } catch {
        // Keep the last schedule visible if the TV loses its connection.
      } finally {
        refreshing = false;
      }
    }

    void refresh();
    const interval = window.setInterval(refresh, 60_000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (weekOnly !== false) return;
    const controller = new AbortController();
    let refreshing = false;

    async function refresh() {
      if (refreshing) return;
      refreshing = true;
      try {
        const response = await fetch("/api/ranking-overview?visning=tv", { signal: controller.signal });
        if (!response.ok) throw new Error("Kunne ikke hente ranglisterne");
        const data: TvRankingData = await response.json();
        if (!controller.signal.aborted) {
          setRankings(data);
          setLoadFailed(false);
        }
      } catch {
        if (!controller.signal.aborted) setLoadFailed(true);
      } finally {
        refreshing = false;
      }
    }

    void refresh();
    const interval = window.setInterval(refresh, 60_000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [weekOnly]);

  useEffect(() => {
    if (weekOnly !== false) return;
    const controller = new AbortController();
    let refreshing = false;

    async function refresh() {
      if (refreshing) return;
      refreshing = true;
      try {
        const { data, error } = await supabase
          .from("tv_slides")
          .select("id,title,file_url,file_type,start_date,end_date,duration_seconds")
          .eq("is_active", true)
          .order("sort_order", { ascending: true })
          .order("created_at", { ascending: false })
          .abortSignal(controller.signal);

        if (error || controller.signal.aborted) return;
        const now = Date.now();
        setMedia(((data ?? []) as TvSlide[])
          .filter((slide) =>
            (!slide.start_date || Date.parse(slide.start_date) <= now) &&
            (!slide.end_date || Date.parse(slide.end_date) >= now)
          )
          .map((slide) => ({ ...slide, id: `media-${slide.id}`, kind: "media", duration: Math.max(slide.duration_seconds || 12, 5) })));
      } finally {
        refreshing = false;
      }
    }

    void refresh();
    const interval = window.setInterval(refresh, 30_000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [weekOnly]);

  const slides = useMemo(() => weekOnly
    ? [WEEK_SLIDE]
    : [
      ...(rankings ? buildRankingSlides(rankings) : []),
      ...(rankings || loadFailed ? [WEEK_SLIDE] : []),
      ...media,
    ], [rankings, loadFailed, media, weekOnly]);
  const index = Math.max(slides.findIndex((slide) => slide.id === activeId), 0);
  const slide = slides[index];
  const duration = slide?.duration;
  const currentId = slide?.id;
  const nextId = slides[(index + 1) % slides.length]?.id;
  const previousId = slides[(index + slides.length - 1) % slides.length]?.id;

  useEffect(() => {
    if (!nextId || nextId === currentId || !duration) return;
    const timer = window.setTimeout(() => setActiveId(nextId), duration * 1000);
    return () => window.clearTimeout(timer);
  }, [currentId, duration, nextId]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.key === "ArrowLeft" && previousId) setActiveId(previousId);
      if (event.key === "ArrowRight" && nextId) setActiveId(nextId);
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [previousId, nextId]);

  const ranking = slide?.kind === "ranking" ? slide : null;
  const isWeek = slide?.kind === "week";

  return (
    <main className={styles.screen} data-week={isWeek || undefined}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <p className={styles.brand}>Padelhuset</p>
          <h1>{slide?.title ?? "Ranglisten"}</h1>
          {ranking?.subtitle && <p className={styles.subtitle}>{ranking.subtitle}</p>}
          {isWeek && <p className={styles.subtitle}>Tilmelding til alle spil sker via <strong>MATCHi</strong>.</p>}
        </div>
        {slide?.kind !== "media" && (
          <a href={SIGNUP_URL} className={styles.signup} aria-label={isWeek ? "Opret ranglisteprofil" : "Tilmeld dig ranglisten"}>
            {isWeek ? <span>Opret<br />ranglisteprofil</span> : <span>Tilmeld dig<br />ranglisten</span>}
            <QRCodeSVG value={SIGNUP_URL} size={96} marginSize={4} title="QR-kode til tilmelding" />
          </a>
        )}
      </header>

      {ranking && <RankingTables slide={ranking} />}
      {isWeek && <WeekProgram program={weekProgram} />}
      {slide?.kind === "media" && (
        <div className={styles.media}>
          {slide.file_type === "image" ? (
            <img src={slide.file_url} alt={slide.title} />
          ) : (
            <iframe
              src={`${slide.file_url}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
              title={slide.title}
            />
          )}
        </div>
      )}
      {!slide && (
        <p className={styles.status} role="status">
          {loadFailed ? "Ranglisterne er midlertidigt utilgængelige. Skærmen prøver igen automatisk." : "Henter ranglister…"}
        </p>
      )}

      {slides.length > 1 && (
        <footer className={styles.footer}>
          <div className={styles.track} aria-hidden="true">
            <span key={`${currentId}-${nextId}-${duration}`} style={{ animationDuration: `${duration}s` }} />
          </div>
          <div className={styles.controls}>
            <button type="button" onClick={() => setActiveId(previousId)} aria-label="Forrige side">‹</button>
            <span>{index + 1} / {slides.length}</span>
            <button type="button" onClick={() => setActiveId(nextId)} aria-label="Næste side">›</button>
          </div>
        </footer>
      )}
    </main>
  );
}
