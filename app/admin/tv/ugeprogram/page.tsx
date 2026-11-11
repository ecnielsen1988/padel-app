import Link from "next/link";
import { messagingAdmin } from "@/lib/messagingAuth";
import { readWeekProgram } from "@/lib/tvWeekProgramServer";
import WeekProgramEditor from "./WeekProgramEditor";

export const dynamic = "force-dynamic";

export default async function AdminWeekProgramPage() {
  const access = await messagingAdmin();
  const links = (
    <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold">
      <Link href="/admin/tv" className="underline">Tilbage til TV-admin</Link>
      <Link href="/tv?visning=ugeprogram" target="_blank" className="underline">Se ugeprogram på TV</Link>
    </nav>
  );

  let program = null;
  if (!access.response) {
    try {
      program = await readWeekProgram();
    } catch (error) {
      console.error("Kunne ikke åbne TV-ugeprogram til redigering:", error);
    }
  }

  return (
    <main className="min-h-screen bg-pink-50 px-4 py-8 text-zinc-900">
      <div className="mx-auto max-w-5xl space-y-6">
        {links}
        <header>
          <h1 className="text-3xl font-bold">Ugens spil på TV</h1>
          <p className="mt-2 text-sm text-zinc-700">Spilletilbud sorteres efter ugedag og starttid. Lad begge pointfelter være tomme, hvis der ikke er en pointgrænse.</p>
        </header>
        {program ? <WeekProgramEditor initialProgram={program} /> : (
          <p role="status" className="rounded-xl bg-white p-5">
            {access.response?.status === 401 ? <Link href="/login" className="underline">Log ind for at redigere ugeprogrammet.</Link>
              : access.response ? "Kun administratorer kan redigere ugeprogrammet."
              : "Ugeprogrammet kunne ikke hentes. Genindlæs siden for at prøve igen."}
          </p>
        )}
      </div>
    </main>
  );
}
