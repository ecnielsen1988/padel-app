import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export function messagingReply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

// Require a real session, including during local development with bypass.
export async function messagingAuth() {
  const cookieStore = await cookies();
  const db = createRouteHandlerClient({ cookies: (() => cookieStore) as unknown as typeof cookies });
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) return { response: messagingReply({ error: 'Log ind for at fortsætte.' }, 401) };
  return { db, user };
}

export async function messagingAdmin() {
  const access = await messagingAuth();
  if (access.response) return access;
  const { data: profile, error } = await access.db!.from('profiles').select('rolle, visningsnavn').eq('id', access.user!.id).maybeSingle();
  if (error || profile?.rolle !== 'admin') return { response: messagingReply({ error: 'Kun admin har adgang.' }, 403) };
  return { ...access, profile };
}
