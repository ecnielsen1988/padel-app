export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Keep viewer responses private while allowing the shared match history cache.
import { NextResponse } from "next/server";
import { filterCardsForPlayer, getRecentResultCards } from "@/lib/resultsFeed";
import { NO_STORE_HEADERS } from "@/lib/publicCache";
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


    if (view === "mine") {
      return NextResponse.json(
        {
          loggedIn: Boolean(user),
          visningsnavn: user ? visningsnavn : null,
          matches: user ? filterCardsForPlayer(allCards, visningsnavn, 20) : [],
        },
        { headers: NO_STORE_HEADERS }
      );
    }

    if (view === "lastgames") {
      return NextResponse.json(
        {
          loggedIn: Boolean(user),
          visningsnavn,
          matches: allCards.slice(0, 50),
        },
        { headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(
      {
        loggedIn: Boolean(user),
        visningsnavn,
        myLatest: user ? filterCardsForPlayer(allCards, visningsnavn, 1)[0] ?? null : null,
        latestOverall: allCards[0] ?? null,
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error("GET /api/results-feed error", error);
    return NextResponse.json(
      {
        loggedIn: false,
        visningsnavn: "Spiller",
        myLatest: null,
        latestOverall: null,
        matches: [],
      },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
