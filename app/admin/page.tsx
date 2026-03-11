'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type ProfileRow = { id: string; rolle: 'admin' | 'user' | null };

export default function AdminHomePage() {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const run = async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const user = auth?.user;
        if (!user) { setLoading(false); return; }

        // 1) Forsøg at læse rolle fra JWT app_metadata (hvis du sætter den i Edge/SSR)
        const jwtRole = ((user.app_metadata as unknown) as { rolle?: string })?.rolle;
        let admin = jwtRole === 'admin';

        // 2) Fallback: slå op i profiles
        if (!admin) {
          const { data: me } = await supabase
            .from('profiles')
            .select('id, rolle')
            .eq('id', user.id)
            .maybeSingle<ProfileRow>();

          if (me?.rolle === 'admin') admin = true;
        }

        setIsAdmin(admin);
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  if (loading) {
    return (
      <main className="max-w-2xl mx-auto p-8 text-gray-900 dark:text-white">
        <h1 className="text-3xl font-bold mb-6">Admin</h1>
        <p>Indlæser…</p>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="max-w-2xl mx-auto p-8 text-gray-900 dark:text-white">
        <h1 className="text-3xl font-bold mb-6">Admin</h1>
        <p>Du har ikke adgang til denne side.</p>
        <div className="mt-4">
          <Link
            href="/startside"
            className="inline-block bg-green-700 hover:bg-green-800 text-white font-semibold py-2 px-4 rounded-lg"
          >
            ⬅ Tilbage til startside
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-2xl mx-auto p-8 text-gray-900 dark:text-white">
      <h1 className="text-3xl font-bold mb-8 text-center">⛳ Admin</h1>

      <div className="grid gap-4">
        <Link
          href="/admin/beskeder"
          className="block bg-zinc-900 hover:bg-zinc-800 text-white font-semibold py-3 px-5 rounded-xl text-center shadow"
        >
          📬 Admin · Beskeder
        </Link>

        <Link
    href="/admin/players"
    className="block bg-pink-600 hover:bg-pink-700 text-white font-semibold py-3 px-5 rounded-xl text-center shadow"
  >
    👥 Admin · Spillere
  </Link>

        <Link
          href="/admin/event"
          className="block bg-zinc-800 hover:bg-zinc-900 text-white font-semibold py-3 px-5 rounded-xl text-center shadow"
        >
          📅 Admin · Event
        </Link>

        {/* Ret evt. stien her, hvis din side ligger på /admin/event/torsdagspadel */}
        <Link
          href="/admin/torsdagspadel"
          className="block bg-green-700 hover:bg-green-800 text-white font-semibold py-3 px-5 rounded-xl text-center shadow"
        >
          🟢 Admin · Torsdagspadel
        </Link>

        <Link
          href="/startside"
          className="block bg-zinc-200 hover:bg-zinc-300 text-zinc-900 font-semibold py-3 px-5 rounded-xl text-center shadow dark:bg-zinc-700 dark:hover:bg-zinc-600 dark:text-white"
        >
          ⬅ Tilbage til startside
        </Link>
      </div>
    </main>
  );
}

