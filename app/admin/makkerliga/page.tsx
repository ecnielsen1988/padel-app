"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeader, PageShell, StatusPill } from "@/app/components/ui";
import type { LeagueRoster } from "@/lib/partnerLeague";
import { copenhagenDate, PARTNER_DIVISIONS, WINTER_2027 } from "@/lib/partnerTournaments";

const endpoint = "/api/admin/makkerliga";
const labels = { paid: "Betalt", pending: "Afventer betaling", cancelled: "Annulleret" };

async function loadRoster(): Promise<LeagueRoster> {
  const response = await fetch(endpoint, { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return data;
}

export default function MakkerligaAdminPage() {
  const [roster, setRoster] = useState<LeagueRoster>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void loadRoster().then(setRoster).catch((error: Error) => setError(error.message));
  }, []);

  async function publish() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "publish" }),
      });
      if (!response.ok) throw new Error((await response.json()).error);
      setRoster(await loadRoster());
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const paid = roster?.registrations.filter((entry) => entry.status === "paid").length ?? 0;
  const pending = roster?.registrations.filter((entry) => entry.status === "pending").length ?? 0;
  const canPublish = roster?.closes_on && roster.closes_on < copenhagenDate() && paid > 0;

  return (
    <PageShell>
      <div className="mx-auto w-full max-w-4xl space-y-5">
        <Link href="/admin" className="font-semibold text-[var(--brand-strong)]">← Admin</Link>
        <PageHeader title="Makkerliga admin" description={WINTER_2027.name} />
        {error && <p role="alert" className="padel-surface">{error}</p>}
        {!roster && !error && <p role="status">Henter tilmeldinger …</p>}
        {roster && <>
          <section className="padel-surface space-y-3">
            <h2 className="text-xl font-bold">Puljer</h2>
            {roster.pools_published ? (
              <Link href="/makkerrangliste/puljer" className="padel-secondary-button inline-flex">Se offentliggjorte puljer</Link>
            ) : <>
              <p>{paid} betalte hold · {pending} afventer betaling</p>
              <p className="text-sm text-[var(--muted)]">Puljerne dannes efter tilmeldingsfristen ud fra de betalte pars samlede Elo. Hvert par møder de andre par i sin pulje én gang.</p>
              <button type="button" disabled={!canPublish || busy} onClick={() => void publish()}
                className="padel-primary-button disabled:opacity-50">
                {busy ? "Danner puljer …" : "Dan og offentliggør puljer"}
              </button>
            </>}
          </section>
          {Object.entries(PARTNER_DIVISIONS).map(([division, info]) => {
            const entries = roster.registrations.filter((entry) => entry.division === division);
            return <section key={division} className="padel-surface space-y-3">
              <h2 className="text-xl font-bold">{info.name}</h2>
              {!entries.length ? <p>Ingen tilmeldinger.</p> : (
                <ul className="divide-y divide-[var(--border)]">
                  {entries.map((entry) => <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <span className="font-semibold">{entry.names.join(" & ")}</span>
                    <StatusPill tone={entry.status === "paid" ? "success" : entry.status === "pending" ? "warning" : "neutral"}>
                      {labels[entry.status]}
                    </StatusPill>
                  </li>)}
                </ul>
              )}
            </section>;
          })}
        </>}
      </div>
    </PageShell>
  );
}
