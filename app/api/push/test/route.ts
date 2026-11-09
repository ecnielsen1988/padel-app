import { messagingAuth, messagingReply as reply } from '@/lib/messagingAuth';
import { sendPush } from '@/lib/pushServer';

export const runtime = 'nodejs';
export async function POST() {
  try {
    const access = await messagingAuth();
    if (access.response) return access.response;
    const push = await sendPush(access.user!.id, {
      title: 'Notifikationer virker 🎾', body: 'Du kan nu modtage beskeder fra Padelhuset.', url: '/beskeder',
    });
    const errors = { unavailable: 'Notifikationer er ikke sat op endnu.', no_subscription: 'Aktivér notifikationer først.', failed: 'Testen kunne ikke sendes. Prøv igen.' };
    return reply({ ok: push.status === 'sent', push, error: push.status === 'sent' ? undefined : errors[push.status] });
  } catch { return reply({ error: 'Kunne ikke sende testnotifikationen.' }, 500); }
}
