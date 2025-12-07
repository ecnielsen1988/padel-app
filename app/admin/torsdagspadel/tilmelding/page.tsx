// app/admin/tilmelding/page.tsx

export const revalidate = 0;
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const runtime = "nodejs";

import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { revalidatePath } from "next/cache";
import React from "react";
import { beregnNyRangliste } from "@/lib/beregnNyRangliste";
import { redirect } from "next/navigation";

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
  return new Date(
    Date.UTC(
      get("year"),
      get("month") - 1,
      get("day"),
      get("hour"),
      get("minute"),
      get("second")
    )
  );
}

function kommendeTorsdagISODate() {
  // Returnerer dato (YYYY-MM-DD) for kommende torsdag i Europe/Copenhagen
  const cphNow = getCopenhagenNowAsUTCDate();
  const dow = cphNow.getUTCDay(); // 0=Sun ... 4=Thu
  const add = (4 - dow + 7) % 7; // hvor mange dage til torsdag (0 hvis i dag er torsdag)
  const th = new Date(
    Date.UTC(
      cphNow.getUTCFullYear(),
      cphNow.getUTCMonth(),
      cphNow.getUTCDate() + add
    )
  );
  const y = th.getUTCFullYear();
  const m = String(th.getUTCMonth() + 1).padStart(2, "0");
  const d = String(th.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatTime(value: string | null) {
  if (!value) return "";
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

// Normaliser tid til "HH:MM" til brug i bane-gruppering
function normalizeHHMM(value: string | null): string | null {
  if (!value) return null;
  const hhmm = value.match(/\d{2}:\d{2}/)?.[0];
  if (hhmm) return hhmm;
  try {
    const dt = new Date(value);
    if (isNaN(dt.getTime())) return null;
    const hh = String(dt.getHours()).padStart(2, "0");
    const mm = String(dt.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
  } catch {
    return null;
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

// --- Actions ---
// Bruger createServerComponentClient i actions for at undgå cookies-bug
async function togglePaidAction(formData: FormData) {
  "use server";
  const supabase = createServerComponentClient<any>({ cookies });
  const visningsnavn = String(formData.get("visningsnavn") || "");
  const event_dato = String(formData.get("event_dato") || "");
  const nextPaid = String(formData.get("next_paid") || "false") === "true";
  if (!visningsnavn || !event_dato) return;

  const { data: updated, error: updErr } = await supabase
    .from("event_signups")
    .update({ paid: nextPaid })
    .eq("visningsnavn", visningsnavn)
    .eq("event_dato", event_dato)
    .select("visningsnavn");

  if (updErr) console.error("togglePaidAction update error", updErr);

  if (!updated || updated.length === 0) {
    const { error: insErr } = await supabase
      .from("event_signups")
      .insert({ visningsnavn, event_dato, paid: nextPaid });
    if (insErr) console.error("togglePaidAction insert error", insErr);
  }

  revalidatePath("/admin/tilmelding");
}

// Admin kan tilmelde/afmelde en spiller + sætte tid
async function adminSetSignupAction(formData: FormData) {
  "use server";
  const supabase = createServerComponentClient<any>({ cookies });

  const visningsnavn = String(formData.get("visningsnavn") || "");
  const event_dato = String(formData.get("event_dato") || "");
  const action = String(formData.get("action") || ""); // 'tilmeld' | 'afbud'
  const hhmmRaw = (formData.get("tidligste_tid") || "") as string;

  if (!visningsnavn || !event_dato) return;

  // Normaliser HH:MM (tillad tom => null)
  const hhmm = (() => {
    const m = hhmmRaw.match(/^\d{2}:\d{2}$/);
    return m ? m[0] : null;
  })();

  const patch: Record<string, any> = {
    kan_spille: action === "tilmeld" ? true : false,
    tidligste_tid: action === "tilmeld" ? hhmm ?? null : null,
  };

  // Forsøg update først (bevarer evt. paid)
  const { data: updated, error: updErr } = await supabase
    .from("event_signups")
    .update(patch)
    .eq("visningsnavn", visningsnavn)
    .eq("event_dato", event_dato)
    .select("visningsnavn");

  if (updErr) console.error("adminSetSignupAction update error", updErr);

  if (!updated || updated.length === 0) {
    const { error: insErr } = await supabase
      .from("event_signups")
      .insert({ visningsnavn, event_dato, ...patch });
    if (insErr) console.error("adminSetSignupAction insert error", insErr);
  }

  revalidatePath("/admin/tilmelding");
}

export default async function Page() {
  const supabase = createServerComponentClient<any>({ cookies });

  const ADMIN_PATH = "/admin/tilmelding";

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    redirect(`/login?next=${ADMIN_PATH}`);
  }

  // Session-id til debug
  let sessionUserId: string | undefined;
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    sessionUserId = session?.user?.id;
  } catch (e) {
    console.warn("Kunne ikke aflæse session:", e);
  }

  const thursday = kommendeTorsdagISODate();

  // 1) Hent tilmeldinger for kommende torsdag
  const { data: signupsRaw, error: signupsErr } = await supabase
    .from("event_signups")
    .select("visningsnavn, event_dato, kan_spille, tidligste_tid, paid")
    .eq("event_dato", thursday);

  if (signupsErr) {
    console.error("event_signups error", {
      message: (signupsErr as any)?.message,
      details: (signupsErr as any)?.details,
      hint: (signupsErr as any)?.hint,
      code: (signupsErr as any)?.code,
    });
  }

  const signups: SignupRow[] = signupsRaw ?? [];

  // Betaling (samme dag)
  const totalPaid = signups.filter((s) => !!s.paid).length;
  const paidMap = new Map<string, boolean>(
    signups.map((s) => [s.visningsnavn, !!s.paid])
  );

  // 2) Spillere med torsdags-flag
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

  // 3) Elo map (uændret brug af beregnNyRangliste)
  let eloMap = new Map<string, number>();
  try {
    const rangliste: EloRow[] = await beregnNyRangliste();
    for (const r of rangliste)
      eloMap.set(r.visningsnavn, Math.round(r.elo ?? 0));
  } catch (e) {
    console.warn(
      "Kunne ikke hente Elo fra beregnNyRangliste – fortsætter uden sortering",
      e
    );
  }

  // 4) Grupper
  const respondedSet = new Set(
    signups.filter((s) => s.kan_spille !== null).map((s) => s.visningsnavn)
  );
  const tilmeldte = signups.filter((s) => s.kan_spille === true);
  const afbud = signups.filter((s) => s.kan_spille === false);
  const ingenSvar = thursdayPlayers
    .filter((p) => !respondedSet.has(p.visningsnavn))
    .map((p) => ({ visningsnavn: p.visningsnavn }));

  // Sortering
  const byEloDesc = (a: SignupRow, b: SignupRow) =>
    (eloMap.get(b.visningsnavn) ?? 0) - (eloMap.get(a.visningsnavn) ?? 0);
  const byName = (a: { visningsnavn: string }, b: { visningsnavn: string }) =>
    a.visningsnavn.localeCompare(b.visningsnavn, "da");
  tilmeldte.sort(byEloDesc);
  afbud.sort(byName);
  ingenSvar.sort(byName);

  // Faste valide starttider
const timeOptions: string[] = [
  "17:00",
  "17:30",
  "18:40",
  "20:20",
];

  // --- Bane-gruppering (tilmeldte) ---
  type CourtGroup = {
    courtIndex: number; // 0-baseret
    players: SignupRow[];
    courtTime: string | null; // fælles tid for banen (seneste af spillernes tidligste_tid)
  };

  const courtGroups: CourtGroup[] = [];
  for (let i = 0; i < tilmeldte.length; i += 4) {
    const group = tilmeldte.slice(i, i + 4);
    if (group.length === 0) continue;

    // Find seneste tid blandt spillerne
    let latestMinutes: number | null = null;
    let latestHHMM: string | null = null;

    for (const p of group) {
      const hhmm = normalizeHHMM(p.tidligste_tid);
      if (!hhmm) continue;
      const [hh, mm] = hhmm.split(":").map((v) => Number(v));
      const totalMin = hh * 60 + mm;
      if (latestMinutes === null || totalMin > latestMinutes) {
        latestMinutes = totalMin;
        latestHHMM = hhmm;
      }
    }

    courtGroups.push({
      courtIndex: courtGroups.length,
      players: group,
      courtTime: latestHHMM,
    });
  }

  return (
    <main className="p-6 space-y-6 text-neutral-900 dark:text-neutral-100">
      {!sessionUserId && (
        <div className="rounded-md bg-amber-100 text-amber-800 px-3 py-2 text-sm">
          Ingen server-session fundet – hvis RLS kræver login, kan listerne
          være tomme (du kan stadig være logget ind i browseren).
        </div>
      )}

      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Tilmeldinger – Torsdag</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Dato: {thursday}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-neutral-500 dark:text-neutral-400">
            Betalt i alt
          </span>
          <span className="inline-flex items-center justify-center rounded-full px-2 py-1 text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
            {totalPaid}
          </span>
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Kolonne 1: Tilmeldte (banevis + frameld) */}
        <div className="rounded-2xl border bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 shadow-sm">
          <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800">
            <h2 className="font-medium">
              Tilmeldte ({tilmeldte.length}) – banevis
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Spillere er delt op i baner á 4 efter Elo. Starttid for banen er
              seneste tid, hvor alle 4 kan.
            </p>
          </div>

          {courtGroups.length === 0 ? (
            <div className="px-4 py-3 text-sm text-neutral-500 dark:text-neutral-400">
              Ingen tilmeldte endnu.
            </div>
          ) : (
            <div>
              {courtGroups.map((court) => (
                <div
                  key={court.courtIndex}
                  className="border-b border-neutral-200 dark:border-neutral-800 last:border-b-0"
                >
                  <div className="px-4 py-2 flex items-center justify-between bg-neutral-50 dark:bg-neutral-900/60">
                    <div className="font-medium">
                      Bane {court.courtIndex + 1}
                    </div>
                    <div className="text-xs text-neutral-600 dark:text-neutral-400">
                      Starttid:{" "}
                      {court.courtTime ? court.courtTime : "— ingen tider valgt"}
                    </div>
                  </div>
                  <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
                    {court.players.map((s) => (
                      <li
                        key={s.visningsnavn}
                        className="px-4 py-3 flex items-center gap-3"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium tabular-nums truncate">
                              {s.visningsnavn}
                            </span>
                            <span className="text-xs text-neutral-500 dark:text-neutral-400">
                              Elo {eloMap.get(s.visningsnavn) ?? 0}
                            </span>
                          </div>
                          <div className="text-xs text-neutral-500 dark:text-neutral-400">
                            Egen tidligste start:{" "}
                            {formatTime(s.tidligste_tid) || "—"}
                          </div>
                        </div>

                        {/* Betalt toggle */}
                        <form action={togglePaidAction} className="flex items-center gap-2">
                          <input
                            type="hidden"
                            name="visningsnavn"
                            value={s.visningsnavn}
                          />
                          <input
                            type="hidden"
                            name="event_dato"
                            value={s.event_dato ?? thursday}
                          />
                          <input
                            type="hidden"
                            name="next_paid"
                            value={(!!s.paid ? false : true).toString()}
                          />
                          <button
                            type="submit"
                            className="inline-flex items-center gap-1 text-xs"
                          >
                            <span className="inline-block w-4 h-4 rounded border border-neutral-300 dark:border-neutral-600 text-center align-middle">
                              {s.paid ? "✓" : ""}
                            </span>
                            Betalt
                          </button>
                        </form>

                        {/* Afmeld (afbud) */}
                        <form action={adminSetSignupAction}>
                          <input
                            type="hidden"
                            name="visningsnavn"
                            value={s.visningsnavn}
                          />
                          <input
                            type="hidden"
                            name="event_dato"
                            value={s.event_dato ?? thursday}
                          />
                          <input type="hidden" name="tidligste_tid" value="" />
                          <button
                            type="submit"
                            name="action"
                            value="afbud"
                            className="ml-2 rounded-md bg-rose-600 hover:bg-rose-700 text-white text-xs px-3 py-1"
                            title="Marker som afbud"
                          >
                            Afbud
                          </button>
                        </form>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Kolonne 2: Afbud (med mulighed for at tilmelde igen) */}
        <div className="rounded-2xl border bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 shadow-sm">
          <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800">
            <h2 className="font-medium">Afbud ({afbud.length})</h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Her kan du tilmelde spillere igen og vælge deres tidligste
              starttid.
            </p>
          </div>
          <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {afbud.length === 0 && (
              <li className="px-4 py-3 text-sm text-neutral-500 dark:text-neutral-400">
                Ingen afbud.
              </li>
            )}
            {afbud.map((s) => (
              <li key={s.visningsnavn} className="px-4 py-3 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{s.visningsnavn}</span>
                  <span className="text-xs text-neutral-500 dark:text-neutral-400">
                    Elo {eloMap.get(s.visningsnavn) ?? 0}
                  </span>
                </div>
                <form
                  action={adminSetSignupAction}
                  className="flex items-center gap-2"
                >
                  <input
                    type="hidden"
                    name="visningsnavn"
                    value={s.visningsnavn}
                  />
                  <input
                    type="hidden"
                    name="event_dato"
                    value={s.event_dato ?? thursday}
                  />
                  <label className="text-xs text-neutral-500 dark:text-neutral-400">
                    Tidligste start:
                    <select
                      name="tidligste_tid"
                      className="ml-2 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-sm"
                      defaultValue=""
                    >
                      <option value="">— vælg tid —</option>
                      {timeOptions.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="submit"
                    name="action"
                    value="tilmeld"
                    className="ml-auto rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3 py-1"
                    title="Tilmeld spilleren igen"
                  >
                    Tilmeld
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </div>

        {/* Kolonne 3: Ingen svar (som før, med admin-svar) */}
        <div className="rounded-2xl border bg-white dark:bg-neutral-900 border-neutral-200 dark:border-neutral-800 shadow-sm">
          <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800">
            <h2 className="font-medium">Ikke svaret ({ingenSvar.length})</h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Alle spillere med torsdagsflag uden svar for {thursday}.
            </p>
          </div>
          <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {ingenSvar.length === 0 && (
              <li className="px-4 py-3 text-sm text-neutral-500 dark:text-neutral-400">
                Alle har svaret.
              </li>
            )}
            {ingenSvar.map((p) => {
              const isPaid = paidMap.get(p.visningsnavn) ?? false;
              return (
                <li key={p.visningsnavn} className="px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">{p.visningsnavn}</span>

                    {/* Betalt toggle */}
                    <form action={togglePaidAction} className="shrink-0">
                      <input
                        type="hidden"
                        name="visningsnavn"
                        value={p.visningsnavn}
                      />
                      <input type="hidden" name="event_dato" value={thursday} />
                      <input
                        type="hidden"
                        name="next_paid"
                        value={(isPaid ? false : true).toString()}
                      />
                      <button
                        type="submit"
                        className="inline-flex items-center gap-2 text-sm"
                      >
                        <span className="inline-block w-4 h-4 rounded border border-neutral-300 dark:border-neutral-600 text-center align-middle">
                          {isPaid ? "✓" : ""}
                        </span>
                        Betalt
                      </button>
                    </form>
                  </div>

                  {/* Admin-svar: tilmeld/afbud */}
                  <form
                    action={adminSetSignupAction}
                    className="flex items-center gap-2"
                  >
                    <input
                      type="hidden"
                      name="visningsnavn"
                      value={p.visningsnavn}
                    />
                    <input type="hidden" name="event_dato" value={thursday} />

                    <label className="text-xs text-neutral-500 dark:text-neutral-400">
                      Tidligste start:
                      <select
                        name="tidligste_tid"
                        className="ml-2 rounded-md border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 px-2 py-1 text-sm"
                        defaultValue=""
                      >
                        <option value="">— vælg tid —</option>
                        {timeOptions.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="ml-auto flex items-center gap-2">
                      <button
                        type="submit"
                        name="action"
                        value="tilmeld"
                        className="rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-sm px-3 py-1"
                        title="Tilmeld spilleren med valgt tid"
                      >
                        Tilmeld
                      </button>
                      <button
                        type="submit"
                        name="action"
                        value="afbud"
                        className="rounded-md bg-rose-600 hover:bg-rose-700 text-white text-sm px-3 py-1"
                        title="Marker spilleren som afbud"
                      >
                        Afbud
                      </button>
                    </div>
                  </form>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <footer className="text-xs text-gray-400">
        <p>
          Betalingssum tæller rækker i <code>event_signups</code> med{" "}
          <code>paid = true</code> for {thursday}. Afkrydsninger gemmes via
          server actions ovenfor.
        </p>
      </footer>
    </main>
  );
}

