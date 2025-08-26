import { cookies } from "next/headers";
import { createServerComponentClient, createServerActionClient } from "@supabase/auth-helpers-nextjs";
import { revalidatePath } from "next/cache";
// If you have generated types, you can import them instead of "any"
// import type { Database } from "@/lib/database.types";
import React from "react";

// OPTIONAL: If you already have this util, replace with your own
import { beregnNyRangliste } from "@/lib/beregnNyRangliste";

// --- Helpers ---
function getCopenhagenNowAsUTCDate() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Copenhagen",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return new Date(Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")));
}

function kommendeTorsdagISODate() {
  // Returnerer dato (YYYY-MM-DD) for kommende torsdag i Europe/Copenhagen
  const cphNow = getCopenhagenNowAsUTCDate();
  const dow = cphNow.getUTCDay(); // 0=Sun ... 4=Thu
  let add = (4 - dow + 7) % 7; // hvor mange dage til torsdag
  // "Kommende torsdag": hvis i dag er torsdag, så er det i dag
  // Hvis du hellere vil have NÆSTE torsdag (aldrig i dag), så brug: if (add === 0) add = 7;
  const th = new Date(Date.UTC(cphNow.getUTCFullYear(), cphNow.getUTCMonth(), cphNow.getUTCDate() + add));
  const y = th.getUTCFullYear();
  const m = String(th.getUTCMonth() + 1).padStart(2, "0");
  const d = String(th.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDaysISO(dateISO: string, days: number) {
  const [y, m, d] = dateISO.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m - 1), d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function formatTime(value: string | null) {
  if (!value) return "";
  // Understøt både "HH:MM" og timestamper. Vis kun HH:MM.
  const hhmm = value.match(/\d{2}:\d{2}/)?.[0];
  if (hhmm) return hhmm;
  try {
    const dt = new Date(value);
    const hh = String(dt.getHours()).padStart(2, "0");
    const mm = String(dt.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  } catch {
    return value;
  }
}

// --- Types (loose) ---
interface SignupRow {
  visningsnavn: string;
  kan_spille: boolean | null;
  tidligste_tid: string | null; // "HH:MM" eller timestamp
  event_dato?: string | null;
  paid?: boolean | null;
}

interface ProfileRow {
  visningsnavn: string;
}

interface EloRow {
  visningsnavn: string;
  elo: number;
}

async function togglePaidAction(formData: FormData) {
  'use server';
  const supabase = createServerActionClient<any>({ cookies });
  const visningsnavn = String(formData.get('visningsnavn') || '');
  const event_dato = String(formData.get('event_dato') || '');
  const nextPaid = String(formData.get('next_paid') || 'false') === 'true';

  if (!visningsnavn || !event_dato) return;

  // Prøv update først
  const { data: updated, error: updErr } = await supabase
    .from('event_signups')
    .update({ paid: nextPaid })
    .eq('visningsnavn', visningsnavn)
    .eq('event_dato', event_dato)
    .select('visningsnavn');

  if (updErr) {
    console.error('togglePaidAction update error', updErr);
  }

  if (!updated || updated.length === 0) {
    // Hvis ingen række fandtes: indsæt en ny (kan_spille/tidligste_tid forbliver NULL)
    const { error: insErr } = await supabase
      .from('event_signups')
      .insert({ visningsnavn, event_dato, paid: nextPaid });

    if (insErr) {
      console.error('togglePaidAction insert error', insErr);
    }
  }

  revalidatePath('/admin/tilmelding');
}

export default async function Page() {
  const supabase = createServerComponentClient<any>({ cookies });

  // (debug) vis om vi har en aktiv session lokalt – ellers kan RLS give fejl/ingen data
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) console.warn("Ingen Supabase-session fundet. Er du logget ind lokalt? RLS kan blokere læsning.");
  } catch (e) {
    console.warn("Kunne ikke aflæse session:", e);
  }

  const thursday = kommendeTorsdagISODate();

  // 1) Hent tilmeldinger for kommende torsdag
  const { data: signupsRaw, error: signupsErr } = await supabase
    .from("event_signups")
    .select("visningsnavn, event_dato, kan_spille, tidligste_tid, paid")
    .gte("event_dato", thursday)
    .lt("event_dato", addDaysISO(thursday, 1));

  if (signupsErr) {
    console.error("event_signups error", {
      message: (signupsErr as any)?.message,
      details: (signupsErr as any)?.details,
      hint: (signupsErr as any)?.hint,
      code: (signupsErr as any)?.code,
    });
  }

  const signups: SignupRow[] = signupsRaw ?? [];

  // Betalte (på tværs af alle svar for dagen)
  const totalPaid = signups.filter((s) => !!s.paid).length;
  const paidMap = new Map<string, boolean>(signups.map((s) => [s.visningsnavn, !!s.paid]));

  // 2) Hent alle med torsdagsflag (til 'ikke svaret')
  const { data: thursdayPlayersRaw, error: profErr } = await supabase
    .from("profiles")
    .select("visningsnavn")
    .eq("torsdagspadel", true);

  if (profErr) {
    console.error("profiles error", {
      message: (profErr as any)?.message,
      details: (profErr as any)?.details,
      hint: (profErr as any)?.hint,
      code: (profErr as any)?.code,
    });
  }

  const thursdayPlayers: ProfileRow[] = thursdayPlayersRaw ?? [];

  // 3) Hent nuværende Elo (brug din eksisterende funktion)
  let eloMap = new Map<string, number>();
  try {
   const rangliste: EloRow[] = await beregnNyRangliste();

    for (const r of rangliste) eloMap.set(r.visningsnavn, Math.round(r.elo ?? 0));
  } catch (e) {
    console.warn("Kunne ikke hente Elo fra beregnNyRangliste – fortsætter uden sortering", e);
  }

  // 4) Del i tre grupper
  const respondedSet = new Set(signups.filter((s) => s.kan_spille !== null).map((s) => s.visningsnavn));

  const tilmeldte = signups.filter((s) => s.kan_spille === true);
  const afbud = signups.filter((s) => s.kan_spille === false);
  const ingenSvar = thursdayPlayers
    .filter((p) => !respondedSet.has(p.visningsnavn))
    .map((p) => ({ visningsnavn: p.visningsnavn }));

  // Sortér: tilmeldte efter Elo (højeste først), de andre alfabetisk
  const byEloDesc = (a: SignupRow, b: SignupRow) => (eloMap.get(b.visningsnavn) ?? 0) - (eloMap.get(a.visningsnavn) ?? 0);
  const byName = (a: { visningsnavn: string }, b: { visningsnavn: string }) => a.visningsnavn.localeCompare(b.visningsnavn, "da");

  tilmeldte.sort(byEloDesc);
  afbud.sort(byName);
  ingenSvar.sort(byName);

  return (
    <main className="p-6 space-y-6 text-neutral-900 dark:text-neutral-100">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Tilmeldinger – Torsdag</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Dato: {thursday}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-neutral-500 dark:text-neutral-400">Betalt i alt</span>
          <span className="inline-flex items-center justify-center rounded-full px-2 py-1 text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
            {totalPaid}
          </span>
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Kolonne 1: Tilmeldte */}
        <div className="rounded-2xl border bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 shadow-sm">
          <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800">
            <h2 className="font-medium">Tilmeldte ({tilmeldte.length})</h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">Rangeret efter Elo. Starttidspunkt vises til højre. Afkryds 'Betalt' efter behov.</p>
          </div>
          <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {tilmeldte.length === 0 && (
              <li className="px-4 py-3 text-sm text-neutral-500 dark:text-neutral-400">Ingen tilmeldte endnu.</li>
            )}
            {tilmeldte.map((s) => (
              <li key={s.visningsnavn} className="px-4 py-3 flex items-center gap-3">
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium tabular-nums">{s.visningsnavn}</span>
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">Elo {eloMap.get(s.visningsnavn) ?? 0}</span>
                  </div>
                  <div className="text-xs text-neutral-500 dark:text-neutral-400">Start: {formatTime(s.tidligste_tid) || "—"}</div>
                </div>
                <form action={togglePaidAction} className="ml-auto">
                  <input type="hidden" name="visningsnavn" value={s.visningsnavn} />
                  <input type="hidden" name="event_dato" value={s.event_dato ?? thursday} />
                  <input type="hidden" name="next_paid" value={(!!s.paid ? false : true).toString()} />
                  <button type="submit" className="inline-flex items-center gap-2 text-sm">
                    <span className="inline-block w-4 h-4 rounded border border-neutral-300 dark:border-neutral-600 text-center align-middle">
                      {s.paid ? "✓" : ""}
                    </span>
                    Betalt
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </div>

        {/* Kolonne 2: Afbud */}
        <div className="rounded-2xl border bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 shadow-sm">
          <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800">
            <h2 className="font-medium">Afbud ({afbud.length})</h2>
          </div>
          <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {afbud.length === 0 && (
              <li className="px-4 py-3 text-sm text-neutral-500 dark:text-neutral-400">Ingen afbud.</li>
            )}
            {afbud.map((s) => (
              <li key={s.visningsnavn} className="px-4 py-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{s.visningsnavn}</span>
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">Elo {eloMap.get(s.visningsnavn) ?? 0}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Kolonne 3: Ingen svar */}
        <div className="rounded-2xl border bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 shadow-sm">
          <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800">
            <h2 className="font-medium">Ikke svaret ({ingenSvar.length})</h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">Alle spillere med torsdagsflag uden svar for {thursday}.</p>
          </div>
          <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {ingenSvar.length === 0 && (
              <li className="px-4 py-3 text-sm text-neutral-500 dark:text-neutral-400">Alle har svaret.</li>
            )}
            {ingenSvar.map((p) => {
              const isPaid = paidMap.get(p.visningsnavn) ?? false;
              return (
                <li key={p.visningsnavn} className="px-4 py-3 flex items-center justify-between gap-3">
                  <span className="font-medium">{p.visningsnavn}</span>
                  <form action={togglePaidAction}>
                    <input type="hidden" name="visningsnavn" value={p.visningsnavn} />
                    <input type="hidden" name="event_dato" value={thursday} />
                    <input type="hidden" name="next_paid" value={(isPaid ? false : true).toString()} />
                    <button type="submit" className="inline-flex items-center gap-2 text-sm">
                      <span className="inline-block w-4 h-4 rounded border border-neutral-300 dark:border-neutral-600 text-center align-middle">
                        {isPaid ? "✓" : ""}
                      </span>
                      Betalt
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <footer className="text-xs text-gray-400">
        <p>
          Betalingssum ovenfor tæller rækker i <code>event_signups</code> med <code>paid = true</code> for den valgte dato.
          Afkrydsninger gemmes ikke endnu – tilføj et server action/route for at opdatere <code>paid</code> i Supabase.
        </p>
      </footer>
    </main>
  );
}

