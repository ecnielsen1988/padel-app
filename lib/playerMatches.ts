export type MatchMessage = { id: string; sender_id: string; body: string; created_at: string };
export type MatchSet = { a: number; b: number; partner: number };
export type PlayerMatch = {
  id: string;
  date: string;
  start_time: string;
  location: string;
  court: string;
  revision: number;
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

export function danishNow() {
  const date = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Copenhagen', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(date);
  const part = (name: string) => parts.find(p => p.type === name)?.value;
  return { date: `${part('year')}-${part('month')}-${part('day')}`, time: `${part('hour')}:${part('minute')}` };
}
