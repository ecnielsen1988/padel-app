// app/api/groupmessage/send/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  const { title, body, kind } = (await req.json()) as {
    title: string;
    body: string;
    kind: "weekly" | "monthly" | "custom";
  };

  if (!title || !body || !kind) {
    return NextResponse.json({ ok: false, error: "Mangler title/body/kind" }, { status: 400 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // (Valgfrit) hent aktuelt admins navn via dit auth-setup. Her bruger vi "System".
  const created_by_visningsnavn = "System";

  const { error } = await supabase.from("group_messages").insert({
    created_by_visningsnavn,
    audience: "torsdagspadel",
    kind,
    title,
    body, // markdown
  });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

