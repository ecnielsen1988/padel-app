// lib/supabaseClient.ts
// Bemærk: ingen "use client" her og ingen import af next/headers i top-level.

import {
  createClientComponentClient,
  createServerComponentClient,
  createRouteHandlerClient,
} from "@supabase/auth-helpers-nextjs";
import {
  getLocalDevSession,
  getLocalDevUser,
  isLocalDevBypassEnabled,
} from "@/lib/localDevBypass";
import { supabaseServiceRole } from "@/lib/supabaseServiceRole";
// import type { Database } from "./supabase.types" // valgfrit

function getClient() {
  if (typeof window === "undefined") {
    if (isLocalDevBypassEnabled()) {
      return supabaseServiceRole as any;
    }
    // Kun på serveren: lazy require så det ikke ryger i client bundlen
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { cookies } = require("next/headers");
    return createServerComponentClient/*<Database>*/({ cookies });
  }
  // I browseren
  return createClientComponentClient/*<Database>*/();
}

function createBypassAuth(baseAuth: any) {
  return new Proxy(baseAuth ?? {}, {
    get(target, prop) {
      if (prop === "getSession") {
        return async () => ({
          data: { session: await getLocalDevSession() },
          error: null,
        });
      }
      if (prop === "getUser") {
        return async () => ({
          data: { user: await getLocalDevUser() },
          error: null,
        });
      }
      if (prop === "onAuthStateChange") {
        return (callback: (event: string, session: any) => void) => {
          Promise.resolve(getLocalDevSession()).then((session) => {
            callback("SIGNED_IN", session);
          });
          return {
            data: {
              subscription: {
                unsubscribe() {},
              },
            },
          };
        };
      }
      if (prop === "signOut") {
        return async () => ({ error: null });
      }

      const value = target?.[prop as keyof typeof target];
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

// Exportér et proxy-objekt der forwarder til den rigtige klient ved runtime.
// Så kan eksisterende kode fortsætte med: supabase.from(...), supabase.auth, osv.
export const supabase = new Proxy(
  {},
  {
    get(_target, prop) {
      const client: any = getClient();
      if (prop === "auth" && isLocalDevBypassEnabled()) {
        return createBypassAuth(client.auth);
      }
      const value = client[prop as keyof typeof client];
      return typeof value === "function" ? value.bind(client) : value;
    },
  }
) as ReturnType<typeof createClientComponentClient>;

// (Valgfrit) dedikeret helper til route handlers (app/api/*):
export const supabaseRoute = () => {
  if (isLocalDevBypassEnabled()) {
    return new Proxy(supabaseServiceRole as any, {
      get(target, prop) {
        if (prop === "auth") {
          return createBypassAuth(target.auth);
        }
        const value = target[prop as keyof typeof target];
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { cookies } = require("next/headers");
  return createRouteHandlerClient/*<Database>*/({ cookies });
};
