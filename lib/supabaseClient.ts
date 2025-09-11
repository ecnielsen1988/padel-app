// lib/supabaseClient.ts
'use client';

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

// Én delt klient til ALLE client components / sider.
// (Brug denne i filer med `use client` øverst)
export const supabase = createClientComponentClient();

