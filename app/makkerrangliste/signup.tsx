"use client";

import { type FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { StatusPill } from "../components/ui";
import {
  PARTNER_DIVISIONS, UUID_PATTERN, type PartnerDivision,
  type PartnerRegistration, type TournamentSignupData,
} from "@/lib/partnerTournaments";

const api = "/api/makkerrangliste";
const divisions = Object.entries(PARTNER_DIVISIONS) as [PartnerDivision, typeof PARTNER_DIVISIONS[PartnerDivision]][];
const field = "w-full rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] px-3 py-2.5";
const button = "padel-primary-button inline-flex disabled:cursor-not-allowed disabled:opacity-50";

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("da-DK", {
    dateStyle: "long", timeZone: "Europe/Copenhagen",
  }).format(new Date(`${value}T12:00:00Z`));
}

async function loadSignup() {
  const response = await fetch(api, { cache: "no-store" });
  if (response.status === 401) return null;
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Tilmeldingen kunne ikke indlæses.");
  return data as TournamentSignupData;
}

async function submit(input: Record<string, unknown>) {
  const response = await fetch(api, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Handlingen kunne ikke gennemføres.");
  return data as { status?: PartnerRegistration["status"]; redirectUrl?: string; tournamentId?: string };
}

function eligibility(division: PartnerDivision, player?: string | null, partner?: string | null) {
  const a = player?.trim().toLowerCase();
  const b = partner?.trim().toLowerCase();
  if (division === "women") return a === "kvinde" && b === "kvinde";
  if (division === "mix") return (a === "kvinde" && b === "mand") || (a === "mand" && b === "kvinde");
  return true;
}

function DivisionOptions({ selected, onSelect }: {
  selected?: PartnerDivision;
  onSelect?: (value: PartnerDivision) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {divisions.map(([id, division]) => {
        const style = `block rounded-2xl border px-4 py-4 ${selected === id
          ? "border-[var(--brand)] bg-[var(--surface-strong)]"
          : "border-[var(--border)]"}`;
        const label = <>
          <span className="block text-base font-bold">{division.name}</span>
          <span className="mt-1 block text-sm text-[var(--muted)]">{division.description}</span>
        </>;
        return onSelect ? (
          <label key={id} className={`${style} cursor-pointer focus-within:outline focus-within:outline-[var(--brand)]`}>
            <input type="radio" name="division" value={id} checked={selected === id}
              onChange={() => onSelect(id)} className="float-right accent-[var(--brand)]" />
            {label}
          </label>
        ) : <div key={id} className={style}>{label}</div>;
      })}
    </div>
  );
}

export function TournamentSignup() {
  const [data, setData] = useState<TournamentSignupData | null>();
  const [tournamentId, setTournamentId] = useState("");
  const [partnerId, setPartnerId] = useState("");
  const [division, setDivision] = useState<PartnerDivision>("open");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean }>();
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let active = true;
    async function initialize() {
      try {
        const current = await loadSignup();
        if (!active) return;
        setData(current);
        const id = new URLSearchParams(window.location.search).get("betaling");
        if (!id || !UUID_PATTERN.test(id) || !current?.paymentAvailable) return;
        const entry = current.registrations.find((item) => item.id === id);
        if (entry) setTournamentId(entry.tournament_id);
        if (entry?.status === "paid") return;
        setBusy(true);
        try {
          let result: Awaited<ReturnType<typeof submit>> | undefined;
          for (const delay of [5000, 2000, 2000, 2000, 2000]) {
            await new Promise((resolve) => setTimeout(resolve, delay));
            if (!active) return;
            result = await submit({ action: "status", id });
            if (!active) return;
            if (result.tournamentId) setTournamentId(result.tournamentId);
            if (result.status !== "pending") break;
          }
          const updated = await loadSignup();
          if (!active) return;
          setData(updated);
          if (result?.status === "cancelled") setMessage({ text: "Betalingen blev afbrudt eller udløb." });
        } catch (error) {
          if (active) setMessage({ text: (error as Error).message, error: true });
        } finally {
          if (active) setBusy(false);
        }
      } catch (error) {
        if (active) setLoadError((error as Error).message);
      }
    }
    void initialize();
    return () => { active = false; };
  }, []);

  async function act(input: Record<string, unknown>, form?: HTMLFormElement) {
    setBusy(true);
    setMessage(undefined);
    let redirecting = false;
    try {
      const result = await submit(input);
      if (result.redirectUrl) {
        window.location.assign(result.redirectUrl);
        redirecting = true;
        return;
      }
      if (result.status === "cancelled") {
        setMessage({ text: "Betalingen blev afbrudt eller udløb. I kan tilmelde jer igen, hvis fristen stadig er åben." });
      }
      if (result.status === "pending") setMessage({ text: "MobilePay afventer stadig betaling." });
      if (input.action === "createTournament") {
        form?.reset();
        setMessage({ text: "Turneringen er oprettet og kan vælges på tilmeldingssiden." });
      }
    } catch (error) {
      setMessage({ text: (error as Error).message, error: true });
    } finally {
      if (!redirecting) {
        try {
          setData(await loadSignup());
        } catch (error) {
          setMessage({ text: (error as Error).message, error: true });
        } finally {
          setBusy(false);
        }
      }
    }
  }

  if (!data) {
    return (
      <section className="padel-surface space-y-4">
        <h2 className="text-xl font-bold">Rækker</h2>
        <DivisionOptions />
        {data === null ? (
          <Link href="/login?makkerrangliste=1" className={button}>Log ind for at tilmelde jer</Link>
        ) : loadError ? (
          <p role="alert">{loadError} <button type="button" className="underline" onClick={() => location.reload()}>Prøv igen</button></p>
        ) : <p role="status">Indlæser turneringer …</p>}
      </section>
    );
  }

  const tournament = data.tournaments.find((item) => item.id === tournamentId) ?? data.tournaments[0];
  const entry = data.registrations.find((item) => item.tournament_id === tournament?.id);
  const player = data.players.find((item) => item.id === data.userId);
  const partners = data.players.filter((item) => item.id !== data.userId && eligibility(division, player?.koen, item.koen));
  const otherPlayerId = entry?.payer_id === data.userId ? entry?.partner_id : entry?.payer_id;
  const partnerName = data.players.find((item) => item.id === otherPlayerId)?.visningsnavn;

  function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tournament || !partnerId || !data?.paymentAvailable) return;
    setTournamentId(tournament.id);
    void act({ action: "register", tournamentId: tournament.id, partnerId, division });
  }

  function createTournament(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    void act({ action: "createTournament", ...Object.fromEntries(new FormData(form)) }, form);
  }

  return (
    <>
      <section className="padel-surface space-y-5">
        <h2 className="text-xl font-bold">Tilmelding</h2>
        {data.preview && (
          <p className="text-sm text-[var(--muted)]">
            Admin-forhåndsvisning med eksempeldata. Du kan prøve rækken og makkervalget.
          </p>
        )}
        {data.testPayments && <StatusPill tone="warning">MobilePay-testmiljø</StatusPill>}
        {message && <p role={message.error ? "alert" : "status"} className={message.error ? "font-semibold text-[var(--brand-strong)]" : ""}>{message.text}</p>}
        {!tournament ? (
          <>
            <p>Der er ingen åbne turneringer lige nu.</p>
            <DivisionOptions />
          </>
        ) : (
          <>
            <label className="block space-y-1.5">
              <span className="text-sm font-semibold">Turnering</span>
              <select className={field} value={tournament.id} disabled={busy} onChange={(event) => {
                setTournamentId(event.target.value);
                setPartnerId("");
                setDivision("open");
                setMessage(undefined);
              }}>
                {data.tournaments.map((item) => <option key={item.id} value={item.id}>{item.name} · {dateLabel(item.play_date)}</option>)}
              </select>
            </label>
            <p className="text-sm text-[var(--muted)]">Tilmeldingsfrist {dateLabel(tournament.closes_on)}</p>
            {entry ? (
              <div className="space-y-3 rounded-2xl border border-[var(--border)] p-4">
                <StatusPill tone={entry.status === "paid" ? "success" : "warning"}>
                  {entry.status === "paid" ? "Tilmeldt og betalt" : "Afventer betaling"}
                </StatusPill>
                <p>{PARTNER_DIVISIONS[entry.division].name}{partnerName && ` med ${partnerName}`}</p>
                {entry.status === "pending" && (
                  <div className="flex flex-wrap gap-2">
                    {entry.payer_id === data.userId ? (
                      <button type="button" className={button} disabled={busy || !data.paymentAvailable}
                        onClick={() => void act({ action: "resume", id: entry.id })}>Fortsæt til MobilePay</button>
                    ) : <p className="w-full text-sm">Din makker står for betalingen.</p>}
                    <button type="button" className="padel-secondary-button inline-flex disabled:opacity-50" disabled={busy || !data.paymentAvailable}
                      onClick={() => void act({ action: "status", id: entry.id })}>Tjek betaling</button>
                  </div>
                )}
              </div>
            ) : tournament.open ? (
              <form onSubmit={register} className="space-y-5">
                <fieldset className="space-y-2" disabled={busy}>
                  <legend className="text-sm font-semibold">Række</legend>
                  <DivisionOptions selected={division} onSelect={(value) => { setDivision(value); setPartnerId(""); }} />
                </fieldset>
                <label className="block space-y-1.5">
                  <span className="text-sm font-semibold">Makker</span>
                  <select className={field} value={partnerId} onChange={(event) => setPartnerId(event.target.value)} required disabled={busy || !partners.length}>
                    <option value="">{partners.length ? "Vælg din makker" : "Ingen makkere tilgængelige i denne række"}</option>
                    {partners.map((item) => <option key={item.id} value={item.id}>{item.visningsnavn}</option>)}
                  </select>
                </label>
                <button type="submit" className={button} disabled={busy || !partnerId || !data.paymentAvailable}>
                  {busy ? "Vent et øjeblik …" : "Betal 200 kr. med MobilePay"}
                </button>
              </form>
            ) : <p>Tilmeldingen er lukket.</p>}
            {!data.paymentAvailable && entry?.status !== "paid" && <p role="status" className="text-sm">MobilePay er endnu ikke tilgængelig.</p>}
          </>
        )}
      </section>
      {data.admin && !data.preview && (
        <section className="padel-surface space-y-4">
          <h2 className="text-xl font-bold">Opret en turnering</h2>
          <form onSubmit={createTournament} className="space-y-4">
            <label className="block space-y-1.5">
              <span className="text-sm font-semibold">Turneringsnavn</span>
              <input className={field} name="name" required maxLength={100} />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1.5">
                <span className="text-sm font-semibold">Spilledato</span>
                <input className={field} type="date" name="play_date" required />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-semibold">Sidste tilmeldingsdag</span>
                <input className={field} type="date" name="closes_on" required />
              </label>
            </div>
            <button type="submit" className={button} disabled={busy}>Opret turnering</button>
          </form>
        </section>
      )}
    </>
  );
}
