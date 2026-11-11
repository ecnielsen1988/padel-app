export type MatchMessage = { id: string; sender_id: string; body: string; created_at: string };
export type MatchSet = { a: number; b: number; partner: number };
export type PlayerMatch = {
  id: string;
  created_by: string;
  date: string | null;
  start_time: string | null;
  location: string | null;
  court: string | null;
  league_pool_id?: string | null;
  revision: number;
  confirmed_at: string | null;
  players: { id: string; name: string }[];
  last_message: MatchMessage | null;
  unread: number;
  messages: MatchMessage[] | null;
  result_kampid: number | null;
  result_sets: MatchSet[] | null;
};

export type MatchDetails = { date: string; time: string; location: string; court: string };

export const isMatchId = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export class MatchRequestError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}

export async function matchRequest<T>(path = '', input?: Record<string, unknown>): Promise<T> {
  const response = await fetch('/api/kampe' + path, input ? {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  } : { cache: 'no-store' });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new MatchRequestError(result.error || 'Noget gik galt. Prøv igen.', response.status);
  return result;
}

export const matchDate = (date: string) => new Intl.DateTimeFormat('da-DK', {
  weekday: 'short', day: 'numeric', month: 'long', timeZone: 'UTC',
}).format(new Date(date + 'T12:00:00Z'));

export function danishNow(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Copenhagen', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(date);
  const part = (name: string) => parts.find(p => p.type === name)?.value;
  return { date: `${part('year')}-${part('month')}-${part('day')}`, time: `${part('hour')}:${part('minute')}` };
}

export function matchTimeLabel(match: Pick<PlayerMatch, 'date' | 'start_time'>) {
  return match.date && match.start_time ? `${matchDate(match.date)} kl. ${match.start_time.slice(0, 5)}` : 'Tidspunkt afventer';
}

export const matchCourts = {
  Helsinge: ['Center Court', '1', '2', '3'],
  Gilleleje: ['1', '2', '3', '5', '6'],
} as const;

export function courtsForMatch(location: string): readonly string[] {
  return Object.hasOwn(matchCourts, location) ? matchCourts[location as keyof typeof matchCourts] : [];
}

export function matchCourtLabel(court: string) {
  return /^\d+$/.test(court) ? `Bane ${court}` : court;
}

export function matchHourOptions() {
  return Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);
}

export type MatchSetDraft = { a: number; b: number; order: number[] };

export function swapMatchPlayer(order: number[], slot: number, player: number) {
  const other = order.indexOf(player);
  if (other < 0 || other === slot) return order;
  const next = [...order];
  [next[slot], next[other]] = [next[other], next[slot]];
  return next;
}

export function encodeMatchSet({ a, b, order }: MatchSetDraft): MatchSet {
  // The stored format names the team containing player 1 as team A.
  const first = order.indexOf(1);
  const partner = order[first ^ 1];
  return first < 2 ? { a, b, partner } : { a: b, b: a, partner };
}

export function compareMatchTime(a: Pick<PlayerMatch, 'date' | 'start_time' | 'id'>, b: Pick<PlayerMatch, 'date' | 'start_time' | 'id'>) {
  return (a.date ?? '9999-12-31').localeCompare(b.date ?? '9999-12-31') || (a.start_time ?? '').localeCompare(b.start_time ?? '') || a.id.localeCompare(b.id);
}
