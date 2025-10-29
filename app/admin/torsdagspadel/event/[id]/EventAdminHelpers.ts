// EventAdminHelpers.ts
import { supabase } from "@/lib/supabaseClient";

/* ===== Typer ===== */
export type EventRow = {
  id: string;
  name: string | null;
  date: string;
  start_time: string | null;
  end_time: string | null;
  location: "Helsinge" | "Gilleleje";
  status: "planned" | "published" | "ongoing" | "done" | "canceled" | null;
};
export type Profile = { id: string; visningsnavn: string | null };
export type EventSignup = {
  visningsnavn: string | null;
  tidligste_tid: string | null;
  kan_spille: boolean | null;
  event_dato: string | null;
};
export type EventPlayer = {
  user_id: string; // "name:..." synthetic id
  visningsnavn: string | null;
  elo: number;
  tidligste_tid: string | null;
};
export type Score = { a: number; b: number };

export type EventResultInsert = {
  event_id: string;
  group_index: number;
  set_index: number;
  court_label: string | null;
  start_time: string | null;
  end_time: string | null;
  holdA1: string | null;
  holdA2: string | null;
  holdB1: string | null;
  holdB2: string | null;
  scoreA: number;
  scoreB: number;
  tiebreak: boolean;
};

/* ===== Styling ===== */

// “Bentley grøn”: vi bruger én central accent og bruger Tailwind via inline style.
export const bentleyGreen = {
  text: "text-green-600",
  border: "border-green-600",
  bgSoft: "bg-green-50 dark:bg-green-900/10",
  boxBorder: "border-green-500/80 dark:border-green-700/80",
  headerBg: "bg-green-100/60 dark:bg-green-900/30",
};

/* ===== Utility-funktioner ===== */
export const fmtTime = (t?: string | null) => (t ? t.slice(0, 5) : "");
export const normName = (v?: string | null) => (v || "").trim().toLowerCase();
export const toHHMM = (v?: string | null) => (v ? v.slice(0, 5) : null);

export const toMinutes = (v?: string | null) => {
  if (!v) return 1e9;
  const m = v.slice(0, 5).match(/^(\d{2}):(\d{2})$/);
  if (!m) return 1e9;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
};

export const ROT = [
  [[0, 1],[2, 3]],
  [[0, 2],[1, 3]],
  [[0, 3],[1, 2]],
] as const;

export const erFærdigtSæt = (a: number, b: number) => {
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return (hi === 6 && lo <= 4) || (hi === 7 && (lo === 5 || lo === 6));
};

// Brug samme grønne farveskala til procent – ikke HSL magi der stikker af.
// A får grøn når A er favorit. B får grøn når B er favorit. Ellers grå.
export function pctClasses(pct: number, otherPct: number) {
  if (pct === otherPct) return "text-zinc-500";
  return pct > otherPct ? "text-green-600" : "text-zinc-500";
}

// Emojis til Elo-diff
export function emojiForPluspoint(p: number) {
  return p >= 100
    ? "🍾"
    : p >= 50
    ? "🏆"
    : p >= 40
    ? "🥇"
    : p >= 30
    ? "☄️"
    : p >= 20
    ? "🏸"
    : p >= 10
    ? "🔥"
    : p >= 5
    ? "📈"
    : p >= 0
    ? "💪"
    : p > -5
    ? "🎲"
    : p > -10
    ? "📉"
    : p > -20
    ? "🧯"
    : p > -30
    ? "🪂"
    : p > -40
    ? "❄️"
    : p > -50
    ? "💩"
    : p > -100
    ? "🥊"
    : "🙈";
}

// Default torsdagsbaner/tider
export function makeDefaultThursdaySlots(n: number) {
  const courts = ["CC", "1", "2", "3"];
  const blocks = [
    { start: "17:00", end: "18:40" },
    { start: "18:40", end: "20:20" },
    { start: "20:20", end: "22:00" },
  ];
  const out: { court: string; start: string; end: string }[] = [];
  while (out.length < n) {
    for (const block of blocks) {
      for (const c of courts) {
        out.push({ court: c, start: block.start, end: block.end });
        if (out.length >= n) break;
      }
      if (out.length >= n) break;
    }
  }
  return out;
}

// simple chunk i grupper på 4
export const grupperAf4 = <T,>(arr: T[]) => {
  const res: T[][] = [];
  for (let i=0; i<arr.length; i+=4) res.push(arr.slice(i,i+4));
  return res;
};

// hh:mm -> hh:mm:00 til DB
export const hhmmToDb = (v?: string|null) =>
  v ? (v.length === 5 ? `${v}:00` : v) : null;

/* ===== DB helpers ===== */
export async function upsertEventResultRow(p: {
  eventId: string;
  gi: number;
  si: number;
  courtLabel?: string | number;
  start?: string;
  end?: string;
  a1?: string;
  a2?: string;
  b1?: string;
  b2?: string;
  scoreA?: number;
  scoreB?: number;
  tiebreak?: boolean;
}) {
  const payload: EventResultInsert = {
    event_id: p.eventId,
    group_index: p.gi,
    set_index: p.si,
    court_label: p.courtLabel != null ? String(p.courtLabel) : null,
    start_time: hhmmToDb(p.start ?? null),
    end_time: hhmmToDb(p.end ?? null),
    holdA1: p.a1 ?? null,
    holdA2: p.a2 ?? null,
    holdB1: p.b1 ?? null,
    holdB2: p.b2 ?? null,
    scoreA: p.scoreA ?? 0,
    scoreB: p.scoreB ?? 0,
    tiebreak: p.tiebreak ?? false,
  };
  const { error } = await (supabase.from("event_result") as any).upsert(
    [payload],
    { onConflict: "event_id,group_index,set_index" }
  );
  if (error) {
    console.error("upsertEventResultRow", error);
    alert("Kunne ikke gemme i event_result: " + error.message);
  }
}

// byg hele programmet -> bruges til publish/done og ved indsend
export function buildAllRows(opts: {
  eventId: string;
  plan: {
    gi: number;
    players: EventPlayer[];
    court: string;
    start: string;
    end: string;
  }[];
  rounds: Record<number, number>;
  scores: Record<string, Score>;
}) {
  const rows: EventResultInsert[] = [];
  const { eventId, plan, rounds, scores } = opts;
  for (const g of plan) {
    const setsInThisGroup = rounds[g.gi] ?? 3;
    for (let si=0; si<setsInThisGroup; si++) {
      const rot = ROT[si % ROT.length];
      const a1 = g.players[rot[0][0]]?.visningsnavn || null;
      const a2 = g.players[rot[0][1]]?.visningsnavn || null;
      const b1 = g.players[rot[1][0]]?.visningsnavn || null;
      const b2 = g.players[rot[1][1]]?.visningsnavn || null;
      const sc = scores[`${g.gi}-${si}`] ?? { a:0, b:0 };
      rows.push({
        event_id: eventId,
        group_index: g.gi,
        set_index: si,
        court_label: g.court,
        start_time: hhmmToDb(g.start),
        end_time: hhmmToDb(g.end),
        holdA1: a1,
        holdA2: a2,
        holdB1: b1,
        holdB2: b2,
        scoreA: sc.a,
        scoreB: sc.b,
        tiebreak: false,
      });
    }
  }
  return rows;
}

export async function persistProgramToEventResult(opts: {
  eventId: string;
  plan: {
    gi: number;
    players: EventPlayer[];
    court: string;
    start: string;
    end: string;
  }[];
  rounds: Record<number, number>;
  scores: Record<string, Score>;
}) {
  const rows = buildAllRows(opts);
  if (!rows.length) return;
  const { error } = await (supabase.from("event_result") as any).upsert(
    rows,
    { onConflict: "event_id,group_index,set_index" }
  );
  if (error) throw error;
}

export async function getNextKampId(): Promise<number> {
  type Row = { kampid: number | string | null };
  const { data, error } = await supabase
    .from("newresults")
    .select("kampid")
    .order("kampid", { ascending: false })
    .limit(1);
  if (error) return 1;
  const last = (data as Row[] | null)?.[0]?.kampid;
  const n =
    typeof last === "number" ? last :
    typeof last === "string" ? parseInt(last,10) : 0;
  return (Number.isFinite(n) ? n : 0) + 1;
}
