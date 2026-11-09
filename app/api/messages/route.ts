import { messagingAuth, messagingReply as reply } from '@/lib/messagingAuth';
import { sendPush } from '@/lib/pushServer';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const access = await messagingAuth();
    if (access.response) return access.response;
    const input = await req.json().catch(() => null);
    if (!input || typeof input.recipientId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.recipientId) || typeof input.body !== 'string' ||
      !input.body.trim() || input.body.trim().length > 5000 || input.recipientId === access.user!.id) {
      return reply({ error: 'Vælg en anden spiller og skriv en besked på højst 5.000 tegn.' }, 400);
    }
    const db = access.db!;
    const [{ data: sender, error: senderError }, { data: recipient, error: recipientError }] = await Promise.all([
      db.from('profiles').select('visningsnavn').eq('id', access.user!.id).maybeSingle(),
      db.from('profiles').select('visningsnavn').eq('id', input.recipientId).maybeSingle(),
    ]);
    if (senderError || recipientError) return reply({ error: 'Kunne ikke hente spillerne. Prøv igen.' }, 500);
    if (!sender?.visningsnavn || !recipient?.visningsnavn) return reply({ error: 'Spilleren mangler en profil med visningsnavn.' }, 400);
    const { data: message, error } = await db.from('beskeder').insert({
      sender_id: access.user!.id, sender_visningsnavn: sender.visningsnavn,
      recipient_id: input.recipientId, recipient_visningsnavn: recipient.visningsnavn,
      body: input.body.trim(),
    }).select('*').single();
    if (error || !message) return reply({ error: 'Beskeden blev ikke sendt. Prøv igen.' }, 500);
    const push = await sendPush(input.recipientId, {
      title: 'Ny besked', body: `${sender.visningsnavn}: ${message.body.slice(0, 180)}`,
      url: `/beskeder?with=${encodeURIComponent(access.user!.id)}`,
    });
    return reply({ ok: true, message, push });
  } catch {
    return reply({ error: 'Kunne ikke gennemføre afsendelsen. Kontrollér samtalen før du prøver igen.' }, 500);
  }
}
