// app/auth/callback/route.ts
import { NextResponse, NextRequest } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

function safeNext(next: string | null): string {
  return next && next.startsWith("/") ? next : "/";
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));

  if (code) {
    const supabase = createRouteHandlerClient({ cookies });
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      // valgfrit: send til login med error
      return NextResponse.redirect(new URL("/login?error=callback", url.origin));
    }
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
