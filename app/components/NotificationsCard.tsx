'use client';

import { useEffect, useMemo, useState } from 'react';

export default function NotificationsCard() {
  const [status, setStatus] = useState<'idle'|'working'|'ok'|'err'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [perm, setPerm] = useState<'default'|'granted'|'denied'|'na'>('na');
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    const isStandalone =
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      // iOS-specifikt flag
      (navigator as any).standalone === true;
    setStandalone(isStandalone);

    if (typeof Notification === 'undefined') {
      setPerm('na');
    } else {
      setPerm(Notification.permission);
    }
  }, []);

  const canEnable = useMemo(
    () => (standalone && perm !== 'granted' && perm !== 'na'),
    [standalone, perm]
  );

  const enable = async () => {
    try {
      setError(null);
      setStatus('working');

      if (!('serviceWorker' in navigator)) {
        throw new Error('Service Worker er ikke understøttet i denne browser.');
      }
      if (typeof Notification === 'undefined') {
        throw new Error('Notifikationer er ikke tilgængelige på denne platform.');
      }

      await navigator.serviceWorker.register('/sw.js');
      const reg = await navigator.serviceWorker.ready;

      const permission = await Notification.requestPermission();
      setPerm(permission);
      if (permission !== 'granted') {
        throw new Error('Du skal tillade notifikationer for at aktivere dem.');
      }

      // Valgfrit: lille lokal test for at bekræfte (kan kommenteres ud)
      await reg.showNotification('Notifikationer aktiveret', {
        body: 'Du får nu beskeder fra Padelhuset 🎉',
        data: { url: '/' }
      });

      setStatus('ok');
    } catch (e: any) {
      console.error(e);
      setError(e?.message || String(e));
      setStatus('err');
    }
  };

  // Kun i udvikling: lille test-knap
  const sendTest = async () => {
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification('Padel – test', {
        body: 'Testen virker 🎉',
        data: { url: '/' }
      });
    } catch {}
  };

  return (
    <div className="mb-6 rounded-2xl border border-pink-200/40 bg-pink-50 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-pink-900">Notifikationer</h2>

          {!standalone && (
            <p className="mt-1 text-sm text-pink-900/80">
              For at modtage notifikationer skal appen være tilføjet til hjemmeskærmen.
              Åbn siden i <strong>Safari</strong> → Del → <em>Føj til hjemmeskærm</em>, og åbne herfra.
            </p>
          )}

          {standalone && perm === 'default' && (
            <p className="mt-1 text-sm text-pink-900/80">
              Tryk “Aktivér notifikationer” for at få beskeder om nye resultater, events og direkte beskeder.
            </p>
          )}

          {standalone && perm === 'denied' && (
            <p className="mt-1 text-sm text-pink-900/80">
              Du har tidligere blokeret notifikationer. Åbn Indstillinger → Notifikationer → Padelhuset og slå dem til.
            </p>
          )}

          {standalone && perm === 'granted' && (
            <p className="mt-1 text-sm text-pink-900/80">
              Notifikationer er aktiveret ✅
            </p>
          )}

          {error && (
            <p className="mt-2 text-sm text-red-600">Fejl: {error}</p>
          )}
        </div>

        <div className="shrink-0">
          {canEnable && (
            <button
              onClick={enable}
              className="px-3 py-2 rounded-xl bg-pink-600 hover:bg-pink-700 text-white font-medium"
              disabled={status === 'working'}
            >
              {status === 'working' ? 'Aktiverer…' : 'Aktivér'}
            </button>
          )}
          {standalone && perm === 'granted' && process.env.NODE_ENV !== 'production' && (
            <button
              onClick={sendTest}
              className="ml-2 px-3 py-2 rounded-xl border border-pink-300 text-pink-700"
            >
              Send test
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
