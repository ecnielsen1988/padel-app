import { revalidateTag } from 'next/cache';
import { messagingAuth, messagingReply as reply } from '@/lib/messagingAuth';
import { courtsForMatch, isMatchId } from '@/lib/playerMatches';
import { supabaseServiceRole } from '@/lib/supabaseServiceRole';
import { sendPush } from '@/lib/pushServer';

export const runtime = 'nodejs';

function failure(error: { code?: string; message?: string }) {
  const codes: Record<string, number> = { '42501': 403, P0002: 404, '22023': 400, '22007': 400, '22008': 400, '40001': 409 };
  if (error.code === 'PGRST202') return reply({ error: 'Kampfunktionen er endnu ikke aktiveret.' }, 503);
  if (error.code && codes[error.code]) return reply({ error: error.message || 'Kampen kunne ikke gemmes.' }, codes[error.code]);
  console.error('Player match request failed', { code: error.code });
  return reply({ error: 'Kampfunktionen kunne ikke indlæses eller gemmes. Prøv igen.' }, 500);
}

export async function GET(request: Request) {
  try {
    const access = await messagingAuth();
    if (access.response) return access.response;
    const id = new URL(request.url).searchParams.get('id');
    if (id !== null && !isMatchId(id)) return reply({ error: 'Ugyldig kamp.' }, 400);
    const { data, error } = await (supabaseServiceRole as any).rpc('player_matches_for', { p_actor: access.user.id, p_id: id });
    if (error) return failure(error);
    if (id && !data?.length) return reply({ error: 'Kampen blev ikke fundet.' }, 404);
    return reply({ matches: data ?? [], meId: access.user.id });
  } catch { return failure({}); }
}

export async function POST(request: Request) {
  try {
    const access = await messagingAuth();
    if (access.response) return access.response;
    const body = await request.json().catch(() => null);
    if (!body || !['create', 'update', 'message', 'result', 'read', 'confirm'].includes(body.action) ||
      (body.action !== 'create' && !isMatchId(body.id))) return reply({ error: 'Ugyldig kamphandling.' }, 400);
    let input: Record<string, unknown> = {};
    if (body.action === 'create' || body.action === 'update') {
      if (typeof body.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.date) ||
        typeof body.time !== 'string' || !/^([01]\d|2[0-3]):00$/.test(body.time) ||
        typeof body.location !== 'string' || typeof body.court !== 'string' || !courtsForMatch(body.location).includes(body.court)) {
        return reply({ error: 'Vælg dato, et helt klokkeslæt, sted og bane.' }, 400);
      }
      input = { date: body.date, time: body.time, location: body.location.trim(), court: body.court.trim() };
    }
    if (body.action === 'create') {
      if (!Array.isArray(body.players) || body.players.length !== 4 || !body.players.every(isMatchId) ||
        new Set(body.players).size !== 4 || !body.players.includes(access.user.id)) {
        return reply({ error: 'Vælg fire forskellige spillere, inklusive dig selv.' }, 400);
      }
      input.players = body.players;
    }
    if (body.action === 'update' || body.action === 'result' || body.action === 'confirm') {
      if (!Number.isSafeInteger(body.revision) || body.revision < 1) return reply({ error: 'Hent aftalen igen, før du gemmer.' }, 400);
      input.revision = body.revision;
    }
    if (body.action === 'message') {
      if (typeof body.body !== 'string' || !body.body.trim() || body.body.trim().length > 5000) return reply({ error: 'Skriv en besked på højst 5.000 tegn.' }, 400);
      input.body = body.body.trim();
    }
    if (body.action === 'read') {
      if (typeof body.through !== 'string' || body.through.length > 40 || !Number.isFinite(Date.parse(body.through))) {
        return reply({ error: 'Ugyldigt læsetidspunkt.' }, 400);
      }
      input.through = body.through;
    }
    if (body.action === 'result') {
      if (!Array.isArray(body.sets) || body.sets.length < 1 || body.sets.length > 12 ||
        !body.sets.every((s: any) => s && [s.a, s.b].every(n => Number.isInteger(n) && n >= 0 && n <= 7)
          && (s.a || s.b) && [2, 3, 4].includes(s.partner))) {
        return reply({ error: 'Indtast mindst ét sæt med en gyldig score.' }, 400);
      }
      input.sets = body.sets.map(({ a, b, partner }: any) => ({ a, b, partner }));
    }

    const { data, error } = await (supabaseServiceRole as any).rpc('player_match_action', {
      p_actor: access.user.id, p_action: body.action, p_id: body.action === 'create' ? null : body.id, p_input: input,
    });
    if (error) return failure(error);
    if (body.action === 'result') {
      try { for (const tag of ['rangliste', 'ranking-overview', 'results-feed']) revalidateTag(tag); }
      catch (error) { console.warn('Match result cache revalidation failed', error); }
    }
    if (data?.note && Array.isArray(data.players)) {
      const title = body.action === 'create' ? 'Ny kampaftale 🎾' : body.action === 'update' ? 'Kampaftalen er ændret'
        : body.action === 'confirm' ? 'Kampen er bekræftet' : body.action === 'result' ? 'Kampresultat indberettet' : 'Ny besked i din kamp';
      await Promise.allSettled(data.players.filter((id: string) => id !== access.user.id).map((id: string) =>
        sendPush(id, { title, body: data.note.slice(0, 180), url: `/kampe/${data.id}#samtale` })));
    }
    return reply({ id: data.id, resultKampid: data.result_kampid });
  } catch { return failure({}); }
}
