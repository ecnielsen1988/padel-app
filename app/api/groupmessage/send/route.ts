import { messagingAdmin, messagingReply as reply } from '@/lib/messagingAuth';
import { supabaseServiceRole } from '@/lib/supabaseServiceRole';

export async function POST(req: Request) {
  try {
    const access = await messagingAdmin();
    if (access.response) return access.response;
    const input = await req.json().catch(() => null);
    if (!input || typeof input.title !== 'string' || !input.title.trim() || input.title.length > 200 ||
      typeof input.body !== 'string' || !input.body.trim() || input.body.length > 10000 ||
      !['weekly', 'monthly', 'custom'].includes(input.kind)) return reply({ error: 'Udfyld titel og besked, og vælg en gyldig type.' }, 400);
    const { error } = await (supabaseServiceRole.from('group_messages') as any).insert({
      created_by_visningsnavn: access.profile?.visningsnavn || 'Admin',
      audience: 'torsdagspadel', kind: input.kind, title: input.title.trim(), body: input.body.trim(),
    });
    if (error) return reply({ error: 'Kunne ikke gemme fællesbeskeden.' }, 500);
    return reply({ ok: true });
  } catch { return reply({ error: 'Kunne ikke gemme fællesbeskeden.' }, 500); }
}
