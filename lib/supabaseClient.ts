// lib/supabaseClient.ts
'use client'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

// Én delt klient til alle client components
export const supabase = createClientComponentClient()

