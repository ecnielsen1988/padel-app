import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { messagingAuth } from '@/lib/messagingAuth';
import { legacyPlayerColumns, legacyProgramColumns, modernPlayerColumns, programDate } from '@/lib/programPush';
import { supabaseServiceRole } from '@/lib/supabaseServiceRole';

type Row = Record<string, string | number | null>;

export default async function ProgramPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const eventId = /^event-([a-z0-9-]+)$/i.exec(key)?.[1];
  if (!eventId && !programDate(key)) notFound();

  const { db, user } = await messagingAuth();
  if (!user || !db) redirect('/login');
  const { data: profile } = await db.from('profiles').select('visningsnavn').eq('id', user.id).maybeSingle();
  const name = profile?.visningsnavn?.trim();
  const owner = name
    ? await supabaseServiceRole.from('profiles').select('id').eq('visningsnavn', name).maybeSingle<{ id: string }>()
    : null;
  if (!owner?.data || owner.data.id !== user.id) notFound();

  let date = key;
  if (eventId) {
    const { data: event } = await supabaseServiceRole.from('events').select('date,status')
      .eq('id', eventId).maybeSingle<{ date: string; status: string }>();
    if (!event || !['published', 'ongoing', 'done'].includes(event.status)) notFound();
    date = event.date;
  }

  const players = eventId ? modernPlayerColumns : legacyPlayerColumns;
  const result = eventId
    ? await supabaseServiceRole.from('event_result')
      .select(['group_index', 'set_index', 'court_label', 'start_time', 'end_time', ...players].join(','))
      .eq('event_id', eventId).order('group_index').order('set_index')
    : await supabaseServiceRole.from('event_sets').select(legacyProgramColumns)
      .eq('event_dato', key).order('kamp_nr').order('saet_nr');
  if (result.error) throw new Error('Programmet kunne ikke hentes.');

  const rows = ((result.data ?? []) as unknown as Row[])
    .filter(row => players.some(column => String(row[column] ?? '').trim() === name))
    .map(row => ({
      match: eventId ? Number(row.group_index) + 1 : row.kamp_nr,
      set: eventId ? Number(row.set_index) + 1 : row.saet_nr,
      court: eventId ? row.court_label : row.bane,
      start: String((eventId ? row.start_time : row.starttid) ?? '').slice(0, 5),
      end: String((eventId ? row.end_time : row.sluttid) ?? '').slice(0, 5),
      names: players.map(column => row[column]),
    }));
  const label = programDate(date)
    ? new Intl.DateTimeFormat('da-DK', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(date))
    : '';
  return (
    <main className="mx-auto min-h-screen max-w-xl space-y-4 p-5">
      <Link href="/startside" className="text-sm font-semibold text-pink-600">← Tilbage til forsiden</Link>
      <h1 className="text-2xl font-bold">Dine kampe{label && ` · ${label}`}</h1>
      {rows.length === 0 && <p>Der er ingen kampe til dig i dette program.</p>}
      {rows.map(row => (
        <article key={`${row.match}-${row.set}`} className="rounded-xl border border-gray-300 p-4">
          <h2 className="font-semibold">Kamp {row.match} · Sæt {row.set}{row.court && ` · Bane ${row.court}`}</h2>
          {row.start && <p>{row.start}{row.end && `–${row.end}`}</p>}
          <p>{row.names[0]} / {row.names[1]} mod {row.names[2]} / {row.names[3]}</p>
        </article>
      ))}
    </main>
  );
}
