"use client";

import { useEffect } from "react";
import { supabase } from "../lib/supabaseClient";

export function SupabaseListener() {
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session) {
        console.log("✅ Supabase-session aktiveret efter reset-link");
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return null;
}
