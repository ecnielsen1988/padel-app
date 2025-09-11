// lib/supabaseClient.ts
// Bemærk: ingen "use client" her og ingen import af next/headers i top-level.

import {
  createClientComponentClient,
  createServerComponentClient,
  createRouteHandlerClient,
} from "@supabase/auth-helpers-nextjs";
// import type { Database } from "./supabase.types" // valgfrit

function getClient() {
  if (typeof window === "undefined") {
    // Kun på serveren: lazy require så det ikke ryger i client bundlen
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { cookies } = require("next/headers");
    return createServerComponentClient/*<Database>*/({ cookies });
  }
  // I browseren
  return createClientComponentClient/*<Database>*/();
}

// Exportér et proxy-objekt der forwarder til den rigtige klient ved runtime.
// Så kan eksisterende kode fortsætte med: supabase.from(...), supabase.auth, osv.
export const supabase = new Proxy(
  {},
  {
    get(_target, prop) {
      const client: any = getClient();
      const value = client[prop as keyof typeof client];
      return typeof value === "function" ? value.bind(client) : value;
    },
  }
) as ReturnType<typeof createClientComponentClient>;

// (Valgfrit) dedikeret helper til route handlers (app/api/*):
export const supabaseRoute = () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { cookies } = require("next/headers");
  return createRouteHandlerClient/*<Database>*/({ cookies });
};

