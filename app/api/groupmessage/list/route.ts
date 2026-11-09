import { messagingAuth, messagingReply as reply } from '@/lib/messagingAuth';
import { supabaseServiceRole } from '@/lib/supabaseServiceRole';

export async function GET() {
  try {
    const access = await messagingAuth();
    if (access.response) return access.response;
    const { data: profile, error } = await access.db!.from('profiles').select('rolle, torsdagspadel').eq('id', access.user!.id).maybeSingle();
    if (error || (!profile?.torsdagspadel && profile?.rolle !== 'admin')) return reply({ error: 'Kun torsdagsspillere og admin har adgang.' }, 403);
    const { data, error: listError } = await supabaseServiceRole.from('group_messages').select('*')
      .eq('audience', 'torsdagspadel').order('created_at', { ascending: false }).limit(50);
    if (listError) return reply({ error: 'Kunne ikke hente fællesbeskeder.' }, 500);
    return reply({ ok: true, messages: data });
  } catch { return reply({ error: 'Kunne ikke hente fællesbeskeder.' }, 500); }
}
