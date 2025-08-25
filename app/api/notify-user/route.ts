// Kør denne route i Node-runtime (ikke Edge), ellers fejler web-push
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import * as webpush from 'web-push'; // ⬅️ CJS-kompatibel import
import { createClient } from '@supabase/supabase-js';

const VAPID_MAILTO = process.env.VAPID_MAILTO ?? 'mailto:info@padelhuset.dk';
const VAPID_PUBLIC = process.env.VAPID_PUBLIC!;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE!;

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

webpush.setVapidDetails(VAPID_MAILTO, VAPID_PUBLIC, VAPID_PRIVATE);

// Service-role klient (server only)
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export async function POST(req: NextRequest) {
  try {
    const { user_id, title, body, url } = await req.json();

    if (!user_id) {
      return NextResponse.json({ ok: false, error: 'Missing user_id' }, { status: 400 });
    }

    const { data: subs, error } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', user_id);

    if (error) throw error;

    await Promise.all((subs ?? []).map(async (s: any) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title: title ?? 'Padel', body: body ?? '', url: url ?? '/' })
        );
      } catch (err: any) {
        const code = String(err?.statusCode || '');
        if (code.startsWith('4')) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
        } else {
          console.error('webpush error', err);
        }
      }
    }));

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ ok: false, error: e?.message || 'unknown' }, { status: 500 });
  }
}
