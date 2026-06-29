import { createClient } from "@supabase/supabase-js";

function getSupabaseServiceRoleClient() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  return createClient(supabaseUrl, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export const supabaseServiceRole = new Proxy(
  {},
  {
    get(_target, prop) {
      const client: any = getSupabaseServiceRoleClient();
      const value = client[prop as keyof typeof client];
      return typeof value === "function" ? value.bind(client) : value;
    },
  }
) as ReturnType<typeof createClient>;
