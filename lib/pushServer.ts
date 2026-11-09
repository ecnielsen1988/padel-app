import * as webpush from 'web-push';
import { supabaseServiceRole } from '@/lib/supabaseServiceRole';

export type PushResult = { status: 'sent' | 'unavailable' | 'failed' | 'no_subscription'; sent: number; failed: number };
export function pushPublicKey() {
  return process.env.VAPID_PUBLIC || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
}
export function pushConfigured() {
  return !!(pushPublicKey() && process.env.VAPID_PRIVATE);
}

export async function sendPush(userId: string, payload: { title: string; body: string; url: string }): Promise<PushResult> {
  if (!pushConfigured()) return { status: 'unavailable', sent: 0, failed: 0 };
  try {
    webpush.setVapidDetails(process.env.VAPID_MAILTO || 'mailto:info@padelhuset.dk', pushPublicKey(), process.env.VAPID_PRIVATE!);
    const { data, error } = await supabaseServiceRole.from('push_subscriptions')
      .select('endpoint, p256dh, auth').eq('user_id', userId);
    if (error) throw error;
    if (!data?.length) return { status: 'no_subscription', sent: 0, failed: 0 };
    const subscriptions = data as { endpoint: string; p256dh: string; auth: string }[];
    const outcomes = await Promise.all(subscriptions.map(async (sub) => {
      try {
        const endpoint = new URL(sub.endpoint);
        const allowed = ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'];
        if (endpoint.protocol !== 'https:' || endpoint.port || endpoint.username || endpoint.password ||
          !(allowed.includes(endpoint.hostname) || endpoint.hostname.endsWith('.notify.windows.com'))) {
          return false;
        }
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), { TTL: 3600, timeout: 8000 });
        return true;
      } catch (error) {
        const code = (error as { statusCode?: number }).statusCode;
        // A 403 can indicate a key problem; only remove expired endpoints.
        if (code === 404 || code === 410) {
          await supabaseServiceRole.from('push_subscriptions').delete().eq('endpoint', sub.endpoint).eq('user_id', userId);
        }
        console.error('Push delivery failed', { statusCode: code });
        return false;
      }
    }));
    const sent = outcomes.filter(Boolean).length;
    return { status: sent ? 'sent' : 'failed', sent, failed: outcomes.length - sent };
  } catch {
    console.error('Push delivery could not be completed');
    return { status: 'failed', sent: 0, failed: 1 };
  }
}
