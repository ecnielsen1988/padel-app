import { createClient } from "@supabase/supabase-js";
import { supabaseServiceRole } from "@/lib/supabaseServiceRole";

type LocalDevProfile = {
  id: string;
  visningsnavn: string;
  rolle?: string | null;
};

const LOCAL_DEV_BYPASS =
  process.env.NODE_ENV === "development" &&
  process.env.NEXT_PUBLIC_LOCAL_DEV_BYPASS === "true";
const LOCAL_DEV_VISNINGSNAVN =
  process.env.NEXT_PUBLIC_LOCAL_DEV_VISNINGSNAVN ?? "Emil Nielsen";

let cachedProfilePromise: Promise<LocalDevProfile | null> | null = null;

function createPublicClient() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  return createClient(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function isLocalDevBypassEnabled() {
  return LOCAL_DEV_BYPASS;
}

export async function getLocalDevProfile() {
  if (!LOCAL_DEV_BYPASS) return null;
  if (!cachedProfilePromise) {
    cachedProfilePromise = (async () => {
      const readClient =
        typeof window === "undefined" ? (supabaseServiceRole as any) : createPublicClient();
      const { data, error } = await readClient
        .from("profiles")
        .select("id, visningsnavn, rolle")
        .eq("visningsnavn", LOCAL_DEV_VISNINGSNAVN)
        .maybeSingle();

      if (error || !data?.id || !data?.visningsnavn) {
        return null;
      }

      return {
        id: String(data.id),
        visningsnavn: String(data.visningsnavn),
        rolle: data.rolle ?? null,
      } satisfies LocalDevProfile;
    })();
  }

  return cachedProfilePromise;
}

export async function getLocalDevUser() {
  const profile = await getLocalDevProfile();
  if (!profile) return null;

  return {
    id: profile.id,
    email: `${profile.visningsnavn.toLowerCase().replace(/\s+/g, ".")}@local.dev`,
    user_metadata: {
      visningsnavn: profile.visningsnavn,
      name: profile.visningsnavn,
      registered: true,
    },
    app_metadata: {
      provider: "local-dev-bypass",
    },
    aud: "authenticated",
    role: "authenticated",
  };
}

export async function getLocalDevSession() {
  const user = await getLocalDevUser();
  if (!user) return null;

  return {
    access_token: "local-dev-bypass",
    refresh_token: "local-dev-bypass",
    expires_in: 60 * 60 * 24,
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
    token_type: "bearer",
    user,
  };
}
