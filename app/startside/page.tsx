'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import Link from 'next/link';

type Bruger = {
  visningsnavn: string;
  rolle: string;
  torsdagspadel: boolean;
};

export default function StartSide() {
  const [bruger, setBruger] = useState<Bruger | null>(null);
  const [loading, setLoading] = useState(true);
  const [ulæsteDM, setUlæsteDM] = useState<number>(0);
  const [ulæsteAdmin, setUlæsteAdmin] = useState<number>(0);

  // ⬇️ Notifikations-test state + handler
const [notifStatus, setNotifStatus] = useState<'idle'|'working'|'ok'|'err'>('idle');
const [notifError, setNotifError] = useState<string | null>(null);

const sendTestNotifikation = async () => {
  setNotifError(null);
  try {
    setNotifStatus('working');

    if (!('serviceWorker' in navigator)) {
      setNotifError('Denne browser understøtter ikke Service Workers.');
      setNotifStatus('err');
      return;
    }
    if (typeof Notification === 'undefined') {
      setNotifError('Notification-API er ikke tilgængelig her.');
      setNotifStatus('err');
      return;
    }

    // 1) Registrér SW (og vent derefter på at den er klar/aktiv)
    await navigator.serviceWorker.register('/sw.js');
    const reg = await navigator.serviceWorker.ready;

    // 2) Tjek at showNotification findes (Safari/iOS kræver dette)
    if (!('showNotification' in reg)) {
      setNotifError('showNotification er ikke tilgængelig på denne platform.');
      setNotifStatus('err');
      return;
    }

    // 3) Bed om tilladelse (skal ske efter klik)
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      setNotifError('Du skal tillade notifikationer for at teste.');
      setNotifStatus('err');
      return;
    }

    // 4) Vis notifikation (lokal test, ingen backend)
    await reg.showNotification('Padel – test', {
      body: 'Hvis du kan se denne, virker notifikationer 🎉',
      // icon: '/icons/maskable-192.png', // valgfri
      data: { url: '/' },
    });

    setNotifStatus('ok');
  } catch (e: any) {
    console.error(e);
    setNotifError(e?.message || String(e));
    setNotifStatus('err');
  }
};


  useEffect(() => {
    let mounted = true;

    const hentAlt = async () => {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) console.error('Fejl ved hentning af session:', sessionError);

      const user = session?.user;
      if (!user) {
        if (mounted) {
          setBruger(null);
          setUlæsteDM(0);
          setUlæsteAdmin(0);
          setLoading(false);
        }
        return;
      }

      const { data: profile, error: profErr } = await supabase
        .from('profiles')
        .select('visningsnavn, rolle, torsdagspadel')
        .eq('id', user.id)
        .maybeSingle();

      if (profErr) {
        console.error('Fejl ved hentning af profil:', profErr);
        if (mounted) {
          setBruger(null);
          setLoading(false);
        }
        return;
      }

      const rolle = profile?.rolle ?? 'ukendt';
      const profil: Bruger = {
        visningsnavn: profile?.visningsnavn ?? 'Ukendt',
        rolle,
        torsdagspadel: !!profile?.torsdagspadel,
      };

      if (mounted) setBruger(profil);

      const { count: dmCount, error: dmErr } = await supabase
        .from('beskeder')
        .select('*', { count: 'exact', head: true })
        .eq('recipient_id', user.id)
        .is('read_at', null);

      if (dmErr) {
        console.error('Fejl ved hentning af ulæste DM:', dmErr);
      } else if (mounted) {
        setUlæsteDM(dmCount ?? 0);
      }

      if (rolle === 'admin') {
        const { count: adminCount, error: adminErr } = await supabase
          .from('admin_messages')
          .select('*', { count: 'exact', head: true })
          .eq('læst', false);

        if (adminErr) {
          console.error('Fejl ved hentning af admin-beskeder:', adminErr);
        } else if (mounted) {
          setUlæsteAdmin(adminCount ?? 0);
        }
      } else if (mounted) {
        setUlæsteAdmin(0);
      }

      if (mounted) setLoading(false);
    };

    hentAlt();

    const channel = supabase
      .channel('beskeder-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'beskeder' },
        (payload) => {
          const newRow: any = payload.new;
          supabase.auth.getUser().then(({ data }) => {
            const me = data.user?.id;
            if (me && newRow?.recipient_id === me && !newRow?.read_at) {
              setUlæsteDM((c) => c + 1);
            }
          });
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const logUd = async () => {
    await supabase.auth.signOut();
    setBruger(null);
    setUlæsteDM(0);
    setUlæsteAdmin(0);
  };

  if (loading) {
    return (
      <div className="p-8 max-w-xl mx-auto text-center">
        <p className="text-lg">⏳ Indlæser...</p>
      </div>
    );
  }

  if (!bruger) {
    return (
      <div className="p-8 max-w-xl mx-auto text-center">
        <h1 className="text-2xl font-bold mb-4">Du er ikke logget ind</h1>
        <p className="mb-6">Log ind for at få adgang til padelsystemet.</p>
        <Link
          href="/login"
          className="inline-block bg-pink-600 hover:bg-pink-700 text-white font-semibold py-3 px-6 rounded-xl shadow"
        >
          Log ind
        </Link>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-xl mx-auto">
      

      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">
            Velkommen, {bruger.visningsnavn} 👋
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Din rolle:{' '}
            <span
              className={
                bruger.rolle === 'admin'
                  ? 'text-yellow-400 font-bold'
                  : bruger.rolle === 'bruger'
                  ? 'text-green-400 font-bold'
                  : 'text-red-400 font-bold'
              }
            >
              {bruger.rolle}
            </span>
          </p>
        </div>
        <button
          onClick={logUd}
          className="bg-gray-800 hover:bg-gray-900 text-white font-semibold py-2 px-4 rounded-xl shadow"
        >
          Log ud
        </button>
      </div>

{/* Test-notifikation (trin 2) */}
<div className="mb-6">
  <button
    onClick={sendTestNotifikation}
    className="px-4 py-2 rounded-xl bg-pink-600 hover:bg-pink-700 text-white font-semibold shadow"
  >
    {notifStatus === 'working'
      ? 'Tester…'
      : notifStatus === 'ok'
      ? 'Test sendt ✅'
      : 'Send test-notifikation 🔔'}
  </button>
  <p className="mt-2 text-sm text-gray-400">
    Tryk på knappen og vælg <em>Tillad</em>. Testen virker kun når appen er åbnet fra hjemmeskærmen.
  </p>
</div>
{notifError && (
  <p className="mt-2 text-sm text-red-500">
    Fejl: {notifError}
  </p>
)}



      {/* Knap-grid */}
<div className="grid gap-4">
  {(bruger.rolle === 'bruger' || bruger.rolle === 'admin') && (
    <>
      {/* 💬 Beskeder – guld-bjælke lige over Indtast Resultater */}
      <Link
        href="/beskeder"
        className="rounded-2xl bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 text-black font-semibold py-3 px-5 shadow text-center"
      >
        <span className="inline-flex items-center gap-2 justify-center">
          💬 Beskeder
          {ulæsteDM > 0 && (
            <span className="bg-red-600 text-white text-xs font-bold px-2 py-1 rounded-full">
              {ulæsteDM}
            </span>
          )}
        </span>
      </Link>

      <Link
        href="/newscore"
        className="bg-pink-600 hover:bg-pink-700 text-white font-semibold py-3 px-5 rounded-xl text-center shadow"
      >
        ➕ Indtast Resultater
      </Link>

      <Link
        href="/mine"
        className="bg-pink-600 hover:bg-pink-700 text-white font-semibold py-3 px-5 rounded-xl text-center shadow"
      >
        🧾 Mine resultater
      </Link>

      <Link
        href="/lastgames"
        className="bg-pink-600 hover:bg-pink-700 text-white font-semibold py-3 px-5 rounded-xl text-center shadow"
      >
        🕓 Seneste Kampe
      </Link>

      <Link
        href="/nyrangliste"
        className="bg-pink-600 hover:bg-pink-700 text-white font-semibold py-3 px-5 rounded-xl text-center shadow"
      >
        📊 Ranglisten
      </Link>

      <Link
        href="/monthly"
        className="bg-pink-600 hover:bg-pink-700 text-white font-semibold py-3 px-5 rounded-xl text-center shadow"
      >
        🌟 Månedens Spiller
      </Link>

      <Link
        href="/active"
        className="bg-pink-600 hover:bg-pink-700 text-white font-semibold py-3 px-5 rounded-xl text-center shadow"
      >
        🏃‍♂️ Mest aktive
      </Link>

      <Link
        href="/kommende"
        className="bg-pink-600 hover:bg-pink-700 text-white font-semibold py-3 px-5 rounded-xl text-center shadow"
      >
        📅 Kommende kampe
      </Link>

      {bruger.torsdagspadel && (
        <Link
          href="/torsdagspadel"
          className="bg-green-700 hover:bg-green-800 text-white font-semibold py-3 px-5 rounded-xl text-center shadow"
        >
          🏋️‍♂️ Torsdagspadel 🏋️‍♂️
        </Link>
      )}
    </>
  )}

  {bruger.rolle === 'admin' && (
    <>
      <Link
        href="/admin"
        className="bg-gray-800 hover:bg-gray-900 text-white font-semibold py-3 px-5 rounded-xl text-center shadow"
      >
        🛠 Adminpanel
      </Link>

      <Link
        href="/admin/beskeder"
        className="bg-yellow-500 hover:bg-yellow-600 text-black font-semibold py-3 px-5 rounded-xl text-center shadow flex items-center justify-center gap-2"
      >
        🔔 Admin-beskeder
        {ulæsteAdmin > 0 && (
          <span className="bg-red-600 text-white text-xs font-bold px-2 py-1 rounded-full">
            {ulæsteAdmin}
          </span>
        )}
      </Link>
    </>
  )}
</div>
    </div>
  );
}

