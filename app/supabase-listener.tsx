'use client';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

export function SupabaseListener() {
  useEffect(() => {
    // Start auto-refresh når appen kører
    supabase.auth.startAutoRefresh();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      // Debug (kan kommenteres ud):
      // console.log('[auth]', event, !!session);
      // NB: INGEN signOut her!
    });

    return () => {
      // Ryd pænt op når komponenten unmountes
      subscription.unsubscribe();
      supabase.auth.stopAutoRefresh();
    };
  }, []);

  return null;
}

