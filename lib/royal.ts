/** Royal uses three fixed slots per pairing; the third is only used at 1–1. */
export const ROYAL_COURTS = ["CC", "1", "2", "3"];
export const ROYAL_RULES = "Mandage kl. 18.00–20.00 i Helsinge på CC, 1, 2 og 3. Spillerne seedes efter ranglisten: nr. 1 og 2 mod nr. 3 og 4 osv. Samme hold spiller bedst af tre sæt. Ved 1–1 spilles en matchtiebreak til 10 med to overskydende point. Ved 2–0 spilles intet tredje sæt. Derefter skiftes makker: 1+3 mod 2+4, til sidst 1+4 mod 2+3.";
const PAIRINGS = [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]]] as const;
export function eventRotation(si: number, royal = false) {
  return PAIRINGS[(royal ? Math.floor(si / 3) : si) % 3];
}
export function isRoyalTiebreak(si: number, royal = true) {
  return royal && si % 3 === 2;
}
export function finishedEventSet(a: number, b: number, matchTiebreak = false) {
  const hi = Math.max(a, b), lo = Math.min(a, b);
  return matchTiebreak
    ? (hi === 10 && lo <= 8) || (hi > 10 && hi - lo === 2)
    : (hi === 6 && lo <= 4) || (hi === 7 && (lo === 5 || lo === 6));
}
export type RoyalScore = { a: number; b: number };
const nonEmpty = (s: RoyalScore) => s.a !== 0 || s.b !== 0;
export function royalPairingComplete(sets: RoyalScore[]) {
  const [a, b, tb] = sets;
  if (!a || !b || !finishedEventSet(a.a, a.b) || !finishedEventSet(b.a, b.b)) return false;
  return (a.a > a.b) === (b.a > b.b) || !!tb && finishedEventSet(tb.a, tb.b, true);
}
export function validateRoyalScores(sets: RoyalScore[]): string | null {
  for (let si = 0; si < sets.length; si++) {
    const sc = sets[si];
    if (![sc.a, sc.b].every(n => Number.isSafeInteger(n) && n >= 0)) return "Scorer skal være hele, positive tal eller 0.";
    if (!nonEmpty(sc)) continue;
    if (!isRoyalTiebreak(si) && Math.max(sc.a, sc.b) > 7) return "Et almindeligt sæt kan højst gå til 7.";
    const base = Math.floor(si / 3) * 3;
    if (isRoyalTiebreak(si)) {
      const [a, b] = sets.slice(base, base + 2);
      if (!a || !b || !finishedEventSet(a.a, a.b) || !finishedEventSet(b.a, b.b) || (a.a > a.b) === (b.a > b.b)) {
        return "Matchtiebreak spilles kun ved 1–1 i færdige sæt.";
      }
    }
  }
  return null;
}
export function royalSetLabel(si: number) {
  return `Makker ${Math.floor(si / 3) + 1} · ${isRoyalTiebreak(si) ? "Matchtiebreak (ved 1–1)" : `Sæt ${si % 3 + 1}`}`;
}
export function validateRoyalEvent(event: { date?: string; start_time?: string; end_time?: string; location?: string; max_players?: number }) {
  const parsedDate = new Date(`${event.date}T12:00:00Z`);
  if (!Number.isFinite(parsedDate.getTime()) || !event.date || !/^\d{4}-\d{2}-\d{2}$/.test(event.date) || new Date(`${event.date}T12:00:00Z`).toISOString().slice(0, 10) !== event.date || new Date(`${event.date}T12:00:00Z`).getUTCDay() !== 1) return "Royal skal spilles en mandag.";
  if (event.location !== "Helsinge" || event.start_time?.slice(0, 5) !== "18:00" || event.end_time?.slice(0, 5) !== "20:00") return "Royal spilles i Helsinge kl. 18.00–20.00.";
  if (![4, 8, 12, 16].includes(Number(event.max_players))) return "Vælg 4, 8, 12 eller 16 spillere til de fire baner.";
  return null;
}
