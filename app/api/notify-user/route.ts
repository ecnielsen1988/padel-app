import { messagingAuth, messagingReply as reply } from '@/lib/messagingAuth';
import { sendPush } from '@/lib/pushServer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Legacy event notifications. Direct messages send their own server-side push.
export async function POST(req: Request) {
  try {
    const access = await messagingAuth();
    if (access.response) return access.response;
    const { data: profile, error } = await access.db!.from('profiles').select('rolle').eq('id', access.user!.id).maybeSingle();
    if (error || profile?.rolle !== 'admin') return reply({ error: 'Kun admin kan sende eventnotifikationer.' }, 403);
    const input = await req.json().catch(() => null);
    if (!input || typeof input.user_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(input.user_id) ||
      typeof input.title !== 'string' || !input.title.trim() || input.title.length > 100 ||
      typeof input.body !== 'string' || input.body.length > 500 ||
      typeof input.url !== 'string' || !/^\/event(?:[/?]|$)/.test(input.url)) {
      return reply({ error: 'Ugyldig eventnotifikation.' }, 400);
    }
    const push = await sendPush(input.user_id, { title: input.title, body: input.body, url: input.url });
    return reply({ ok: push.status === 'sent', push, error: push.status === 'sent' ? undefined : 'Notifikationen kunne ikke sendes.' });
  } catch {
    return reply({ error: 'Kunne ikke sende notifikationen.' }, 500);
  }
}
