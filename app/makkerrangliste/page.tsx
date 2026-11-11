import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, PageShell } from "../components/ui";
import { TournamentSignup } from "./signup";

export const metadata: Metadata = { title: "Makkerliga" };

export default function PartnerTournamentPage() {
  return (
    <PageShell>
      <div className="mx-auto w-full max-w-4xl space-y-5">
        <Link href="/startside" className="inline-flex font-semibold text-[var(--brand-strong)]">
          ← Til forsiden
        </Link>
        <PageHeader
          eyebrow="Turneringstilmelding"
          title="Makkerliga"
          description="Vælg en turnering, en række og din makker. Du kan kun deltage én gang pr. turnering."
          action={<div className="rounded-2xl border border-[var(--border)] px-5 py-3">
            <p className="text-2xl font-bold">200 kr.</p>
            <p className="text-sm text-[var(--muted)]">pr. par med MobilePay</p>
          </div>}
        />
        <TournamentSignup />
      </div>
    </PageShell>
  );
}
