// app/api/groupmessage/list/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY! // kun læsning; sørg for RLS så kun torsdagsfolk ser dem
  );

  const { data, error } = await supabase
    .from("group_messages")
    .select("*")
    .eq("audience", "torsdagspadel")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, messages: data });
}
