"use client";

import { type FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Select from "react-select";
import { StatusPill } from "../components/ui";
import {
  isWoman, partnerMobilePayLink, PARTNER_DIVISIONS, UUID_PATTERN, type PartnerDivision,
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

function DivisionOptions({ selected, onSelect, available }: {
  selected: PartnerDivision;
  onSelect: (value: PartnerDivision) => void;
  available: PartnerDivision[];
}) {
  return (
    <div className={`grid gap-3 ${available.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
      {divisions.filter(([id]) => available.includes(id)).map(([id, division]) => {
        const style = `block rounded-2xl border px-4 py-4 ${selected === id
          ? "border-[var(--brand)] bg-[var(--surface-strong)]"
          : "border-[var(--border)]"}`;
        return (
          <label key={id} className={`${style} cursor-pointer focus-within:outline focus-within:outline-[var(--brand)]`}>
            <input type="radio" name="division" value={id} checked={selected === id}
              onChange={() => onSelect(id)} className="float-right accent-[var(--brand)]" />
            <span className="block text-base font-bold">{division.name}</span>
            <span className="mt-1 block text-sm text-[var(--muted)]">{division.description}</span>
          </label>
        );
      })}
    </div>
  );
}

export function TournamentSignup() {
  const router = useRouter();
  const [data, setData] = useState<TournamentSignupData | null>();
  const [contactPhone, setContactPhone] = useState("");
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
        if (current.registrations.some((entry) => entry.id === id && entry.status === "paid")) return;
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
          if (result?.status === "paid") router.refresh();
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
  }, [router]);

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
      if (result.status === "pending") setMessage({ text: "I er tilmeldt. Betal 200 kr. til MobilePay 102438 og skriv begge spillernes navne. Vi bekræfter betalingen manuelt." });
      if (result.status === "pending" && input.action === "register") {
        setData(await loadSignup());
        setBusy(false);
        const names = [data?.userId, input.partnerId].map((id) => data?.players.find((player) => player.id === id)?.visningsnavn ?? "");
        window.location.assign(partnerMobilePayLink(names));
        redirecting = true;
        return;
      }
      if (result.status === "paid") router.refresh();
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

  if (data === null) return <Link href="/login?makkerrangliste=1" className={button}>Log ind for at tilmelde jer</Link>;
  if (loadError) {
    return <p role="alert">{loadError} <button type="button" className="underline" onClick={() => location.reload()}>Prøv igen</button></p>;
  }
  if (!data) return <p role="status">Indlæser tilmelding …</p>;

  const player = data.players.find((item) => item.id === data.userId);
  const showWomen = isWoman(player?.koen);
  const available = divisions.map(([id]) => id).filter((id) =>
    (id !== "women" || showWomen) && !data.registrations.some((entry) => entry.division === id));
  const selectedDivision = available.includes(division) ? division : available[0];
  const occupied = new Set(selectedDivision ? data.occupiedPlayers[selectedDivision] : []);
  const options = data.players
    .filter((item) => item.id !== data.userId && !occupied.has(item.id) &&
      selectedDivision && eligibility(selectedDivision, player?.koen, item.koen))
    .map((item) => ({ value: item.id, label: item.visningsnavn }));
  const selectedPartner = options.find((option) => option.value === partnerId) ?? null;

  function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data?.paymentAvailable || !selectedPartner || !selectedDivision) return;
    void act({ action: "register", partnerId: selectedPartner.value, division: selectedDivision, contactPhone });
  }

  return (
    <>
      {data.testPayments && <StatusPill tone="warning">MobilePay-testmiljø</StatusPill>}
      {message && <p role={message.error ? "alert" : "status"} className={message.error ? "font-semibold text-[var(--brand-strong)]" : ""}>{message.text}</p>}
      {data.registrations.map((entry) => {
        const otherPlayerId = entry.payer_id === data.userId ? entry.partner_id : entry.payer_id;
        const partnerName = data.players.find((item) => item.id === otherPlayerId)?.visningsnavn;
        return (
          <div key={entry.id} className="space-y-3 rounded-2xl border border-[var(--border)] p-4">
            <StatusPill tone={entry.status === "paid" ? "success" : "warning"}>
              {entry.status === "paid" ? "Tilmeldt og betalt" : "Tilmeldt – afventer betaling"}
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
            {entry.contact_phone && <p className="text-sm">Kontaktpersonens telefon: {entry.contact_phone}</p>}
            {entry.status === "pending" && (
              <div className="space-y-3">
                <p className="text-sm">Betal <strong>200 kr. pr. par til MobilePay 102438</strong>. Skriv begge spillernes navne i beskeden. Har I allerede betalt, skal I ikke betale igen – vi bekræfter betalingen manuelt.</p>
                <a className={button} href={partnerMobilePayLink([entry.payer_id, entry.partner_id].map((id) => data.players.find((player) => player.id === id)?.visningsnavn ?? ""))}>Åbn MobilePay – 200 kr.</a>
              </div>
            )}
          </div>
        );
      })}
      {data.open && selectedDivision ? (
        <form onSubmit={register} className="space-y-5">
          <fieldset className="space-y-2" disabled={busy}>
            <legend className="text-sm font-semibold">Række</legend>
            <DivisionOptions available={available} selected={selectedDivision}
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
          <div className="space-y-1.5">
            <label htmlFor="makkerliga-phone" className="block text-sm font-semibold">Dit tlf. nr.</label>
            <input id="makkerliga-phone" type="tel" autoComplete="tel" required maxLength={25}
              value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} disabled={busy}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-strong)] p-3" placeholder="Fx 12345678" />
            <p className="text-sm text-[var(--muted)]">Du bliver parrets kontaktperson. Nummeret vises til holdene i jeres pulje, så I kan aftale kampe.</p>
          </div>
          <p className="text-sm">Når holdet er tilmeldt, åbner vi MobilePay med <strong>200 kr. pr. par til MobilePay 102438</strong>. Kontrollér beløb og begge spillernes navne, før I godkender betalingen.</p>
          <button type="submit" className={button} disabled={busy || !selectedPartner || !contactPhone.trim() || !data.paymentAvailable}>
            {busy ? "Vent et øjeblik …" : "Tilmeld og åbn MobilePay – 200 kr."}
          </button>
        </form>
      ) : !data.open && <p>Tilmeldingen er lukket.</p>}
      {!data.paymentAvailable && ((data.open && selectedDivision) || data.registrations.some((entry) => entry.status === "pending")) && (
        <p role="status" className="text-sm">{data.preview ? "Forhåndsvisning. Tilmeldingen åbner senere." : "MobilePay er endnu ikke tilgængelig."}</p>
      )}
    </>
  );
}
