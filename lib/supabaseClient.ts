// lib/supabaseClient.ts
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  // Brug miljøvariabler i stedet for hardkodede værdier
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      persistSession: true,          // gem session i localStorage
      autoRefreshToken: true,        // forny access token automatisk
      flowType: 'pkce',
      // kun i browser (undgå SSR-fejl)
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    },
  }
);

