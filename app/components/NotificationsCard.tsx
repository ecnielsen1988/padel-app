'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = typeof atob !== 'undefined' ? atob(base64) : Buffer.from(base64, 'base64').toString('binary');
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export default function NotificationsCard() {
  const [status, setStatus] = useState<'idle'|'working'|'ok'|'err'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [perm, setPerm] = useState<'default'|'granted'|'denied'|'na'>('na');
  const [standalone, setStandalone] = useState(false);
  const [registered, setRegistered] = useState(false); // subscription findes i DB?
  const [vapidOk, setVapidOk] = useState<boolean>(true);

  // Init: tjek A2HS, permission, lokal subscription + DB
  useEffect(() => {
    const isStandalone =
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      // iOS flag når åbnet fra HS
      (navigator as any).standalone === true;
    setStandalone(isStandalone);

    if (typeof Notification === 'undefined') setPerm('na');
    else setPerm(Notification.permission);

    setVapidOk(!!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);

    (async () => {
      try {
        if (!('serviceWorker' in navigator)) return;
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager.getSubscription();
        if (!sub) return;

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error } = await supabase
          .from('push_subscriptions')
          .select('endpoint')
          .eq('user_id', user.id)
          .eq('endpoint', sub.endpoint)
          .maybeSingle();

        if (!error && data) setRegistered(true);
      } catch { /* ignore */ }
    })();
  }, []);

  const canEnable = useMemo(
    () => (standalone && perm !== 'granted' && perm !== 'na'),
    [standalone, perm]
  );

  const enable = async () => {
    try {
      setError(null);
      setStatus('working');

      if (!('serviceWorker' in navigator)) throw new Error('Service Worker ikke understøttet.');
      if (typeof Notification === 'undefined') throw new Error('Notifikationer ikke tilgængelige.');
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Du skal være logget ind.');

      // registrér SW og vent
      await navigator.serviceWorker.register('/sw.js');
      const reg = await navigator.serviceWorker.ready;

      // tilladelse (kræver klik)
      const permission = await Notification.requestPermission();
      setPerm(permission);
      if (permission !== 'granted') throw new Error('Tillad notifikationer for at aktivere.');

      // eksisterende subscription, ellers opret
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string;
        if (!vapid) throw new Error('Mangler NEXT_PUBLIC_VAPID_PUBLIC_KEY (server redeploy?)');
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapid),
        });
      }

      // gem i Supabase
      const toB64 = (buf: ArrayBuffer | null) => buf ? btoa(String.fromCharCode(...new Uint8Array(buf))) : null;
      const payload = {
        user_id: user.id,
        endpoint: sub.endpoint,
        p256dh: toB64(sub.getKey('p256dh')),
        auth: toB64(sub.getKey('auth')),
      };
      const { error: upErr } = await supabase.from('push_subscriptions').upsert(payload, { onConflict: 'endpoint' });
      if (upErr) throw upErr;

      setRegistered(true);
      setStatus('ok');
    } catch (e: any) {
      console.error(e);
      setError(e?.message || String(e));
      setStatus('err');
    }
  };

  // Server-test: kalder din Next API-route som sender en ægte push
  const sendServerTest = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return alert('Log ind først');
      const res = await fetch('/api/notify-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          title: 'Server push',
          body: 'Det virker 🔔',
          url: '/beskeder'
        })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || 'Ukendt fejl');
      alert('Server-test sendt. Tjek din push!');
    } catch (e:any) {
      alert(e?.message || 'Kunne ikke sende server-test');
    }
  };

  return (
    <div className="mb-6 rounded-2xl border border-pink-200/40 bg-pink-50 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-pink-900">Notifikationer</h2>

          {!standalone && (
            <p className="mt-1 text-sm text-pink-900/80">
              For at modtage notifikationer skal appen være tilføjet til hjemmeskærmen.
              Åbn i <strong>Safari</strong> → Del → <em>Føj til hjemmeskærm</em>, og åbn herfra.
            </p>
          )}

          {standalone && perm === 'default' && (
            <p className="mt-1 text-sm text-pink-900/80">
              Tryk “Aktivér” for at få beskeder om nye beskeder, resultater og events.
            </p>
          )}

          {standalone && perm === 'denied' && (
            <p className="mt-1 text-sm text-pink-900/80">
              Du har tidligere blokeret notifikationer. Åbn Indstillinger → Notifikationer → Padelhuset og slå dem til.
            </p>
          )}

          {standalone && perm === 'granted' && (
            <p className="mt-1 text-sm text-pink-900/80">
              Tilladelse givet ✅ {registered ? 'Enheden er registreret 🔔' : 'Tryk “Aktivér” for at registrere enheden.'}
            </p>
          )}

          {!vapidOk && (
            <p className="mt-2 text-sm text-red-600">
              Mangler NEXT_PUBLIC_VAPID_PUBLIC_KEY (tilføj i Netlify og redeploy).
            </p>
          )}

          {error && <p className="mt-2 text-sm text-red-600">Fejl: {error}</p>}
        </div>

        <div className="shrink-0">
          {standalone && perm !== 'denied' && (
            <button
              onClick={enable}
              className="px-3 py-2 rounded-xl bg-pink-600 hover:bg-pink-700 text-white font-medium"
              disabled={status === 'working'}
            >
              {status === 'working' ? 'Aktiverer…' : registered ? 'Gen-registrér' : 'Aktivér'}
            </button>
          )}

          {standalone && perm === 'granted' && registered && (
            <button
              onClick={sendServerTest}
              className="ml-2 px-3 py-2 rounded-xl border border-pink-300 text-pink-700"
            >
              Server-test
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
