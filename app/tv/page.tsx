"use client";

import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/lib/supabaseClient";
import type { TvRankingData } from "@/lib/rankingOverview";
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

type RankingSlide = {
  id: string;
  kind: "ranking";
  title: string;
  subtitle: string;
  metric: string;
  color: "pink" | "gold" | "lilac" | "lime";
  start: number;
  columns: number;
  rowsPerColumn: number;
  rows: TvRankingData["rangliste"];
  format: Intl.NumberFormat;
  duration: number;
};

type MediaSlide = TvSlide & { kind: "media"; duration: number };

const SIGNUP_URL = "https://padelhuset-app.netlify.app/signup";
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

function buildRankingSlides(data: TvRankingData): RankingSlide[] {
  const rowsPerColumn = 20;
  const columns = 3;
  const pageSize = rowsPerColumn * columns;
  const rankingPages: RankingSlide[] = Array.from(
    { length: Math.max(1, Math.ceil(data.rangliste.length / pageSize)) },
    (_, index) => {
      const start = index * pageSize;
      const rows = data.rangliste.slice(start, start + pageSize);
      return {
        id: `ranking-${index}`, kind: "ranking", title: "Ranglisten",
        subtitle: rows.length ? `Placering ${start + 1}–${start + rows.length}` : "Den samlede rangliste",
        metric: "Elo-point", color: "pink", start, columns, rowsPerColumn, rows,
        format: POINTS, duration: 24,
      };
    }
  );

  const topTwenty = {
    kind: "ranking", start: 0, columns: 2, rowsPerColumn: 10, duration: 18,
  } as const;

  return [
    ...rankingPages,
    {
      ...topTwenty, id: "monthly", title: "Månedens Spiller", color: "gold",
      subtitle: `Top 20 · ${MONTH.format(new Date())}`, metric: "Netto Elo",
      rows: data.monthly.slice(0, 20), format: MONTHLY_POINTS,
    },
    {
      ...topTwenty, id: "women", title: "Girlpower-listen", color: "lilac",
      subtitle: "Top 20 · Kvinderanglisten", metric: "Elo-point",
      rows: data.women.slice(0, 20), format: POINTS,
    },
    {
      ...topTwenty, id: "eggs", title: "Æggejagten", color: "lime",
      subtitle: "Top 20 · Sæt vundet 6–0", metric: "Æg",
      rows: data.eggs.slice(0, 20), format: POINTS,
    },
  ];
}

function RankingTables({ slide }: { slide: RankingSlide }) {
  if (slide.rows.length === 0) {
    return <p className={styles.status}>Ingen resultater endnu.</p>;
  }

  return (
    <div className={`${styles.tables} ${slide.columns === 2 ? styles.topTwenty : ""}`}>
      {Array.from({ length: slide.columns }, (_, column) => {
        const offset = column * slide.rowsPerColumn;
        const rows = slide.rows.slice(offset, offset + slide.rowsPerColumn);
        return (
          <section className={styles.table} key={column} hidden={rows.length === 0}>
            <div className={styles.tableHead}>
              <span>#</span><span>Spiller</span><span>{slide.metric}</span>
            </div>
            <ol className={styles.rows} start={slide.start + offset + 1}>
              {rows.map((row, index) => {
                const position = slide.start + offset + index + 1;
                return (
                  <li
                    className={`${styles.row} ${position <= 3 ? styles.podium : ""}`}
                    key={position}
                  >
                    <span className={styles.position}>{position}</span>
                    <span className={styles.player}>{row.visningsnavn}</span>
                    <span className={styles.points}>{slide.format.format(row.elo ?? row.pluspoint ?? 0)}</span>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}
    </div>
  );
}

export default function TvPage() {
  const [rankings, setRankings] = useState<TvRankingData | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [media, setMedia] = useState<MediaSlide[]>([]);
  const [activeId, setActiveId] = useState("ranking-0");

  useEffect(() => {
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
  }, []);

  useEffect(() => {
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
  }, []);

  const slides = useMemo(() => [...(rankings ? buildRankingSlides(rankings) : []), ...media], [rankings, media]);
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

  return (
    <main className={styles.screen} data-color={ranking?.color ?? "pink"}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <p className={styles.brand}>Padelhuset</p>
          <h1>{slide?.title ?? "Ranglisten"}</h1>
          {ranking && <p className={styles.subtitle}>{ranking.subtitle}</p>}
        </div>
        {slide?.kind !== "media" && (
          <a href={SIGNUP_URL} className={styles.signup} aria-label="Tilmeld dig ranglisten">
            <span>Tilmeld dig<br />ranglisten</span>
            <QRCodeSVG value={SIGNUP_URL} size={96} marginSize={4} title="QR-kode til tilmelding" />
          </a>
        )}
      </header>

      {ranking && <RankingTables slide={ranking} />}
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
