export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

import { NextResponse } from "next/server";
import { filterCardsForPlayer, getRecentResultCards } from "@/lib/resultsFeed";
import { supabaseRoute } from "@/lib/supabaseClient";

async function getViewerName(supabase: any) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { user: null, visningsnavn: "Spiller" };
  }

  const profRes = await supabase.from("profiles").select("visningsnavn").eq("id", user.id).maybeSingle();
  const profileName = (profRes?.data?.visningsnavn ?? "").toString().trim();
  const fallbackName =
    ((user.user_metadata as any)?.visningsnavn ?? "").toString().trim() ||
    ((user.user_metadata as any)?.name ?? "").toString().trim() ||
    (user.email ? user.email.split("@")[0] : "Spiller");

  return {
    user,
    visningsnavn: profileName || fallbackName || "Spiller",
  };
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const view = url.searchParams.get("view") ?? "overview";
    const supabase = supabaseRoute();

    const [{ user, visningsnavn }, allCards] = await Promise.all([
      getViewerName(supabase),
      getRecentResultCards(supabase),
    ]);

    const latestMatches = allCards.slice(0, 50);
    const myMatches = user ? filterCardsForPlayer(allCards, visningsnavn).slice(0, 20) : [];

    if (view === "mine") {
      return NextResponse.json(
        {
          loggedIn: Boolean(user),
          visningsnavn: user ? visningsnavn : null,
          matches: myMatches,
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    if (view === "lastgames") {
      return NextResponse.json(
        {
          loggedIn: Boolean(user),
          visningsnavn,
          matches: latestMatches,
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(
      {
        loggedIn: Boolean(user),
        visningsnavn,
        myLatest: myMatches[0] ?? null,
        latestOverall: latestMatches[0] ?? null,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        loggedIn: false,
        visningsnavn: "Spiller",
        myLatest: null,
        latestOverall: null,
        matches: [],
      },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
