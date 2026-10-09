import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { NO_STORE_HEADERS } from "@/lib/publicCache";

export const dynamic = "force-dynamic";

function reply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

async function requireAdmin() {
  const cookieStore = await cookies();
  // Always validate a real session, including during local development.
  // auth-helpers expects a synchronous cookie store; Next 15 resolves it above.
  const db = createRouteHandlerClient({
    cookies: (() => cookieStore) as unknown as typeof cookies,
  });
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) return { response: reply({ error: "Log ind for at fortsætte." }, 401) };
  const { data: profile, error: profileError } = await db.from("profiles").select("rolle").eq("id", user.id).maybeSingle();
  if (profileError || profile?.rolle !== "admin") return { response: reply({ error: "Kun admin har adgang." }, 403) };
  return { db };
}

export async function GET() {
  try {
    const access = await requireAdmin();
    if (access.response) return access.response;
    const players: { id: string; visningsnavn: string | null }[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await access.db!.from("profiles").select("id, visningsnavn")
        .order("id").range(offset, offset + 499);
      if (error) throw error;
      players.push(...(data ?? []));
      if (!data || data.length < 500) break;
    }
    players.sort((a, b) => (a.visningsnavn ?? "").localeCompare(b.visningsnavn ?? "", "da"));
    return reply({ players });
  } catch {
    return reply({ error: "Kunne ikke hente spillerne. Prøv igen." }, 500);
  }
}

export async function POST(req: Request) {
  try {
    const access = await requireAdmin();
    if (access.response) return access.response;
    const body = await req.json().catch(() => null);
    if (!body || typeof body.profileId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.profileId) ||
      typeof body.expectedName !== "string" || typeof body.newName !== "string" ||
      !body.newName.trim() || body.newName.trim().length > 100) {
      return reply({ error: "Vælg en spiller og skriv et navn på 1–100 tegn." }, 400);
    }
    const { data, error } = await access.db!.rpc("admin_rename_player", {
      p_profile_id: body.profileId,
      p_expected_name: body.expectedName,
      p_new_name: body.newName.trim(),
    });
    if (error) {
      const status = ({ "42501": 403, "P0002": 404, "22023": 400, "23505": 409, "40001": 409 } as Record<string, number>)[error.code];
      if (status) return reply({ error: error.message }, status);
      console.error("Spillernavn kunne ikke ændres:", error);
      return reply({ error: error.code === "PGRST202"
        ? "Navneændring er ikke aktiveret i databasen endnu. Kør database/rename_player.sql i Supabase."
        : "Navnet blev ikke ændret. Der opstod en databasefejl." }, 500);
    }
    // A cache failure must not report an already committed rename as failed.
    try {
      for (const tag of ["rangliste", "ranking-overview", "results-feed"]) revalidateTag(tag);
    } catch (error) {
      console.error("Kunne ikke rydde cache efter navneændring:", error);
    }
    return reply(data);
  } catch {
    return reply({ error: "Kunne ikke gennemføre forespørgslen. Genindlæs siden for at kontrollere navnet." }, 500);
  }
}
