import { sendPush } from '@/lib/pushServer';
import { supabaseServiceRole } from '@/lib/supabaseServiceRole';

export const modernPlayerColumns = ['holdA1', 'holdA2', 'holdB1', 'holdB2'] as const;
export const legacyPlayerColumns = ['holda1', 'holda2', 'holdb1', 'holdb2'] as const;
export const legacyProgramColumns = ['kamp_nr', 'saet_nr', 'bane', 'starttid', 'sluttid', ...legacyPlayerColumns].join(',');
type ProgramSource = { eventId: string } | { date: string };

export function programDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export async function notifyProgram(source: ProgramSource) {
  try {
    const modern = 'eventId' in source;
    const columns = modern ? modernPlayerColumns : legacyPlayerColumns;
    const { data, error } = await supabaseServiceRole.from(modern ? 'event_result' : 'event_sets')
      .select(columns.join(',')).eq(modern ? 'event_id' : 'event_dato', modern ? source.eventId : source.date);
    if (error) throw error;

    const names = [...new Set(((data ?? []) as Record<string, string | null>[])
      .flatMap(row => columns.map(column => row[column]?.trim())).filter((name): name is string => !!name))];
    if (!names.length) return { sent: 0, failed: 0 };

    const profiles = await supabaseServiceRole.from('profiles').select('id,visningsnavn').in('visningsnavn', names);
    if (profiles.error) throw profiles.error;
    const byName = new Map<string, string[]>();
    for (const { id, visningsnavn } of (profiles.data ?? []) as { id: string; visningsnavn: string }[]) {
      byName.set(visningsnavn, [...(byName.get(visningsnavn) ?? []), id]);
    }
    // Programs store display names. Skip ambiguous names rather than notifying the wrong account.
    const recipients = new Set([...byName.values()].filter(ids => ids.length === 1).flat());
    const url = modern
      ? `/program/event-${encodeURIComponent(source.eventId)}`
      : `/program/${source.date}`;
    const results = await Promise.all([...recipients].map(id => sendPush(id, {
      title: 'Dine kampe er klar 🎾',
      body: 'Programmet er udgivet. Se dine kampe og spilletider.',
      url,
    })));
    return {
      sent: results.filter(result => result.status === 'sent').length,
      failed: results.filter(result => result.status === 'failed' || result.status === 'unavailable').length,
    };
  } catch (error) {
    console.error('Program push could not be completed', error);
    return { sent: 0, failed: 1 };
  }
}
