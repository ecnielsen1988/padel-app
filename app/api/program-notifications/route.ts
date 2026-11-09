import { messagingAdmin, messagingReply as reply } from '@/lib/messagingAuth';
import { notifyProgram, programDate } from '@/lib/programPush';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const access = await messagingAdmin();
  if (access.response) return access.response;
  const input = await req.json().catch(() => null);
  if (!programDate(input?.date)) return reply({ error: 'Ugyldig programdato.' }, 400);
  return reply(await notifyProgram({ date: input.date }));
}
