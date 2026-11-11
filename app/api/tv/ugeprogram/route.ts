import { NextResponse } from "next/server";
import { messagingAdmin } from "@/lib/messagingAuth";
import { NO_STORE_HEADERS } from "@/lib/publicCache";
import { parseWeekProgram, type WeekSession } from "@/lib/tvWeekProgram";
import { readWeekProgram, saveWeekProgram } from "@/lib/tvWeekProgramServer";

export const dynamic = "force-dynamic";

function reply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

export async function GET() {
  try {
    return reply({
      program: await readWeekProgram(),
      version: process.env.NEXT_PUBLIC_TV_VERSION,
    });
  } catch (error) {
    console.error("Kunne ikke hente TV-ugeprogrammet:", error);
    return reply({ error: "Kunne ikke hente ugeprogrammet." }, 500);
  }
}

export async function PUT(request: Request) {
  const access = await messagingAdmin();
  if (access.response) return access.response;

  let program: WeekSession[];
  try {
    const body = await request.json();
    program = parseWeekProgram(body?.program);
  } catch (error) {
    return reply({ error: error instanceof SyntaxError ? "Ugyldigt ugeprogram." : (error as Error).message }, 400);
  }

  try {
    await saveWeekProgram(program);
    return reply({ program });
  } catch (error) {
    console.error("Kunne ikke gemme TV-ugeprogrammet:", error);
    return reply({ error: "Ugeprogrammet kunne ikke gemmes. Prøv igen." }, 500);
  }
}
