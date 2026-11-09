import { messagingAuth, messagingReply as reply } from '@/lib/messagingAuth';
import { pushConfigured, pushPublicKey } from '@/lib/pushServer';
export const runtime = 'nodejs';
export async function GET() {
  try {
    const access = await messagingAuth();
    if (access.response) return access.response;
    return reply({ configured: pushConfigured(), publicKey: pushPublicKey() });
  } catch { return reply({ error: 'Kunne ikke hente notifikationsopsætning.' }, 500); }
}
