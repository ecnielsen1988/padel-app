import { NextResponse } from "next/server";
import { rebuildEloDayState } from "@/lib/rebuildEloDayState";

export async function POST() {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { ok: false, error: "Missing SUPABASE_SERVICE_ROLE_KEY" },
        { status: 500 }
      );
    }

    const result = await rebuildEloDayState();

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (err: any) {
    console.error("💥 rebuildEloDayState fejlede:", err);
    return NextResponse.json(
      {
        ok: false,
        error: err?.message || String(err),
      },
      { status: 500 }
    );
  }
}

