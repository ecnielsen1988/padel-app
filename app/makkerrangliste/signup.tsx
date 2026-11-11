"use client";

import { type FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import Select from "react-select";
import { StatusPill } from "../components/ui";
import {
  isWoman, PARTNER_DIVISIONS, UUID_PATTERN, type PartnerDivision,
  type PartnerRegistration, type TournamentSignupData,
} from "@/lib/partnerTournaments";

const api = "/api/makkerrangliste";
const divisions = Object.entries(PARTNER_DIVISIONS) as [PartnerDivision, typeof PARTNER_DIVISIONS[PartnerDivision]][];
const button = "padel-primary-button inline-flex disabled:cursor-not-allowed disabled:opacity-50";

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
  return data as { status?: PartnerRegistration["status"]; redirectUrl?: string };
}

function eligibility(division: PartnerDivision, player?: string | null, partner?: string | null) {
  const a = player?.trim().toLowerCase();
  const b = partner?.trim().toLowerCase();
  if (division === "women") return a === "kvinde" && b === "kvinde";
  if (division === "mix") return (a === "kvinde" && b === "mand") || (a === "mand" && b === "kvinde");
  return true;
}

function DivisionOptions({ selected, onSelect, showWomen = false }: {
  selected?: PartnerDivision;
  onSelect?: (value: PartnerDivision) => void;
  showWomen?: boolean;
}) {
  return (
    <div className={`grid gap-3 ${showWomen ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
      {divisions.filter(([id]) => showWomen || id !== "women").map(([id, division]) => {
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
        if (current.registration?.id === id && current.registration.status === "paid") return;
        setBusy(true);
        try {
          let result: Awaited<ReturnType<typeof submit>> | undefined;
          for (const delay of [5000, 2000, 2000, 2000, 2000]) {
            await new Promise((resolve) => setTimeout(resolve, delay));
            if (!active) return;
            result = await submit({ action: "status", id });
            if (!active) return;
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

  async function act(input: Record<string, unknown>) {
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
        ) : <p role="status">Indlæser tilmelding …</p>}
      </section>
    );
  }

  const entry = data.registration;
  const player = data.players.find((item) => item.id === data.userId);
  const showWomen = isWoman(player?.koen);
  const selectedDivision = division === "women" && !showWomen ? "open" : division;
  const occupied = new Set(data.occupiedPlayers);
  const options = data.players
    .filter((item) => item.id !== data.userId && !occupied.has(item.id) &&
      eligibility(selectedDivision, player?.koen, item.koen))
    .map((item) => ({ value: item.id, label: item.visningsnavn }));
  const selectedPartner = options.find((option) => option.value === partnerId) ?? null;
  const otherPlayerId = entry?.payer_id === data.userId ? entry.partner_id : entry?.payer_id;
  const partnerName = data.players.find((item) => item.id === otherPlayerId)?.visningsnavn;

  function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data?.paymentAvailable || !selectedPartner) return;
    void act({ action: "register", partnerId: selectedPartner.value, division: selectedDivision });
  }

  return (
    <section className="padel-surface space-y-5">
      <h2 className="text-xl font-bold">Tilmelding</h2>
      {data.preview && (
        <p className="text-sm text-[var(--muted)]">Admin-forhåndsvisning. Du kan søge blandt appens spillere og vælge en makker.</p>
      )}
      {data.testPayments && <StatusPill tone="warning">MobilePay-testmiljø</StatusPill>}
      {message && <p role={message.error ? "alert" : "status"} className={message.error ? "font-semibold text-[var(--brand-strong)]" : ""}>{message.text}</p>}
      {entry ? (
        <div className="space-y-3 rounded-2xl border border-[var(--border)] p-4">
          <StatusPill tone={entry.status === "paid" ? "success" : "warning"}>
            {entry.status === "paid" ? "Tilmeldt og betalt" : "Afventer betaling"}
          </StatusPill>
          <dl className="flex flex-wrap gap-x-8 gap-y-2">
            <div>
              <dt className="text-sm text-[var(--muted)]">Din makker</dt>
              <dd className="font-semibold">{partnerName ?? "Spillerprofil"}</dd>
            </div>
            <div>
              <dt className="text-sm text-[var(--muted)]">Jeres række</dt>
              <dd className="font-semibold">{PARTNER_DIVISIONS[entry.division].name}</dd>
            </div>
          </dl>
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
      ) : data.open ? (
        <form onSubmit={register} className="space-y-5">
          <fieldset className="space-y-2" disabled={busy}>
            <legend className="text-sm font-semibold">Række</legend>
            <DivisionOptions showWomen={showWomen} selected={selectedDivision}
              onSelect={(value) => { setDivision(value); setPartnerId(""); }} />
          </fieldset>
          <div className="space-y-1.5">
            <label htmlFor="makkerliga-partner" className="block text-sm font-semibold">Makker</label>
            <Select inputId="makkerliga-partner" instanceId="makkerliga-partner"
              options={options} value={selectedPartner}
              onChange={(option) => setPartnerId(option?.value ?? "")}
              isSearchable isClearable isDisabled={busy}
              placeholder="Skriv navnet på din makker"
              noOptionsMessage={() => options.length ? "Ingen spillere matcher din søgning" : "Ingen ledige makkere i denne række"}
              theme={(theme) => ({
                ...theme,
                borderRadius: 12,
                colors: {
                  ...theme.colors,
                  primary: "var(--brand-strong)",
                  primary25: "var(--surface)",
                  neutral0: "var(--surface-strong)",
                  neutral20: "var(--border)",
                  neutral50: "var(--muted)",
                  neutral80: "var(--foreground)",
                },
              })}
            />
          </div>
          <button type="submit" className={button} disabled={busy || !selectedPartner || !data.paymentAvailable}>
            {busy ? "Vent et øjeblik …" : "Betal 200 kr. med MobilePay"}
          </button>
        </form>
      ) : <p>Tilmeldingen er lukket.</p>}
      {!data.paymentAvailable && entry?.status !== "paid" && (data.open || entry) && (
        <p role="status" className="text-sm">MobilePay er endnu ikke tilgængelig.</p>
      )}
    </section>
  );
}
