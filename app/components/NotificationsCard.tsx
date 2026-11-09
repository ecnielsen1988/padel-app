'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

const testCompletedKey = 'padel.push-test-completed';

function decodeKey(key: string) {
  const raw = atob(key.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - key.length % 4) % 4));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export default function NotificationsCard() {
  const [supported, setSupported] = useState(false);
  const [needsInstall, setNeedsInstall] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [registered, setRegistered] = useState(false);
  const [publicKey, setPublicKey] = useState('');
  const [configured, setConfigured] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [testCompleted, setTestCompleted] = useState(false);

  useEffect(() => {
    try { setTestCompleted(localStorage.getItem(testCompletedKey) === 'true'); }
    catch { /* The test still works if browser storage is unavailable. */ }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone;
        const appleMobile = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        const install = !!appleMobile && !standalone;
        const available = window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
        if (cancelled) return;
        setNeedsInstall(install); setSupported(available);
        if (!available) return;
        setPermission(Notification.permission);
        const response = await fetch('/api/push/config', { cache: 'no-store' });
        const config = await response.json();
        if (!response.ok) throw new Error(config.error || 'Kunne ikke hente opsætningen.');
        if (cancelled) return;
        setPublicKey(config.publicKey); setConfigured(config.configured);
        const reg = await navigator.serviceWorker.getRegistration('/sw.js');
        const sub = await reg?.pushManager.getSubscription();
        const { data: { user } } = await supabase.auth.getUser();
        let saved = false;
        if (sub && user) {
          const { data, error } = await supabase.from('push_subscriptions').select('endpoint')
            .eq('user_id', user.id).eq('endpoint', sub.endpoint).maybeSingle();
          if (error) throw new Error('Kunne ikke kontrollere notifikationer. Prøv igen.');
          saved = !!data;
        }
        if (!cancelled) setRegistered(saved && Notification.permission === 'granted');
      } catch (error) {
        if (!cancelled) setError(error instanceof Error ? error.message : 'Kunne ikke kontrollere notifikationer.');
      } finally { if (!cancelled) setLoading(false); }
    }
    void check();
    const refresh = () => { if (document.visibilityState === 'visible') void check(); };
    document.addEventListener('visibilitychange', refresh);
    return () => { cancelled = true; document.removeEventListener('visibilitychange', refresh); };
  }, []);

  async function enable() {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      // Ask immediately in the click handler, before any network awaits.
      const granted = await Notification.requestPermission();
      setPermission(granted);
      if (granted !== 'granted') throw new Error('Tillad notifikationer for at aktivere.');
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Log ind for at aktivere notifikationer.');
      await navigator.serviceWorker.register('/sw.js');
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (sub?.options.applicationServerKey) {
        const expected = decodeKey(publicKey);
        const existing = new Uint8Array(sub.options.applicationServerKey);
        if (expected.length !== existing.length || expected.some((b, i) => b !== existing[i])) {
          await sub.unsubscribe(); sub = null;
        }
      }
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeKey(publicKey) });
      const keys = sub.toJSON().keys;
      if (!keys?.p256dh || !keys.auth) throw new Error('Kunne ikke oprette notifikationsabonnement.');
      const { error } = await supabase.from('push_subscriptions').upsert({
        user_id: user.id, endpoint: sub.endpoint, p256dh: keys.p256dh, auth: keys.auth,
      }, { onConflict: 'endpoint' });
      if (error) throw new Error('Kunne ikke gemme notifikationer. Prøv igen.');
      setTestCompleted(false);
      try { localStorage.removeItem(testCompletedKey); } catch { /* Storage is optional. */ }
      setRegistered(true); setNotice('Notifikationer er aktiveret på denne enhed. Prøv testknappen.');
    } catch (error) { setError(error instanceof Error ? error.message : 'Kunne ikke aktivere notifikationer.'); }
    finally { setBusy(false); }
  }

  async function disable() {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js');
      const sub = await reg?.pushManager.getSubscription();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Log ind for at ændre notifikationer.');
      if (sub) {
        const { error } = await supabase.from('push_subscriptions').delete().eq('user_id', user.id).eq('endpoint', sub.endpoint);
        if (error) throw new Error('Kunne ikke deaktivere notifikationer. Prøv igen.');
        await sub.unsubscribe();
      }
      setRegistered(false);
    } catch (error) { setError(error instanceof Error ? error.message : 'Kunne ikke deaktivere.'); }
    finally { setBusy(false); }
  }

  async function test() {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/push/test', { method: 'POST' });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || 'Testen kunne ikke sendes.');
      setTestCompleted(true);
      try { localStorage.setItem(testCompletedKey, 'true'); } catch { /* Storage is optional. */ }
      setNotice('Testen er sendt. Kontrollér, at notifikationen vises på din enhed.');
    } catch (error) { setError(error instanceof Error ? error.message : 'Testen kunne ikke sendes.'); }
    finally { setBusy(false); }
  }

  return (
    <section aria-label="Notifikationer" className="mb-4 rounded-2xl border border-pink-200 bg-pink-50 p-4 text-gray-900">
      <h2 className="font-semibold">🔔 Notifikationer</h2>
      <p className="mt-1 text-sm">
        {loading ? 'Kontrollerer notifikationer…' : needsInstall ? 'På iPhone og iPad: Åbn siden i Safari, vælg Del → Føj til hjemmeskærm, og åbn appen derfra.' :
          !supported ? 'Denne browser understøtter ikke notifikationer her. Prøv en nyere browser.' :
          permission === 'denied' ? 'Notifikationer er blokeret. Tillad dem i browserens eller enhedens indstillinger, og vend tilbage hertil.' :
          !configured ? 'Telefonnotifikationer er endnu ikke klar. Du kan stadig læse og sende beskeder her.' :
          registered ? 'Notifikationer er aktiveret på denne enhed.' : 'Få en notifikation, når du modtager en besked eller udfordring.'}
      </p>
      {!loading && supported && !needsInstall && permission !== 'denied' && configured && (
        <div className="mt-3 flex flex-wrap gap-2">
          {registered ? <>
            {!testCompleted && <button disabled={busy} onClick={test} className="rounded-xl bg-pink-600 px-3 py-2 text-sm text-white disabled:opacity-50">Send testnotifikation</button>}
            <button disabled={busy} onClick={disable} className="rounded-xl border border-pink-300 px-3 py-2 text-sm disabled:opacity-50">Deaktivér på denne enhed</button>
          </> : <button disabled={busy} onClick={enable} className="rounded-xl bg-pink-600 px-3 py-2 text-sm text-white disabled:opacity-50">{busy ? 'Aktiverer…' : 'Aktivér notifikationer'}</button>}
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="mt-2 text-sm">{notice}</p>}
    </section>
  );
}
