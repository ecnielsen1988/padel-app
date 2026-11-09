import { supabase } from '@/lib/supabaseClient';

// Unsubscribe before signing out so a shared device cannot keep receiving the
// previous player's messages. An expired DB row can be cleaned on next delivery.
export async function detachDevicePush() {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration('/sw.js');
  const subscription = await registration?.pushManager?.getSubscription();
  if (!subscription) return;
  if (!await subscription.unsubscribe()) throw new Error('Kunne ikke deaktivere notifikationer på denne enhed. Prøv igen.');
  const { data: { user } } = await supabase.auth.getUser();
  if (user) await supabase.from('push_subscriptions').delete().eq('user_id', user.id).eq('endpoint', subscription.endpoint);
}
