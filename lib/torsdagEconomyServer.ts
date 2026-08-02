import { supabaseRoute } from "@/lib/supabaseClient";
import { supabaseServiceRole } from "@/lib/supabaseServiceRole";

type ProfileRow = {
  id: string;
  visningsnavn: string | null;
  torsdagspadel: boolean | null;
  rolle?: string | null;
};

export async function getCurrentProfile() {
  const authClient = supabaseRoute();
  const { data: auth } = await authClient.auth.getUser();
  const user = auth?.user;
  if (!user) return null;

  const profResp = await (supabaseServiceRole.from("profiles") as any)
    .select("id, visningsnavn, torsdagspadel, rolle")
    .eq("id", user.id)
    .maybeSingle();

  return (profResp?.data ?? null) as ProfileRow | null;
}

export async function getTorsdagPlayers() {
  const playersResp = await (supabaseServiceRole.from("profiles") as any)
    .select("id, visningsnavn")
    .eq("torsdagspadel", true)
    .order("visningsnavn", { ascending: true });

  const rows = (playersResp?.data ?? []) as Array<{ id: string; visningsnavn?: string | null }>;
  return rows
    .map((row) => ({
      id: row.id,
      visningsnavn: String(row.visningsnavn ?? "").trim(),
    }))
    .filter((row) => row.visningsnavn.length > 0);
}

export async function ensureAdminProfile() {
  const profile = await getCurrentProfile();
  if (!profile) return { error: "Ikke logget ind", status: 401 as const };
  if (profile.rolle !== "admin") return { error: "Ingen adgang", status: 403 as const };
  return { profile };
}

